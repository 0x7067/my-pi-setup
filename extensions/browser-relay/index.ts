import { randomBytes } from "node:crypto";
import { open, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ImageContent } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type, type Static } from "typebox";
import { formatAccessibilitySnapshot } from "./src/ax.ts";
import type { BrowserTab, RelayCommand, RelayHealth } from "./src/protocol.ts";
import { BrowserRelayServer, relayCommand, relayHealth } from "./src/server.ts";

const DEFAULT_PORT = 9234;
const TOKEN_PATH = join(homedir(), ".pi", "agent", "browser-relay.key");
const EXTENSION_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "chrome-extension",
);
const MAX_TOOL_JSON_BYTES = 1024 * 1024;

const operation = Type.Union([
  Type.Literal("tabs"),
  Type.Literal("snapshot"),
  Type.Literal("navigate"),
  Type.Literal("click"),
  Type.Literal("type"),
  Type.Literal("press"),
  Type.Literal("scroll"),
  Type.Literal("evaluate"),
  Type.Literal("screenshot"),
  Type.Literal("cdp"),
  Type.Literal("events"),
  Type.Literal("newTab"),
  Type.Literal("activateTab"),
  Type.Literal("closeTab"),
]);

const parameters = Type.Object({
  operation,
  tabId: Type.Optional(
    Type.Integer({
      minimum: 0,
      description:
        "Exact tab ID returned by tabs. Required for page-changing operations.",
    }),
  ),
  url: Type.Optional(
    Type.String({ description: "HTTP(S) URL for navigate or newTab" }),
  ),
  nodeId: Type.Optional(
    Type.Integer({
      minimum: 1,
      description: "backend node ID from the latest snapshot",
    }),
  ),
  text: Type.Optional(Type.String({ description: "Text for type" })),
  clear: Type.Optional(
    Type.Boolean({ description: "Clear an input before typing into it" }),
  ),
  key: Type.Optional(
    Type.String({ description: "Key for press, such as Enter" }),
  ),
  deltaY: Type.Optional(
    Type.Number({ description: "Vertical CSS pixels for scroll" }),
  ),
  expression: Type.Optional(
    Type.String({ description: "JavaScript expression for evaluate" }),
  ),
  fullPage: Type.Optional(
    Type.Boolean({ description: "Capture the full document in screenshot" }),
  ),
  method: Type.Optional(
    Type.String({
      minLength: 1,
      maxLength: 256,
      description: "Chrome DevTools Protocol method for cdp",
    }),
  ),
  params: Type.Optional(
    Type.Record(Type.String(), Type.Unknown(), {
      description: "Chrome DevTools Protocol parameters for cdp",
    }),
  ),
  methodPrefix: Type.Optional(
    Type.String({
      description:
        "Optional debugger-event method prefix, such as Network. or Runtime.",
    }),
  ),
  limit: Type.Optional(
    Type.Integer({
      minimum: 1,
      maximum: 200,
      description: "Maximum debugger events to return (default 100)",
    }),
  ),
});

type Input = Static<typeof parameters>;

interface BrowserRelayDetails {
  operation: Input["operation"];
  tabId?: number;
  connected: boolean;
}

function configuredPort() {
  const value = Number(process.env.PI_BROWSER_RELAY_PORT ?? DEFAULT_PORT);
  if (!Number.isInteger(value) || value < 1 || value > 65_535) {
    throw new Error("PI_BROWSER_RELAY_PORT must be an integer from 1 to 65535");
  }
  return value;
}

async function relayToken() {
  let existing: string | undefined;
  try {
    existing = (await readFile(TOKEN_PATH, "utf8")).trim();
  } catch (error) {
    if (
      !error ||
      typeof error !== "object" ||
      !("code" in error) ||
      error.code !== "ENOENT"
    ) {
      throw error;
    }
  }
  if (existing !== undefined) {
    if (existing.length < 32)
      throw new Error("Stored browser relay token is invalid");
    return existing;
  }

  const token = randomBytes(32).toString("base64url");
  try {
    const file = await open(TOKEN_PATH, "wx", 0o600);
    try {
      await file.writeFile(`${token}\n`, "utf8");
    } finally {
      await file.close();
    }
    return token;
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "EEXIST"
    ) {
      const racedToken = (await readFile(TOKEN_PATH, "utf8")).trim();
      if (racedToken.length < 32)
        throw new Error("Stored browser relay token is invalid");
      return racedToken;
    }
    throw error;
  }
}

function requireNumber(value: number | undefined, name: string) {
  if (value === undefined)
    throw new Error(`${name} is required for this operation`);
  return value;
}

function requireString(value: string | undefined, name: string) {
  if (!value) throw new Error(`${name} is required for this operation`);
  return value;
}

function asTabs(value: unknown) {
  if (!value || typeof value !== "object" || !("tabs" in value)) {
    throw new Error("Chrome relay returned an invalid tab list");
  }
  return (value as { tabs: BrowserTab[] }).tabs;
}

function asRecord(value: unknown) {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

export function jsonText(value: unknown) {
  const result = JSON.stringify(value, null, 2) ?? "null";
  if (Buffer.byteLength(result, "utf8") > MAX_TOOL_JSON_BYTES) {
    throw new Error(
      "Browser relay result exceeds 1 MiB. Use a narrower CDP query or event filter.",
    );
  }
  return result;
}

function keyDescription(key: string) {
  const special: Record<string, { code: string; keyCode: number }> = {
    Enter: { code: "Enter", keyCode: 13 },
    Tab: { code: "Tab", keyCode: 9 },
    Escape: { code: "Escape", keyCode: 27 },
    Backspace: { code: "Backspace", keyCode: 8 },
    Delete: { code: "Delete", keyCode: 46 },
    ArrowUp: { code: "ArrowUp", keyCode: 38 },
    ArrowDown: { code: "ArrowDown", keyCode: 40 },
    ArrowLeft: { code: "ArrowLeft", keyCode: 37 },
    ArrowRight: { code: "ArrowRight", keyCode: 39 },
  };
  const known = special[key];
  return {
    key,
    code: known?.code ?? (key.length === 1 ? `Key${key.toUpperCase()}` : key),
    windowsVirtualKeyCode:
      known?.keyCode ??
      (key.length === 1 ? key.toUpperCase().charCodeAt(0) : 0),
    nativeVirtualKeyCode:
      known?.keyCode ??
      (key.length === 1 ? key.toUpperCase().charCodeAt(0) : 0),
    text: key.length === 1 ? key : undefined,
  };
}

function delay(milliseconds: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const timeout = setTimeout(resolve, milliseconds);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timeout);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}

export default function browserRelay(pi: ExtensionAPI) {
  let owner: BrowserRelayServer | undefined;
  let starting: Promise<void> | undefined;
  let shuttingDown = false;

  async function ensureRelay() {
    if (shuttingDown) throw new Error("Browser relay is shutting down");
    const port = configuredPort();
    const token = await relayToken();
    try {
      return { port, token, health: await relayHealth(port, token) };
    } catch (error) {
      if (error instanceof Error && error.message.includes("different service"))
        throw error;
    }

    if (shuttingDown) throw new Error("Browser relay is shutting down");
    if (starting) {
      await starting;
      return { port, token, health: await relayHealth(port, token) };
    }

    const server = new BrowserRelayServer(token, port);
    const startup = (async () => {
      try {
        await server.start();
        if (shuttingDown) throw new Error("Browser relay is shutting down");
        owner = server;
      } catch (error) {
        await server.close();
        if (
          error &&
          typeof error === "object" &&
          "code" in error &&
          error.code === "EADDRINUSE"
        ) {
          await delay(100);
          return;
        }
        throw error;
      }
    })();
    starting = startup;
    try {
      await startup;
    } finally {
      if (starting === startup) starting = undefined;
    }
    return { port, token, health: await relayHealth(port, token) };
  }

  async function command(commandValue: RelayCommand, signal?: AbortSignal) {
    const { port, token } = await ensureRelay();
    return await relayCommand(port, token, commandValue, signal);
  }

  async function tabs(signal?: AbortSignal) {
    return asTabs(await command({ action: "tabs" }, signal));
  }

  async function tab(tabId: number, signal?: AbortSignal) {
    const found = (await tabs(signal)).find((item) => item.id === tabId);
    if (!found)
      throw new Error(`Tab ${tabId} is no longer available. List tabs again.`);
    return found;
  }

  async function cdp(
    tabId: number,
    method: string,
    params?: Record<string, unknown>,
    signal?: AbortSignal,
  ) {
    return await command({ action: "cdp", tabId, method, params }, signal);
  }

  async function snapshot(tabId: number, signal?: AbortSignal) {
    await cdp(tabId, "Accessibility.enable", undefined, signal);
    const result = await cdp(
      tabId,
      "Accessibility.getFullAXTree",
      undefined,
      signal,
    );
    return formatAccessibilitySnapshot(result, await tab(tabId, signal));
  }

  async function postcondition(tabId: number, signal?: AbortSignal) {
    await delay(300, signal);
    return await snapshot(tabId, signal);
  }

  async function waitForPage(tabId: number, signal?: AbortSignal) {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const state = asRecord(
        await cdp(
          tabId,
          "Runtime.evaluate",
          { expression: "document.readyState", returnByValue: true },
          signal,
        ),
      );
      if (asRecord(state.result).value === "complete") return;
      await delay(250, signal);
    }
  }

  pi.registerCommand("browser-relay", {
    description: "Set up or inspect the authenticated Chrome browser relay",
    getArgumentCompletions: (prefix) => {
      const options = ["setup", "status", "token"]
        .filter((value) => value.startsWith(prefix))
        .map((value) => ({ value, label: value }));
      return options.length > 0 ? options : null;
    },
    handler: async (args, ctx) => {
      const action = args.trim() || "status";
      if (!new Set(["setup", "status", "token"]).has(action)) {
        ctx.ui.notify("Usage: /browser-relay [setup|status|token]", "error");
        return;
      }
      const state = await ensureRelay();
      if (action === "token") {
        ctx.ui.notify(
          `Browser relay token (keep private):\n${state.token}`,
          "info",
        );
        return;
      }
      if (action === "setup") {
        ctx.ui.notify(
          [
            "1. Open chrome://extensions and enable Developer mode.",
            `2. Choose Load unpacked and select:\n${EXTENSION_DIR}`,
            `3. Open the extension options and paste this private token:\n${state.token}`,
            `Relay address: 127.0.0.1:${state.port}`,
          ].join("\n\n"),
          "info",
        );
        return;
      }
      ctx.ui.notify(
        `Browser relay: ${state.health.connected ? "Chrome connected" : "waiting for Chrome"} on 127.0.0.1:${state.port}`,
        state.health.connected ? "info" : "warning",
      );
    },
  });

  pi.registerTool<typeof parameters, BrowserRelayDetails>({
    name: "browser-relay",
    label: "Browser Relay",
    description:
      "Inspect and control an explicitly shared, logged-in Chrome or Edge tab through the user's loopback-only relay. List tabs first, then use the exact tabId. Ergonomic page-changing operations automatically return a fresh accessibility snapshot; advanced CDP mutations require a separate verification call.",
    promptSnippet:
      "Inspect and control an explicitly selected existing Chrome tab through the local authenticated relay",
    promptGuidelines: [
      "Call browser-relay with operation=tabs before acting, then use the exact tabId returned for every page-changing operation.",
      "Use snapshot before click or type, and address elements with the nodeId from that snapshot.",
      "Use cdp for advanced tab-scoped Chrome DevTools Protocol operations. Enable the relevant domain before polling events; events are bounded and drained by default.",
      "newTab opens and shares a background tab. Existing tabs remain unavailable until the user shares them with the toolbar icon. Use activateTab only when the user explicitly asks to focus that tab.",
      "Do not navigate, click, type, press keys, evaluate JavaScript, use cdp, create/activate/close tabs, or upload files until the user-authorized account, tab, file, and target are clear.",
      "After any mutating cdp call, verify the semantic postcondition with snapshot, tabs, events, or another authoritative read.",
    ],
    executionMode: "sequential",
    parameters,
    async execute(_toolCallId, input, signal) {
      const state = await ensureRelay();
      const details: BrowserRelayDetails = {
        operation: input.operation,
        tabId: input.tabId,
        connected: state.health.connected,
      };

      if (input.operation === "tabs") {
        const available = await tabs(signal);
        return {
          content: [
            {
              type: "text",
              text:
                available.length === 0
                  ? "No attachable Chrome tabs are available."
                  : available
                      .map(
                        (item) =>
                          `${item.id}\t${item.active ? "active" : "background"}\t${item.title || "(untitled)"}\t${item.url}`,
                      )
                      .join("\n"),
            },
          ],
          details,
        };
      }

      if (input.operation === "newTab") {
        const url = new URL(requireString(input.url, "url"));
        if (!new Set(["http:", "https:"]).has(url.protocol)) {
          throw new Error("newTab supports only http and https URLs");
        }
        const created = asRecord(
          await command({ action: "newTab", url: url.href }, signal),
        );
        return {
          content: [
            {
              type: "text",
              text: `Created and shared tab ${String(created.id)} at ${String(created.url)}.`,
            },
          ],
          details: {
            ...details,
            tabId: typeof created.id === "number" ? created.id : details.tabId,
          },
        };
      }

      const tabId = requireNumber(input.tabId, "tabId");
      if (input.operation === "activateTab") {
        await command({ action: "activateTab", tabId }, signal);
        return {
          content: [{ type: "text", text: `Activated tab ${tabId}.` }],
          details,
        };
      }

      if (input.operation === "closeTab") {
        await command({ action: "closeTab", tabId }, signal);
        return {
          content: [{ type: "text", text: `Closed shared tab ${tabId}.` }],
          details,
        };
      }

      if (input.operation === "events") {
        const result = await command(
          {
            action: "events",
            tabId,
            methodPrefix: input.methodPrefix,
            limit: input.limit,
            clear: input.clear,
          },
          signal,
        );
        return {
          content: [{ type: "text", text: jsonText(result) }],
          details,
        };
      }

      if (input.operation === "cdp") {
        const result = await cdp(
          tabId,
          requireString(input.method, "method"),
          input.params,
          signal,
        );
        return {
          content: [{ type: "text", text: jsonText(result) }],
          details,
        };
      }

      if (input.operation === "snapshot") {
        return {
          content: [{ type: "text", text: await snapshot(tabId, signal) }],
          details,
        };
      }

      if (input.operation === "navigate") {
        const url = new URL(requireString(input.url, "url"));
        if (!new Set(["http:", "https:"]).has(url.protocol)) {
          throw new Error("navigate supports only http and https URLs");
        }
        await cdp(tabId, "Page.enable", undefined, signal);
        await command({ action: "navigate", tabId, url: url.href }, signal);
        await waitForPage(tabId, signal);
        return {
          content: [{ type: "text", text: await snapshot(tabId, signal) }],
          details,
        };
      }

      if (input.operation === "click") {
        const nodeId = requireNumber(input.nodeId, "nodeId");
        await cdp(
          tabId,
          "DOM.scrollIntoViewIfNeeded",
          { backendNodeId: nodeId },
          signal,
        );
        const box = asRecord(
          await cdp(
            tabId,
            "DOM.getBoxModel",
            { backendNodeId: nodeId },
            signal,
          ),
        );
        const content = asRecord(box.model).content;
        if (
          !Array.isArray(content) ||
          content.length !== 8 ||
          !content.every((value) => typeof value === "number")
        ) {
          throw new Error(`Node ${nodeId} has no clickable box`);
        }
        const x = (content[0] + content[2] + content[4] + content[6]) / 4;
        const y = (content[1] + content[3] + content[5] + content[7]) / 4;
        await cdp(
          tabId,
          "Input.dispatchMouseEvent",
          {
            type: "mousePressed",
            x,
            y,
            button: "left",
            clickCount: 1,
          },
          signal,
        );
        await cdp(
          tabId,
          "Input.dispatchMouseEvent",
          {
            type: "mouseReleased",
            x,
            y,
            button: "left",
            clickCount: 1,
          },
          signal,
        );
        return {
          content: [{ type: "text", text: await postcondition(tabId, signal) }],
          details,
        };
      }

      if (input.operation === "type") {
        const nodeId = requireNumber(input.nodeId, "nodeId");
        const text = input.text ?? "";
        await cdp(tabId, "DOM.focus", { backendNodeId: nodeId }, signal);
        if (input.clear) {
          const modifiers = process.platform === "darwin" ? 4 : 2;
          await cdp(
            tabId,
            "Input.dispatchKeyEvent",
            {
              type: "keyDown",
              key: "a",
              code: "KeyA",
              modifiers,
              windowsVirtualKeyCode: 65,
              nativeVirtualKeyCode: 65,
            },
            signal,
          );
          await cdp(
            tabId,
            "Input.dispatchKeyEvent",
            {
              type: "keyUp",
              key: "a",
              code: "KeyA",
              modifiers,
              windowsVirtualKeyCode: 65,
              nativeVirtualKeyCode: 65,
            },
            signal,
          );
          for (const type of ["keyDown", "keyUp"]) {
            await cdp(
              tabId,
              "Input.dispatchKeyEvent",
              {
                type,
                key: "Backspace",
                code: "Backspace",
                windowsVirtualKeyCode: 8,
                nativeVirtualKeyCode: 8,
              },
              signal,
            );
          }
        }
        await cdp(tabId, "Input.insertText", { text }, signal);
        return {
          content: [{ type: "text", text: await postcondition(tabId, signal) }],
          details,
        };
      }

      if (input.operation === "press") {
        const key = requireString(input.key, "key");
        const description = keyDescription(key);
        await cdp(
          tabId,
          "Input.dispatchKeyEvent",
          { type: "keyDown", ...description },
          signal,
        );
        await cdp(
          tabId,
          "Input.dispatchKeyEvent",
          { type: "keyUp", ...description },
          signal,
        );
        return {
          content: [{ type: "text", text: await postcondition(tabId, signal) }],
          details,
        };
      }

      if (input.operation === "scroll") {
        const deltaY = input.deltaY ?? 600;
        await cdp(
          tabId,
          "Runtime.evaluate",
          {
            expression: `window.scrollBy({top:${JSON.stringify(deltaY)},behavior:'instant'})`,
            userGesture: true,
          },
          signal,
        );
        return {
          content: [{ type: "text", text: await postcondition(tabId, signal) }],
          details,
        };
      }

      if (input.operation === "evaluate") {
        const expression = requireString(input.expression, "expression");
        const result = asRecord(
          await cdp(
            tabId,
            "Runtime.evaluate",
            {
              expression,
              awaitPromise: true,
              returnByValue: true,
              userGesture: true,
            },
            signal,
          ),
        );
        if (result.exceptionDetails)
          throw new Error(JSON.stringify(result.exceptionDetails));
        const remote = asRecord(result.result);
        const value = "value" in remote ? remote.value : remote.description;
        return {
          content: [
            {
              type: "text",
              text: `${jsonText(value)}\n\n${await postcondition(tabId, signal)}`,
            },
          ],
          details,
        };
      }

      await cdp(tabId, "Page.enable", undefined, signal);
      let capture: Record<string, unknown> = {
        format: "png",
        fromSurface: true,
        captureBeyondViewport: true,
      };
      if (input.fullPage) {
        const metrics = asRecord(
          await cdp(tabId, "Page.getLayoutMetrics", undefined, signal),
        );
        const size = asRecord(metrics.cssContentSize);
        if (typeof size.width === "number" && typeof size.height === "number") {
          capture = {
            ...capture,
            clip: {
              x: 0,
              y: 0,
              width: size.width,
              height: size.height,
              scale: 1,
            },
          };
        }
      }
      const result = asRecord(
        await cdp(tabId, "Page.captureScreenshot", capture, signal),
      );
      if (typeof result.data !== "string")
        throw new Error("Chrome returned no screenshot data");
      const image: ImageContent = {
        type: "image",
        data: result.data,
        mimeType: "image/png",
      };
      return {
        content: [{ type: "text", text: `Captured tab ${tabId}.` }, image],
        details,
      };
    },
  });

  pi.on("session_shutdown", async () => {
    shuttingDown = true;
    const startup = starting;
    const server = owner;
    owner = undefined;
    await startup?.catch(() => undefined);
    await server?.close();
  });
}
