import assert from "node:assert/strict";
import test from "node:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  addCodexStablePrefixBreakpoint,
  affinityHeader,
  alignCodexPromptCacheKey,
  CODEX_CACHE_BREAKPOINT_ENV,
  CODEX_CACHE_BREAKPOINT_TEXT,
  CODEX_CACHE_REFRESH_TEXT,
  codexCacheBreakpointEnabled,
  codexCacheIdentityHeaders,
  createCodexCacheRefreshPayload,
  createPromptCacheExtension,
  LONG_RETENTION_PROVIDERS,
  withLongCacheRetention,
} from "./index.ts";

type RegisteredProvider = {
  name: string;
  config: { api?: string; streamSimple?: Function; models?: unknown };
};

function fakePi() {
  const providers: RegisteredProvider[] = [];
  const handlers = new Map<string, Function[]>();
  const pi = {
    registerProvider(name: string, config: RegisteredProvider["config"]) {
      providers.push({ name, config });
    },
    on(event: string, handler: Function) {
      handlers.set(event, [...(handlers.get(event) ?? []), handler]);
    },
  } as unknown as ExtensionAPI;
  return { pi, providers, handlers };
}

test("withLongCacheRetention defaults to long and preserves explicit none", () => {
  assert.equal(withLongCacheRetention(undefined).cacheRetention, "long");
  assert.equal(
    withLongCacheRetention({ cacheRetention: "none" }).cacheRetention,
    "none",
  );
  const options = { apiKey: "k", sessionId: "s" };
  const result = withLongCacheRetention(options);
  assert.equal(result.apiKey, "k");
  assert.equal(result.sessionId, "s");
  assert.notEqual(result, options);
});

test("registers stream wrappers only for long-retention providers, without models", () => {
  const calls: unknown[][] = [];
  const stream = ((...args: unknown[]) => {
    calls.push(args);
    return "stream" as never;
  }) as never;
  const { pi, providers } = fakePi();
  createPromptCacheExtension(stream)(pi);

  assert.deepEqual(
    providers.map(({ name }) => name).sort(),
    Object.keys(LONG_RETENTION_PROVIDERS).sort(),
  );
  for (const { name, config } of providers) {
    assert.equal(config.api, LONG_RETENTION_PROVIDERS[name]);
    assert.equal(config.models, undefined);
    assert.equal(typeof config.streamSimple, "function");
  }

  const openrouter = providers.find(({ name }) => name === "openrouter")!;
  const model = { id: "anthropic/claude", api: "openai-completions" };
  openrouter.config.streamSimple!(model, { messages: [] }, { apiKey: "k" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], model);
  assert.deepEqual(calls[0][2], { apiKey: "k", cacheRetention: "long" });
});

test("affinity header applies only to providers keyed by header", () => {
  assert.deepEqual(affinityHeader("xai", "session-1"), {
    name: "x-grok-conv-id",
    value: "session-1",
  });
  assert.equal(affinityHeader("deepseek", "session-1"), undefined);
  assert.equal(affinityHeader(undefined, "session-1"), undefined);
  assert.equal(affinityHeader("xai", ""), undefined);
});

const codexModel = {
  provider: "openai-codex",
  api: "openai-codex-responses",
  id: "gpt-5.6-luna",
};

test("Codex cache identity uses one stable value in every routing header", () => {
  assert.deepEqual(codexCacheIdentityHeaders(codexModel, "session-1"), {
    "session-id": "session-1",
    "thread-id": "session-1",
    "x-client-request-id": "session-1",
  });
  assert.deepEqual(
    codexCacheIdentityHeaders({ ...codexModel, provider: "openai" }, "s"),
    {},
  );
});

test("Codex payload cache key matches the session identity", () => {
  const payload = { model: "gpt-5.6-luna", prompt_cache_key: "old" };
  assert.deepEqual(alignCodexPromptCacheKey(payload, codexModel, "session-1"), {
    model: "gpt-5.6-luna",
    prompt_cache_key: "session-1",
  });
  assert.equal(alignCodexPromptCacheKey(payload, codexModel, ""), payload);
});

test("Codex breakpoint adds one stable developer boundary for GPT-5.6", () => {
  const payload = {
    model: "gpt-5.6-luna",
    input: [{ type: "message", role: "user", content: [] }],
  };
  const result = addCodexStablePrefixBreakpoint(
    payload,
    codexModel,
  ) as typeof payload;
  assert.equal(result.input.length, 2);
  assert.deepEqual(result.input[0], {
    type: "message",
    role: "developer",
    content: [
      {
        type: "input_text",
        text: CODEX_CACHE_BREAKPOINT_TEXT,
        prompt_cache_breakpoint: { mode: "explicit" },
      },
    ],
  });
  assert.equal(addCodexStablePrefixBreakpoint(result, codexModel), result);
  assert.equal(
    addCodexStablePrefixBreakpoint(payload, {
      ...codexModel,
      id: "gpt-5.5",
    }),
    payload,
  );
});

test("Codex breakpoint feature flag is explicit", () => {
  assert.equal(codexCacheBreakpointEnabled({}), false);
  assert.equal(
    codexCacheBreakpointEnabled({ [CODEX_CACHE_BREAKPOINT_ENV]: "true" }),
    true,
  );
});

test("Codex refresh appends a no-tool suffix without changing the prefix", () => {
  const originalInput = [{ type: "message", role: "user", content: [] }];
  const payload = {
    model: "gpt-5.6-luna",
    input: originalInput,
    tool_choice: "auto",
  };
  const result = createCodexCacheRefreshPayload(
    payload,
    codexModel,
  ) as typeof payload;
  assert.deepEqual(result.input.slice(0, -1), originalInput);
  assert.deepEqual(result.input.at(-1), {
    type: "message",
    role: "user",
    content: [{ type: "input_text", text: CODEX_CACHE_REFRESH_TEXT }],
  });
  assert.equal(result.tool_choice, "none");
  assert.equal(payload.tool_choice, "auto");
});

test("before_provider_headers sets the xAI conversation header from the session id", () => {
  const { pi, handlers } = fakePi();
  createPromptCacheExtension((() => "stream") as never)(pi);
  const [handler] = handlers.get("before_provider_headers")!;
  const ctx = (provider: string) => ({
    model: { provider },
    sessionManager: { getSessionId: () => "session-9" },
  });

  const xai = {
    type: "before_provider_headers",
    headers: {} as Record<string, string>,
  };
  handler(xai, ctx("xai"));
  assert.deepEqual(xai.headers, { "x-grok-conv-id": "session-9" });

  const other = {
    type: "before_provider_headers",
    headers: {} as Record<string, string>,
  };
  handler(other, ctx("openrouter"));
  assert.deepEqual(other.headers, {});
});
