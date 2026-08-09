import assert from "node:assert/strict";
import { createHmac, randomBytes } from "node:crypto";
import test from "node:test";
import { WebSocket } from "ws";
import { BrowserRelayServer, relayCommand, relayHealth } from "./src/server.ts";

function proof(token: string, role: "client" | "server", nonce: string) {
  return createHmac("sha256", token)
    .update(`${role}:${nonce}`)
    .digest("base64url");
}

function nextMessage(socket: WebSocket) {
  return new Promise<Record<string, unknown>>((resolve, reject) => {
    socket.once("message", (data) => {
      try {
        resolve(JSON.parse(data.toString()) as Record<string, unknown>);
      } catch (error) {
        reject(error);
      }
    });
    socket.once("error", reject);
  });
}

async function authenticate(socket: WebSocket, token: string) {
  await new Promise<void>((resolve, reject) => {
    socket.once("open", resolve);
    socket.once("error", reject);
  });
  const clientNonce = randomBytes(32).toString("base64url");
  socket.send(JSON.stringify({ type: "hello", clientNonce }));
  const challenge = await nextMessage(socket);
  assert.equal(challenge.type, "challenge");
  assert.equal(
    challenge.serverProof,
    proof(token, "server", clientNonce),
    "the extension authenticates the server before disclosing a client proof",
  );
  assert.equal(typeof challenge.serverNonce, "string");
  socket.send(
    JSON.stringify({
      type: "authenticate",
      clientProof: proof(token, "client", String(challenge.serverNonce)),
    }),
  );
  assert.equal((await nextMessage(socket)).type, "ready");
}

function answerCommands(socket: WebSocket) {
  socket.on("message", (data) => {
    const request = JSON.parse(data.toString()) as { id?: string };
    if (!request.id) return;
    socket.send(
      JSON.stringify({ id: request.id, ok: true, result: { tabs: [] } }),
    );
  });
}

test("mutually authenticates without sending the token and protects the command API", async (context) => {
  const token = "test-token-that-is-long-enough-for-auth";
  const server = new BrowserRelayServer(token, 0);
  await server.start();
  context.after(() => server.close());

  const socket = new WebSocket(`ws://127.0.0.1:${server.port}/extension`);
  context.after(() => socket.close());
  await authenticate(socket, token);
  answerCommands(socket);

  assert.equal((await relayHealth(server.port, token)).connected, true);
  assert.deepEqual(await relayCommand(server.port, token, { action: "tabs" }), {
    tabs: [],
  });

  const unauthorized = await fetch(`http://127.0.0.1:${server.port}/command`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "tabs" }),
  });
  assert.equal(unauthorized.status, 401);
});

test("rejects a lookalike health endpoint before sending a command secret", async (context) => {
  const token = "health-token-that-is-long-enough";
  const server = new BrowserRelayServer(
    "different-token-that-is-long-enough",
    0,
  );
  await server.start();
  context.after(() => server.close());

  await assert.rejects(
    relayHealth(server.port, token),
    /occupied by a different service/,
  );
});

test("rejects replayed and expired signed HTTP commands", async (context) => {
  const token = "replay-token-that-is-long-enough";
  const server = new BrowserRelayServer(token, 0);
  await server.start();
  context.after(() => server.close());
  const body = JSON.stringify({ action: "tabs" });
  const send = async (nonce: string) =>
    await fetch(`http://127.0.0.1:${server.port}/command`, {
      method: "POST",
      headers: {
        authorization: `HMAC ${createHmac("sha256", token)
          .update(`command:${nonce}:${body}`)
          .digest("base64url")}`,
        "content-type": "application/json",
        "x-pi-relay-nonce": nonce,
      },
      body,
    });

  const currentNonce = `${Date.now()}.current`;
  assert.equal((await send(currentNonce)).status, 503);
  assert.equal((await send(currentNonce)).status, 401);
  assert.equal((await send(`${Date.now() - 61_000}.expired`)).status, 401);
});

test("a stale socket close cannot reject work on its replacement", async (context) => {
  const token = "replacement-token-that-is-long-enough";
  const server = new BrowserRelayServer(token, 0);
  await server.start();
  context.after(() => server.close());

  const first = new WebSocket(`ws://127.0.0.1:${server.port}/extension`);
  context.after(() => first.close());
  await authenticate(first, token);

  const second = new WebSocket(`ws://127.0.0.1:${server.port}/extension`);
  context.after(() => second.close());
  await authenticate(second, token);
  answerCommands(second);

  assert.deepEqual(await relayCommand(server.port, token, { action: "tabs" }), {
    tabs: [],
  });
});

test("shutdown terminates sockets that never authenticate", async () => {
  const server = new BrowserRelayServer(
    "shutdown-token-that-is-long-enough",
    0,
  );
  await server.start();
  const socket = new WebSocket(`ws://127.0.0.1:${server.port}/extension`);
  await new Promise<void>((resolve, reject) => {
    socket.once("open", resolve);
    socket.once("error", reject);
  });

  const clientClosed = new Promise<void>((resolve) =>
    socket.once("close", resolve),
  );
  await Promise.race([
    Promise.all([server.close(), clientClosed]),
    new Promise<never>((_resolve, reject) =>
      setTimeout(() => reject(new Error("relay shutdown timed out")), 500),
    ),
  ]);
  assert.equal(socket.readyState, WebSocket.CLOSED);
});
