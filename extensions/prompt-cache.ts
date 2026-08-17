import type {
  Api,
  Context,
  Model,
  SimpleStreamOptions,
} from "@earendil-works/pi-ai";
import { streamSimple } from "@earendil-works/pi-ai/compat";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

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
      const header = affinityHeader(
        ctx.model?.provider,
        ctx.sessionManager.getSessionId(),
      );
      if (header) event.headers[header.name] = header.value;
    });
  };
}

export default createPromptCacheExtension();
