import { readFileSync } from "node:fs";
import type {
  AssistantMessage,
  Context,
  Model,
  Usage,
} from "@earendil-works/pi-ai";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import {
  createCodexCacheRefreshPayload,
  isOpenAICodexModel,
} from "../prompt-cache/index.ts";

export interface CodexCacheKeepaliveConfig {
  enabled: boolean;
  intervalMs: number;
  maxIdleMs: number;
  minimumContextTokens: number;
  requestTimeoutMs: number;
}

interface TimerDriver {
  now(): number;
  setTimeout(
    callback: () => void,
    delayMs: number,
  ): ReturnType<typeof setTimeout>;
  clearTimeout(timer: ReturnType<typeof setTimeout>): void;
}

interface CapturedRequest {
  payload: unknown;
  model: Model<any>;
  sessionId: string;
  ctx: ExtensionContext;
}

const KEEPALIVE_ENTRY = "codex-cache-keepalive";
const REFRESH_CONTEXT: Context = {
  systemPrompt: "Refresh an existing prompt cache entry.",
  messages: [
    {
      role: "user",
      content: "Reply with exactly OK.",
      timestamp: 0,
    },
  ],
  tools: [],
};

const realTimers: TimerDriver = {
  now: Date.now,
  setTimeout(callback, delayMs) {
    const timer = setTimeout(callback, delayMs);
    timer.unref();
    return timer;
  },
  clearTimeout,
};

function positiveInteger(value: unknown, name: string) {
  if (!Number.isInteger(value) || Number(value) <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return Number(value);
}

export function validateKeepaliveConfig(
  value: CodexCacheKeepaliveConfig,
): CodexCacheKeepaliveConfig {
  const config = {
    enabled: value.enabled === true,
    intervalMs: positiveInteger(value.intervalMs, "intervalMs"),
    maxIdleMs: positiveInteger(value.maxIdleMs, "maxIdleMs"),
    minimumContextTokens: positiveInteger(
      value.minimumContextTokens,
      "minimumContextTokens",
    ),
    requestTimeoutMs: positiveInteger(
      value.requestTimeoutMs,
      "requestTimeoutMs",
    ),
  };
  if (config.intervalMs >= config.maxIdleMs) {
    throw new Error("intervalMs must be smaller than maxIdleMs");
  }
  return config;
}

function loadConfig() {
  return validateKeepaliveConfig(
    JSON.parse(
      readFileSync(new URL("./config.json", import.meta.url), "utf8"),
    ) as CodexCacheKeepaliveConfig,
  );
}

export function reusablePromptTokens(usage: Usage) {
  return Math.max(0, usage.input) + Math.max(0, usage.cacheRead);
}

export function containsNonTextInput(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsNonTextInput);
  if (value === null || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  if (
    typeof record.type === "string" &&
    [
      "input_image",
      "input_file",
      "input_audio",
      "image_url",
      "audio_url",
    ].includes(record.type)
  ) {
    return true;
  }
  return Object.values(record).some(containsNonTextInput);
}

function cacheRead(message: AssistantMessage) {
  return Math.max(0, message.usage.cacheRead);
}

export function createCodexCacheKeepaliveExtension(
  config: CodexCacheKeepaliveConfig = loadConfig(),
  timers: TimerDriver = realTimers,
) {
  const resolvedConfig = validateKeepaliveConfig(config);
  return function codexCacheKeepalive(pi: ExtensionAPI) {
    let captured: CapturedRequest | undefined;
    let lastReusableTokens = 0;
    let settledAt = 0;
    let refreshCount = 0;
    let generation = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let refreshAbort: AbortController | undefined;

    const cancel = (clearCapture = false) => {
      generation += 1;
      if (timer !== undefined) timers.clearTimeout(timer);
      refreshAbort?.abort();
      refreshAbort = undefined;
      timer = undefined;
      refreshCount = 0;
      if (clearCapture) captured = undefined;
    };

    const recordRefresh = (
      status: "hit" | "miss" | "error",
      message?: AssistantMessage,
      error?: unknown,
    ) => {
      pi.appendEntry(KEEPALIVE_ENTRY, {
        at: timers.now(),
        status,
        refresh: refreshCount + 1,
        cacheRead: message ? cacheRead(message) : 0,
        input: message?.usage.input ?? 0,
        output: message?.usage.output ?? 0,
        ...(error
          ? {
              error: error instanceof Error ? error.name : "unknown",
            }
          : {}),
      });
    };

    const scheduleNext = () => {
      if (!captured || timer !== undefined) return;
      const nextRefreshAt = (refreshCount + 1) * resolvedConfig.intervalMs;
      if (nextRefreshAt >= resolvedConfig.maxIdleMs) {
        captured = undefined;
        return;
      }
      const expectedGeneration = generation;
      timer = timers.setTimeout(() => {
        timer = undefined;
        void refresh(expectedGeneration);
      }, resolvedConfig.intervalMs);
    };

    const refresh = async (expectedGeneration: number) => {
      const request = captured;
      if (
        !request ||
        expectedGeneration !== generation ||
        timers.now() - settledAt >= resolvedConfig.maxIdleMs
      ) {
        captured = undefined;
        return;
      }
      if (!request.ctx.isIdle() || request.ctx.hasPendingMessages()) {
        cancel(true);
        return;
      }
      const refreshPayload = createCodexCacheRefreshPayload(
        request.payload,
        request.model,
      );
      if (refreshPayload === request.payload) {
        cancel(true);
        return;
      }

      const abort = new AbortController();
      refreshAbort = abort;
      try {
        const message = await request.ctx.modelRegistry.complete(
          request.model,
          REFRESH_CONTEXT,
          {
            sessionId: request.sessionId,
            transport: "sse",
            maxRetries: 0,
            timeoutMs: resolvedConfig.requestTimeoutMs,
            signal: abort.signal,
            onPayload: async () => refreshPayload,
          },
        );
        if (expectedGeneration !== generation) return;
        if (message.stopReason === "error" || cacheRead(message) === 0) {
          recordRefresh("miss", message);
          if (request.ctx.hasUI) {
            request.ctx.ui.notify(
              "Codex cache keepalive missed; further refreshes stopped.",
              "warning",
            );
          }
          cancel(true);
          return;
        }
        recordRefresh("hit", message);
        refreshCount += 1;
        scheduleNext();
      } catch (error) {
        if (expectedGeneration !== generation) return;
        recordRefresh("error", undefined, error);
        cancel(true);
      } finally {
        if (refreshAbort === abort) refreshAbort = undefined;
      }
    };

    const resetForActivity = () => {
      cancel(true);
      lastReusableTokens = 0;
    };

    pi.on("session_start", resetForActivity);
    pi.on("before_agent_start", resetForActivity);
    pi.on("input", resetForActivity);
    pi.on("model_select", resetForActivity);
    pi.on("session_before_switch", resetForActivity);
    pi.on("session_before_fork", resetForActivity);
    pi.on("session_before_compact", resetForActivity);
    pi.on("session_before_tree", resetForActivity);
    pi.on("session_shutdown", resetForActivity);

    pi.on("before_provider_request", (event, ctx) => {
      if (!isOpenAICodexModel(ctx.model)) return;
      captured = {
        payload: event.payload,
        model: ctx.model!,
        sessionId: ctx.sessionManager.getSessionId(),
        ctx,
      };
    });

    pi.on("message_end", (event) => {
      if (event.message.role !== "assistant") return;
      lastReusableTokens = reusablePromptTokens(event.message.usage);
    });

    pi.on("agent_settled", (_event, ctx) => {
      if (
        !resolvedConfig.enabled ||
        ctx.mode !== "tui" ||
        !captured ||
        !isOpenAICodexModel(ctx.model) ||
        captured.sessionId !== ctx.sessionManager.getSessionId() ||
        lastReusableTokens < resolvedConfig.minimumContextTokens ||
        containsNonTextInput(captured.payload)
      ) {
        captured = undefined;
        return;
      }
      cancel(false);
      settledAt = timers.now();
      scheduleNext();
    });
  };
}

export default createCodexCacheKeepaliveExtension();
