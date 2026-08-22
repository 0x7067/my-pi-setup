import assert from "node:assert/strict";
import test from "node:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  containsNonTextInput,
  createCodexCacheKeepaliveExtension,
  reusablePromptTokens,
  validateKeepaliveConfig,
} from "./index.ts";

const config = {
  enabled: true,
  intervalMs: 100,
  maxIdleMs: 300,
  minimumContextTokens: 20_000,
  requestTimeoutMs: 1_000,
};

function fakeRuntime() {
  const handlers = new Map<string, Function[]>();
  const entries: unknown[] = [];
  const timers: Array<{ callback: () => void; delayMs: number }> = [];
  let now = 0;
  const pi = {
    on(event: string, handler: Function) {
      handlers.set(event, [...(handlers.get(event) ?? []), handler]);
    },
    appendEntry(customType: string, data: unknown) {
      entries.push({ customType, data });
    },
  } as unknown as ExtensionAPI;
  const driver = {
    now: () => now,
    setTimeout(callback: () => void, delayMs: number) {
      timers.push({ callback, delayMs });
      return timers.length as unknown as ReturnType<typeof setTimeout>;
    },
    clearTimeout() {},
  };
  return {
    pi,
    handlers,
    entries,
    timers,
    advance(value: number) {
      now += value;
    },
    driver,
  };
}

const codexModel = {
  provider: "openai-codex",
  api: "openai-codex-responses",
  id: "gpt-5.6-luna",
};

test("validates bounded keepalive configuration", () => {
  assert.deepEqual(validateKeepaliveConfig(config), config);
  assert.throws(
    () => validateKeepaliveConfig({ ...config, intervalMs: 300 }),
    /smaller than maxIdleMs/,
  );
});

test("counts reusable prompt tokens and rejects media payloads", () => {
  assert.equal(
    reusablePromptTokens({ input: 800, cacheRead: 24_000 } as never),
    24_800,
  );
  assert.equal(
    containsNonTextInput({ input: [{ type: "input_image" }] }),
    true,
  );
  assert.equal(
    containsNonTextInput({ input: [{ type: "input_text", text: "ok" }] }),
    false,
  );
});

test("refreshes a large idle Codex prompt and schedules one bounded follow-up", async () => {
  const runtime = fakeRuntime();
  createCodexCacheKeepaliveExtension(config, runtime.driver)(runtime.pi);
  let capturedPayload: unknown;
  const ctx = {
    mode: "tui",
    model: codexModel,
    sessionManager: { getSessionId: () => "session-1" },
    isIdle: () => true,
    hasPendingMessages: () => false,
    hasUI: false,
    modelRegistry: {
      async complete(_model: unknown, _context: unknown, options: any) {
        capturedPayload = await options.onPayload({});
        return {
          stopReason: "stop",
          usage: { input: 900, cacheRead: 24_000, output: 5 },
        };
      },
    },
  };
  const payload = {
    model: "gpt-5.6-luna",
    input: [{ type: "message", role: "user", content: [] }],
    tool_choice: "auto",
  };

  await handlers(runtime, "before_provider_request")({ payload }, ctx);
  await handlers(
    runtime,
    "message_end",
  )({
    message: {
      role: "assistant",
      usage: { input: 1_000, cacheRead: 24_000 },
    },
  });
  await handlers(runtime, "agent_settled")({}, ctx);
  assert.equal(runtime.timers.length, 1);
  assert.equal(runtime.timers[0]?.delayMs, 100);

  runtime.advance(100);
  runtime.timers.shift()?.callback();
  await new Promise((resolve) => setImmediate(resolve));

  const refreshed = capturedPayload as typeof payload;
  assert.equal(refreshed.tool_choice, "none");
  assert.equal(refreshed.input.length, 2);
  assert.equal(runtime.entries.length, 1);
  assert.equal(runtime.timers.length, 1);
});

function handlers(runtime: ReturnType<typeof fakeRuntime>, event: string) {
  const handler = runtime.handlers.get(event)?.[0];
  assert.ok(handler, `missing ${event} handler`);
  return handler;
}
