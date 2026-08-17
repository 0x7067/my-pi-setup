import assert from "node:assert/strict";
import test from "node:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  affinityHeader,
  createPromptCacheExtension,
  LONG_RETENTION_PROVIDERS,
  withLongCacheRetention,
} from "../prompt-cache.ts";

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
