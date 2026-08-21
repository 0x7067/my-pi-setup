import type {
  Api,
  Context,
  Model,
  SimpleStreamOptions,
} from "@earendil-works/pi-ai";
import { streamSimple } from "@earendil-works/pi-ai/compat";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

type JsonRecord = Record<string, unknown>;

export const CODEX_CACHE_BREAKPOINT_ENV = "PI_CODEX_CACHE_BREAKPOINT";
export const CODEX_CACHE_BREAKPOINT_TEXT =
  "The stable session instructions and tool definitions end here.";

/**
 * Providers whose APIs accept Pi's long cache retention fields, keyed to the
 * API their models use. Pi resolves `cacheRetention: "long"` into
 * `cache_control.ttl: "1h"` for Anthropic-format requests and
 * `prompt_cache_key` + `prompt_cache_retention: "24h"` for OpenAI-format
 * requests. Retention is scoped here instead of PI_CACHE_RETENTION because
 * that env var is global and other providers (DeepSeek, Kimi, Synthetic)
 * are not known to accept those fields.
 */
export const LONG_RETENTION_PROVIDERS: Readonly<Record<string, Api>> = {
  openrouter: "openai-completions",
  anthropic: "anthropic-messages",
};

/** Providers whose cache affinity is keyed by a request header. */
export const AFFINITY_HEADERS: Readonly<Record<string, string>> = {
  xai: "x-grok-conv-id",
};

function record(value: unknown): JsonRecord | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : undefined;
}

export function isOpenAICodexModel(model: unknown) {
  const candidate = record(model);
  return (
    candidate?.provider === "openai-codex" &&
    candidate?.api === "openai-codex-responses"
  );
}

/** Match the cache identity carried by the official Codex client. */
export function codexCacheIdentityHeaders(model: unknown, sessionId: string) {
  if (!isOpenAICodexModel(model) || !sessionId) return {};
  return {
    "session-id": sessionId,
    "thread-id": sessionId,
    "x-client-request-id": sessionId,
  };
}

/** Keep the body cache key identical to the session and thread headers. */
export function alignCodexPromptCacheKey(
  payload: unknown,
  model: unknown,
  sessionId: string,
) {
  const root = record(payload);
  if (!root || !isOpenAICodexModel(model) || !sessionId) return payload;
  if (root.prompt_cache_key === sessionId) return payload;
  return { ...root, prompt_cache_key: sessionId };
}

export function codexCacheBreakpointEnabled(env = process.env) {
  return /^(1|true|yes|on)$/i.test(
    env[CODEX_CACHE_BREAKPOINT_ENV]?.trim() ?? "",
  );
}

function hasCodexCacheBreakpoint(input: readonly unknown[]) {
  return input.some((candidate) => {
    const message = record(candidate);
    if (!Array.isArray(message?.content)) return false;
    return message.content.some((part) => {
      const content = record(part);
      return (
        content?.text === CODEX_CACHE_BREAKPOINT_TEXT &&
        record(content.prompt_cache_breakpoint)?.mode === "explicit"
      );
    });
  });
}

/**
 * Add a stable developer content block after top-level instructions and tools.
 * GPT-5.6 can then reuse that prefix when the first user message changes.
 */
export function addCodexStablePrefixBreakpoint(
  payload: unknown,
  model: unknown,
) {
  const root = record(payload);
  if (!root || !isOpenAICodexModel(model) || !Array.isArray(root.input)) {
    return payload;
  }
  const candidateModel = record(model);
  const modelId =
    typeof candidateModel?.id === "string"
      ? candidateModel.id
      : typeof root.model === "string"
        ? root.model
        : "";
  if (!String(modelId).startsWith("gpt-5.6")) return payload;
  if (hasCodexCacheBreakpoint(root.input)) return payload;

  const boundary = {
    type: "message",
    role: "developer",
    content: [
      {
        type: "input_text",
        text: CODEX_CACHE_BREAKPOINT_TEXT,
        prompt_cache_breakpoint: { mode: "explicit" },
      },
    ],
  };
  return { ...root, input: [boundary, ...root.input] };
}

/** Explicit `none` (used by compaction) must stay `none`. */
export function withLongCacheRetention(
  options?: SimpleStreamOptions,
): SimpleStreamOptions {
  return { ...options, cacheRetention: options?.cacheRetention ?? "long" };
}

export function affinityHeader(
  provider: string | undefined,
  sessionId: string,
) {
  const name = provider ? AFFINITY_HEADERS[provider] : undefined;
  return name && sessionId ? { name, value: sessionId } : undefined;
}

export function createPromptCacheExtension(
  stream: typeof streamSimple = streamSimple,
) {
  return function promptCache(pi: ExtensionAPI) {
    for (const [provider, api] of Object.entries(LONG_RETENTION_PROVIDERS)) {
      // No `models` and no `baseUrl`: existing models and auth are kept; only
      // the stream call is wrapped.
      pi.registerProvider(provider, {
        api,
        streamSimple: (
          model: Model<Api>,
          context: Context,
          options?: SimpleStreamOptions,
        ) => stream(model, context, withLongCacheRetention(options)),
      });
    }

    pi.on("before_provider_headers", (event, ctx) => {
      const sessionId = ctx.sessionManager.getSessionId();
      const header = affinityHeader(ctx.model?.provider, sessionId);
      if (header) event.headers[header.name] = header.value;
      Object.assign(
        event.headers,
        codexCacheIdentityHeaders(ctx.model, sessionId),
      );
    });

    pi.on("before_provider_request", (event, ctx) => {
      const sessionId = ctx.sessionManager.getSessionId();
      let payload = alignCodexPromptCacheKey(
        event.payload,
        ctx.model,
        sessionId,
      );
      if (codexCacheBreakpointEnabled()) {
        payload = addCodexStablePrefixBreakpoint(payload, ctx.model);
      }
      return payload === event.payload ? undefined : payload;
    });
  };
}

export default createPromptCacheExtension();
