import { randomUUID } from "node:crypto";
import { ModelRuntime } from "../../node_modules/@earendil-works/pi-coding-agent/dist/core/model-runtime.js";
import type { AssistantMessage, Context, Model } from "@earendil-works/pi-ai";
import {
  addCodexStablePrefixBreakpoint,
  alignCodexPromptCacheKey,
  codexCacheIdentityHeaders,
} from "./index.ts";

type ProbeArm = "control" | "aligned" | "breakpoint";
type ProbePhase = "cold" | "warm" | "changed" | "delayed";

const DEFAULT_MODEL = "gpt-5.6-luna";
const DEFAULT_DELAY_MS = 180_000;
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

function stableInstructions() {
  return [
    "You are running a prompt-cache transport probe.",
    "Do not call tools. Reply with exactly OK.",
    SAFE_STABLE_PARAGRAPH.repeat(120),
  ].join("\n");
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
      (message.usage as typeof message.usage & {
        cacheWriteReported?: boolean;
      }).cacheWriteReported ?? false,
    output: message.usage.output,
  };
}

function emit(value: Record<string, unknown>) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
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
        transformHeaders:
          arm === "control"
            ? undefined
            : async (headers) => ({
                ...headers,
                ...codexCacheIdentityHeaders(model, sessionId),
              }),
        onPayload:
          arm === "control"
            ? undefined
            : async (payload) => {
                const aligned = alignCodexPromptCacheKey(
                  payload,
                  model,
                  sessionId,
                );
                return arm === "breakpoint"
                  ? addCodexStablePrefixBreakpoint(aligned, model)
                  : aligned;
              },
      },
    );
    emit({
      event: "result",
      arm,
      phase,
      variant,
      stopReason: message.stopReason,
      usage: usage(message),
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

const instructions = stableInstructions();
const arms: ProbeArm[] = ["control", "aligned", "breakpoint"];
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
});

for (const arm of arms) {
  await runRequest(
    runtime,
    model,
    instructions,
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
    instructions,
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
    instructions,
    arm,
    "changed",
    sessionIds.get(arm)!,
    "b",
  );
}

emit({ event: "wait", delayMs });
await new Promise((resolve) => setTimeout(resolve, delayMs));

for (const arm of arms) {
  await runRequest(
    runtime,
    model,
    instructions,
    arm,
    "delayed",
    sessionIds.get(arm)!,
    "b",
  );
}

emit({ event: "complete" });
