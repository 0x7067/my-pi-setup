import {
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";
import { WebSocket, WebSocketServer } from "ws";
import type {
  RelayCommand,
  RelayHealth,
  RelayRequest,
  RelayResponse,
} from "./protocol.ts";
import { isAllowedCdpMethod } from "../chrome-extension/cdp-policy.js";

const MAX_REQUEST_BYTES = 1024 * 1024;
const MAX_EXTENSION_MESSAGE_BYTES = 8 * 1024 * 1024;
const COMMAND_TIMEOUT_MS = 20_000;
const HANDSHAKE_TIMEOUT_MS = 10_000;
const PROTOCOL_VERSION = 2;

function equalSecret(actual: string, expected: string) {
  const actualBytes = Buffer.from(actual);
  const expectedBytes = Buffer.from(expected);
  return (
    actualBytes.length === expectedBytes.length &&
    timingSafeEqual(actualBytes, expectedBytes)
  );
}

function proof(token: string, role: "client" | "server", nonce: string) {
  return createHmac("sha256", token)
    .update(`${role}:${nonce}`)
    .digest("base64url");
}

function requestProof(
  token: string,
  purpose: "command" | "health",
  nonce: string,
  body = "",
) {
  return createHmac("sha256", token)
    .update(`${purpose}:${nonce}:${body}`)
    .digest("base64url");
}

function json(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, {
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
    "x-content-type-options": "nosniff",
  });
  response.end(JSON.stringify(body));
}

async function readBody(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length;
    if (size > MAX_REQUEST_BYTES) throw new Error("Request body is too large");
    chunks.push(bytes);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function isHttpUrl(value: unknown) {
  if (typeof value !== "string") return false;
  try {
    return new Set(["http:", "https:"]).has(new URL(value).protocol);
  } catch {
    return false;
  }
}

export function isRelayCommand(value: unknown): value is RelayCommand {
  if (!value || typeof value !== "object" || !("action" in value)) return false;
  const command = value as Record<string, unknown>;
  if (command.action === "tabs") return true;
  if (command.action === "newTab") return isHttpUrl(command.url);
  if (command.action === "navigate") {
    return Number.isInteger(command.tabId) && isHttpUrl(command.url);
  }
  if (command.action === "activateTab" || command.action === "closeTab") {
    return Number.isInteger(command.tabId);
  }
  if (command.action === "events") {
    return (
      Number.isInteger(command.tabId) &&
      (command.methodPrefix === undefined ||
        typeof command.methodPrefix === "string") &&
      (command.limit === undefined ||
        (Number.isInteger(command.limit) &&
          Number(command.limit) >= 1 &&
          Number(command.limit) <= 200)) &&
      (command.clear === undefined || typeof command.clear === "boolean")
    );
  }
  return (
    command.action === "cdp" &&
    Number.isInteger(command.tabId) &&
    typeof command.method === "string" &&
    command.method.length > 0 &&
    command.method.length <= 256 &&
    isAllowedCdpMethod(command.method) &&
    (command.params === undefined ||
      (!!command.params &&
        typeof command.params === "object" &&
        !Array.isArray(command.params)))
  );
}

export class BrowserRelayServer {
  readonly #token: string;
  readonly #requestedPort: number;
  readonly #webSockets = new WebSocketServer({
    noServer: true,
    maxPayload: MAX_EXTENSION_MESSAGE_BYTES,
  });
  readonly #pending = new Map<
    string,
    {
      resolve: (value: unknown) => void;
      reject: (error: Error) => void;
      timeout: NodeJS.Timeout;
    }
  >();
  readonly #httpNonces = new Map<string, number>();
  #extension?: WebSocket;
  #server?: ReturnType<typeof createServer>;
  #port = 0;

  constructor(token: string, port: number) {
    this.#token = token;
    this.#requestedPort = port;
  }

  get port() {
    return this.#port;
  }

  get connected() {
    return this.#extension?.readyState === WebSocket.OPEN;
  }

  async start() {
    if (this.#server) return;

    const server = createServer((request, response) => {
      void this.#handleHttp(request, response);
    });
    server.on("upgrade", (request, socket, head) => {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      if (url.pathname !== "/extension") {
        socket.write("HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n");
        socket.destroy();
        return;
      }
      this.#webSockets.handleUpgrade(request, socket, head, (webSocket) => {
        this.#webSockets.emit("connection", webSocket, request);
      });
    });
    this.#webSockets.on("connection", (webSocket) => {
      let authenticated = false;
      let serverNonce = "";
      const handshakeTimeout = setTimeout(
        () => webSocket.close(1008, "Authentication timed out"),
        HANDSHAKE_TIMEOUT_MS,
      );
      handshakeTimeout.unref?.();
      webSocket.on("message", (data) => {
        let message: Record<string, unknown>;
        try {
          message = JSON.parse(data.toString()) as Record<string, unknown>;
        } catch {
          webSocket.close(1008, "Invalid relay message");
          return;
        }
        if (message.type === "ping") return;
        if (authenticated) {
          this.#handleExtensionMessage(message);
          return;
        }
        if (
          message.type === "hello" &&
          message.protocolVersion === PROTOCOL_VERSION &&
          typeof message.clientNonce === "string" &&
          message.clientNonce.length >= 16 &&
          message.clientNonce.length <= 256
        ) {
          serverNonce = randomBytes(32).toString("base64url");
          webSocket.send(
            JSON.stringify({
              type: "challenge",
              serverNonce,
              serverProof: proof(this.#token, "server", message.clientNonce),
            }),
          );
          return;
        }
        if (
          message.type !== "authenticate" ||
          !serverNonce ||
          typeof message.clientProof !== "string" ||
          !equalSecret(
            message.clientProof,
            proof(this.#token, "client", serverNonce),
          )
        ) {
          webSocket.close(1008, "Authentication failed");
          return;
        }

        clearTimeout(handshakeTimeout);
        authenticated = true;
        const previous = this.#extension;
        if (previous && previous !== webSocket) {
          this.#rejectPending(
            new Error("Chrome relay connection was replaced"),
          );
          previous.close(1012, "A newer Chrome relay connected");
        }
        this.#extension = webSocket;
        webSocket.send(JSON.stringify({ type: "ready" }));
      });
      webSocket.on("close", () => {
        clearTimeout(handshakeTimeout);
        if (this.#extension !== webSocket) return;
        this.#extension = undefined;
        this.#rejectPending(new Error("Chrome relay disconnected"));
      });
      webSocket.on("error", () => undefined);
    });

    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error) => {
        server.off("listening", onListening);
        reject(error);
      };
      const onListening = () => {
        server.off("error", onError);
        resolve();
      };
      server.once("error", onError);
      server.once("listening", onListening);
      server.listen(this.#requestedPort, "127.0.0.1");
    });

    this.#server = server;
    this.#port = (server.address() as AddressInfo).port;
  }

  async close() {
    this.#rejectPending(new Error("Browser relay stopped"));
    this.#extension = undefined;
    for (const client of this.#webSockets.clients) client.terminate();
    const webSocketsClosed = new Promise<void>((resolve) => {
      this.#webSockets.close(() => resolve());
    });
    const server = this.#server;
    this.#server = undefined;
    const httpClosed = server
      ? new Promise<void>((resolve) => server.close(() => resolve()))
      : Promise.resolve();
    await Promise.all([webSocketsClosed, httpClosed]);
  }

  async command(command: RelayCommand) {
    const extension = this.#extension;
    if (!extension || extension.readyState !== WebSocket.OPEN) {
      throw new Error(
        "Chrome relay is not connected. Run /browser-relay setup and load the companion extension.",
      );
    }

    const id = randomUUID();
    const request: RelayRequest = { id, command };
    return await new Promise<unknown>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.#pending.delete(id);
        reject(
          new Error(`Chrome relay timed out after ${COMMAND_TIMEOUT_MS}ms`),
        );
      }, COMMAND_TIMEOUT_MS);
      this.#pending.set(id, { resolve, reject, timeout });
      extension.send(JSON.stringify(request), (error) => {
        if (!error) return;
        const pending = this.#pending.get(id);
        if (!pending) return;
        clearTimeout(pending.timeout);
        this.#pending.delete(id);
        pending.reject(error);
      });
    });
  }

  async #handleHttp(request: IncomingMessage, response: ServerResponse) {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    if (request.method === "GET" && url.pathname === "/health") {
      const nonce = url.searchParams.get("nonce") ?? "";
      if (nonce.length < 16 || nonce.length > 256) {
        json(response, 400, { error: "Invalid health nonce" });
        return;
      }
      const health: RelayHealth = {
        name: "pi-browser-relay",
        version: PROTOCOL_VERSION,
        connected: this.connected,
        proof: requestProof(this.#token, "health", nonce),
      };
      json(response, 200, health);
      return;
    }

    if (request.method !== "POST" || url.pathname !== "/command") {
      json(response, 404, { error: "Not found" });
      return;
    }
    try {
      const body = await readBody(request);
      const nonce = String(request.headers["x-pi-relay-nonce"] ?? "");
      const now = Date.now();
      for (const [knownNonce, expiresAt] of this.#httpNonces) {
        if (expiresAt < now) this.#httpNonces.delete(knownNonce);
      }
      const timestamp = Number(nonce.slice(0, nonce.indexOf(".")));
      const authorization = request.headers.authorization ?? "";
      const signature = authorization.startsWith("HMAC ")
        ? authorization.slice("HMAC ".length)
        : "";
      if (
        nonce.length < 16 ||
        nonce.length > 256 ||
        !Number.isFinite(timestamp) ||
        Math.abs(now - timestamp) > 60_000 ||
        this.#httpNonces.has(nonce) ||
        !equalSecret(
          signature,
          requestProof(this.#token, "command", nonce, body),
        )
      ) {
        json(response, 401, { error: "Unauthorized" });
        return;
      }
      this.#httpNonces.set(nonce, Math.max(now, timestamp) + 60_000);
      const command = JSON.parse(body) as unknown;
      if (!isRelayCommand(command)) {
        json(response, 400, { error: "Invalid relay command" });
        return;
      }
      json(response, 200, { result: await this.command(command) });
    } catch (error) {
      json(response, 503, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  #handleExtensionMessage(value: Record<string, unknown>) {
    let response: RelayResponse;
    response = value as unknown as RelayResponse;
    if (!response || typeof response.id !== "string") return;
    const pending = this.#pending.get(response.id);
    if (!pending) return;
    clearTimeout(pending.timeout);
    this.#pending.delete(response.id);
    if (response.ok) pending.resolve(response.result);
    else pending.reject(new Error(response.error));
  }

  #rejectPending(error: Error) {
    for (const pending of this.#pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.#pending.clear();
  }
}

export async function relayHealth(
  port: number,
  token: string,
  signal?: AbortSignal,
) {
  const nonce = `${Date.now()}.${randomBytes(32).toString("base64url")}`;
  const response = await fetch(
    `http://127.0.0.1:${port}/health?nonce=${encodeURIComponent(nonce)}`,
    { signal },
  );
  if (!response.ok) throw new Error(`Relay health returned ${response.status}`);
  const value = (await response.json()) as Partial<RelayHealth>;
  if (
    value.name !== "pi-browser-relay" ||
    value.version !== PROTOCOL_VERSION ||
    typeof value.proof !== "string" ||
    !equalSecret(value.proof, requestProof(token, "health", nonce))
  ) {
    throw new Error(`Port ${port} is occupied by a different service`);
  }
  return value as RelayHealth;
}

export async function relayCommand(
  port: number,
  token: string,
  command: RelayCommand,
  signal?: AbortSignal,
) {
  const requestBody = JSON.stringify(command);
  const nonce = `${Date.now()}.${randomBytes(32).toString("base64url")}`;
  const response = await fetch(`http://127.0.0.1:${port}/command`, {
    method: "POST",
    headers: {
      authorization: `HMAC ${requestProof(token, "command", nonce, requestBody)}`,
      "content-type": "application/json",
      "x-pi-relay-nonce": nonce,
    },
    body: requestBody,
    signal,
  });
  const responseBody = (await response.json()) as {
    result?: unknown;
    error?: string;
  };
  if (!response.ok)
    throw new Error(responseBody.error ?? `Relay returned ${response.status}`);
  return responseBody.result;
}
