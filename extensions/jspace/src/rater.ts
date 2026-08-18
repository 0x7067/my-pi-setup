import type { ModelRegistry } from "@earendil-works/pi-coding-agent";
import { completeSimple } from "@earendil-works/pi-ai/compat";
import type { SummaryConfig } from "../../summaries/src/config.ts";
import { isRunOutcome, type RunOutcome } from "./state.ts";

export const RATER_SYSTEM_PROMPT = `You judge whether a completed coding-agent run achieved what the user asked for in that run.

Return exactly one JSON object with this shape:
{"outcome":"ok","reason":"..."}

Rules:
- outcome is one of "ok", "fail", or "unclear".
- ok: the request was completed and the transcript shows verification or clear evidence.
- fail: the run ended with the request unmet, errors unresolved, or completion claimed without evidence.
- unclear: the transcript cannot settle it, or the run was a question or discussion with no checkable deliverable.
- reason: one short sentence grounded in the transcript.
- Base the judgement only on the supplied transcript.
- Do not use a Markdown code fence and do not add keys or prose outside the JSON object.`;

export const REASON_MAX_LENGTH = 300;

export interface RunRating {
  readonly outcome: RunOutcome | "unclear";
  readonly reason: string;
}

export function buildRatingPrompt(transcript: string) {
  return `Rate this fully settled main-agent run.\n\n<current_run>\n${transcript}\n</current_run>`;
}

function cleanReason(value: string) {
  const cleaned = value
    // Strip control characters before rendering model output in the terminal.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length <= REASON_MAX_LENGTH
    ? cleaned
    : `${cleaned.slice(0, REASON_MAX_LENGTH - 1).trimEnd()}…`;
}

function parseCandidate(candidate: string): RunRating | undefined {
  try {
    const value: unknown = JSON.parse(candidate);
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return undefined;
    }
    const record = value as Record<string, unknown>;
    const outcome =
      typeof record.outcome === "string"
        ? record.outcome.trim().toLowerCase()
        : "";
    if (!isRunOutcome(outcome) && outcome !== "unclear") return undefined;
    const reason =
      typeof record.reason === "string" ? cleanReason(record.reason) : "";
    return { outcome, reason };
  } catch {
    return undefined;
  }
}

/** Accepts bare JSON, fenced JSON, or JSON embedded in prose. */
export function parseRatingResponse(text: string): RunRating | undefined {
  const trimmed = text.trim();
  const candidates = [trimmed];
  for (const match of trimmed.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)) {
    if (match[1]) candidates.push(match[1].trim());
  }
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first !== -1 && last > first) {
    candidates.push(trimmed.slice(first, last + 1));
  }
  for (const candidate of candidates) {
    const parsed = parseCandidate(candidate);
    if (parsed) return parsed;
  }
  return undefined;
}

export interface RateRunOptions {
  readonly modelRegistry: ModelRegistry;
  readonly config: SummaryConfig;
  readonly transcript: string;
  readonly signal: AbortSignal;
}

export type RateRun = (options: RateRunOptions) => Promise<RunRating>;

export const rateRunWithModel: RateRun = async (options) => {
  const model = options.modelRegistry.find(
    options.config.provider,
    options.config.model,
  );
  if (!model) {
    throw new Error(
      `Rating model is unavailable: ${options.config.provider}/${options.config.model}`,
    );
  }
  const auth = await options.modelRegistry.getApiKeyAndHeaders(model);
  if (!auth.ok) throw new Error(auth.error);

  const response = await completeSimple(
    model,
    {
      systemPrompt: RATER_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: buildRatingPrompt(options.transcript),
          timestamp: Date.now(),
        },
      ],
    },
    {
      apiKey: auth.apiKey,
      env: auth.env,
      headers: auth.headers,
      maxTokens: 300,
      maxRetries: 1,
      signal: options.signal,
      timeoutMs: 40_000,
      ...(options.config.reasoning === "off"
        ? {}
        : { reasoning: options.config.reasoning }),
    },
  );
  if (response.stopReason === "error" || response.stopReason === "aborted") {
    throw new Error(response.errorMessage ?? "Rating model request failed.");
  }
  const text = response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n");
  const rating = parseRatingResponse(text);
  if (!rating) throw new Error("The rating model did not return valid JSON.");
  return rating;
};
