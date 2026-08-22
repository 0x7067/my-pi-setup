import { randomUUID } from "node:crypto";
import { ModelRuntime } from "../../node_modules/@earendil-works/pi-coding-agent/dist/core/model-runtime.js";
import type { AssistantMessage, Context, Model } from "@earendil-works/pi-ai";
import {
  addCodexStablePrefixBreakpoint,
  alignCodexPromptCacheKey,
  codexCacheIdentityHeaders,
  createCodexCacheRefreshPayload,
} from "./index.ts";

type ProbeArm = "control" | "aligned" | "breakpoint" | "touch";
type ProbePhase = "cold" | "warm" | "changed" | "delayed" | `touch-${number}`;

const DEFAULT_MODEL = "gpt-5.6-luna";
const DEFAULT_DELAY_MS = 180_000;
const DEFAULT_STABLE_REPEAT = 120;
const DEFAULT_ARMS: ProbeArm[] = ["control", "aligned", "breakpoint"];
const SELECTABLE_ARMS: ProbeArm[] = [...DEFAULT_ARMS, "touch"];
const SAFE_STABLE_PARAGRAPH =
  "Keep the supplied requirements unchanged, use deterministic ordering, and answer the final request exactly as instructed. ";

function positiveInteger(value: string | undefined, fallback: number) {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Expected a positive integer, received ${value}`);
  }
  return parsed;
}

function stableInstructions(repeat: number) {
  return [
    "You are running a prompt-cache transport probe.",
    "Do not call tools. Reply with exactly OK.",
    SAFE_STABLE_PARAGRAPH.repeat(repeat),
  ].join("\n");
}

function isolatedInstructions(instructions: string, arm: ProbeArm) {
  const namespace = `Cache probe namespace ${arm}. `.repeat(32);
  return `${namespace}\n${instructions}`;
}

function context(instructions: string, variant: "a" | "b"): Context {
  return {
    systemPrompt: instructions,
    messages: [
      {
        role: "user",
        content: `Reply with exactly OK. Probe variant ${variant}.`,
        timestamp: 0,
      },
    ],
    tools: [],
  };
}

function safeError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, "Bearer [redacted]")
    .replace(/[A-Za-z0-9_-]{80,}/g, "[redacted]")
    .slice(0, 500);
}

function usage(message: AssistantMessage) {
  return {
    input: message.usage.input,
    cacheRead: message.usage.cacheRead,
    cacheWrite: message.usage.cacheWrite,
    cacheWriteReported:
      (
        message.usage as typeof message.usage & {
          cacheWriteReported?: boolean;
        }
      ).cacheWriteReported ?? false,
    output: message.usage.output,
  };
}

function emit(value: Record<string, unknown>) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function configuredArms(value: string | undefined) {
  if (!value?.trim()) return DEFAULT_ARMS;
  const arms = value
    .split(",")
    .map((item) => item.trim())
    .filter((item): item is ProbeArm =>
      SELECTABLE_ARMS.includes(item as ProbeArm),
    );
  if (arms.length === 0) throw new Error("No valid probe arms were selected");
  return [...new Set(arms)];
}

async function runRequest(
  runtime: ModelRuntime,
  model: Model<any>,
  instructions: string,
  arm: ProbeArm,
  phase: ProbePhase,
  sessionId: string,
  variant: "a" | "b",
) {
  const alignedIdentity = arm === "aligned" || arm === "breakpoint";
  const refreshRequest = arm === "touch" && phase.startsWith("touch-");
  try {
    const message = await runtime.completeSimple(
      model,
      context(instructions, variant),
      {
        sessionId,
        transport: "sse",
        reasoning: "minimal",
        maxRetries: 0,
        timeoutMs: 120_000,
        transformHeaders: alignedIdentity
          ? async (headers) => ({
              ...headers,
              ...codexCacheIdentityHeaders(model, sessionId),
            })
          : undefined,
        onPayload:
          alignedIdentity || refreshRequest
            ? async (payload) => {
                if (refreshRequest) {
                  return createCodexCacheRefreshPayload(payload, model);
                }
                const aligned = alignCodexPromptCacheKey(
                  payload,
                  model,
                  sessionId,
                );
                return arm === "breakpoint"
                  ? addCodexStablePrefixBreakpoint(aligned, model)
                  : aligned;
              }
            : undefined,
      },
    );
    emit({
      event: "result",
      arm,
      phase,
      variant,
      stopReason: message.stopReason,
      usage: usage(message),
      ...(message.errorMessage
        ? { error: safeError(message.errorMessage) }
        : {}),
    });
    return message;
  } catch (error) {
    emit({ event: "error", arm, phase, variant, error: safeError(error) });
    return undefined;
  }
}

const delayMs = positiveInteger(
  process.env.CODEX_CACHE_PROBE_DELAY_MS,
  DEFAULT_DELAY_MS,
);
const modelId = process.env.CODEX_CACHE_PROBE_MODEL?.trim() || DEFAULT_MODEL;
const stableRepeat = positiveInteger(
  process.env.CODEX_CACHE_PROBE_REPEAT,
  DEFAULT_STABLE_REPEAT,
);
const touchIntervalMs = process.env.CODEX_CACHE_PROBE_TOUCH_INTERVAL_MS
  ? positiveInteger(process.env.CODEX_CACHE_PROBE_TOUCH_INTERVAL_MS, 1)
  : undefined;
const touchCount = positiveInteger(
  process.env.CODEX_CACHE_PROBE_TOUCH_COUNT,
  2,
);
const runtime = await ModelRuntime.create({
  authPath: new URL("../../auth.json", import.meta.url).pathname,
  modelsPath: new URL("../../models.json", import.meta.url).pathname,
  refreshOnCreate: false,
});
const model = runtime.getModel("openai-codex", modelId);
if (!model) throw new Error(`Codex model ${modelId} is unavailable`);

const resolvedAuth = await runtime.getAuth("openai-codex");
if (!resolvedAuth || resolvedAuth.source !== "OAuth") {
  throw new Error("OpenAI Codex OAuth is not configured");
}

const instructions = stableInstructions(stableRepeat);
const arms = configuredArms(process.env.CODEX_CACHE_PROBE_ARMS);
const sessionIds = new Map(
  arms.map((arm) => [arm, `cache-probe-${randomUUID()}`]),
);

emit({
  event: "start",
  model: model.id,
  transport: "sse",
  delayMs,
  stableChars: instructions.length,
  arms,
  ...(touchIntervalMs ? { touchIntervalMs, touchCount } : {}),
});

for (const arm of arms) {
  await runRequest(
    runtime,
    model,
    isolatedInstructions(instructions, arm),
    arm,
    "cold",
    sessionIds.get(arm)!,
    "a",
  );
}
for (const arm of arms) {
  await runRequest(
    runtime,
    model,
    isolatedInstructions(instructions, arm),
    arm,
    "warm",
    sessionIds.get(arm)!,
    "a",
  );
}
for (const arm of arms) {
  await runRequest(
    runtime,
    model,
    isolatedInstructions(instructions, arm),
    arm,
    "changed",
    sessionIds.get(arm)!,
    "b",
  );
}

let elapsedMs = 0;
if (arms.includes("touch") && touchIntervalMs) {
  for (let index = 1; index <= touchCount; index += 1) {
    if (elapsedMs + touchIntervalMs >= delayMs) {
      throw new Error("Touch schedule must end before the delayed request");
    }
    emit({ event: "wait", delayMs: touchIntervalMs, until: `touch-${index}` });
    await new Promise((resolve) => setTimeout(resolve, touchIntervalMs));
    elapsedMs += touchIntervalMs;
    await runRequest(
      runtime,
      model,
      isolatedInstructions(instructions, "touch"),
      "touch",
      `touch-${index}`,
      sessionIds.get("touch")!,
      "b",
    );
  }
}

const remainingDelayMs = delayMs - elapsedMs;
emit({ event: "wait", delayMs: remainingDelayMs, until: "delayed" });
await new Promise((resolve) => setTimeout(resolve, remainingDelayMs));

for (const arm of arms) {
  await runRequest(
    runtime,
    model,
    isolatedInstructions(instructions, arm),
    arm,
    "delayed",
    sessionIds.get(arm)!,
    "b",
  );
}

emit({ event: "complete" });
