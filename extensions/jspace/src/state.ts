import { readFileSync } from "node:fs";

export type JspaceMode = "off" | "observe" | "on";

export const MODE_ENTRY_TYPE = "jspace-mode";
export const STATE_ENTRY_TYPE = "jspace-state";
export const METRICS_ENTRY_TYPE = "jspace-run-metrics";
export const OUTCOME_ENTRY_TYPE = "jspace-run-outcome";

export type RunOutcome = "ok" | "fail";

export interface VerifiedCheckpoint {
  readonly id: number;
  readonly claim: string;
  readonly by: string;
  readonly coverage: string;
}

export interface JspaceState {
  readonly goal: string;
  readonly core: readonly string[];
  readonly verified: readonly VerifiedCheckpoint[];
  readonly open: readonly string[];
  readonly next: string;
}

export interface UsageTotals {
  readonly input: number;
  readonly output: number;
  readonly cacheRead: number;
  readonly cacheWrite: number;
  readonly totalTokens: number;
}

export interface JspaceRunMetrics {
  /** Unique per run; outcomes join on it. Older entries derive it from timestamp. */
  readonly runId: string;
  readonly mode: Exclude<JspaceMode, "off">;
  readonly timestamp: number;
  readonly durationMs: number;
  readonly turns: number;
  readonly toolCalls: number;
  readonly toolErrors: number;
  readonly provider: string;
  readonly model: string;
  readonly usage: UsageTotals;
}

export interface CheckpointInput {
  readonly goal?: string;
  readonly core?: readonly string[];
  readonly verified?: {
    readonly claim: string;
    readonly by: string;
    readonly coverage: string;
  };
  readonly open?: readonly string[];
  readonly next: string;
}

interface BranchEntryLike {
  readonly type: string;
  readonly customType?: string;
  readonly data?: unknown;
}

export type RunOutcomeSource = "manual" | "model";

export interface RunOutcomeEntry {
  readonly runId: string;
  readonly outcome: RunOutcome;
  readonly source: RunOutcomeSource;
  readonly reason?: string;
}

export type JspaceAction =
  | { readonly action: "set"; readonly mode: JspaceMode }
  | { readonly action: "status" }
  | { readonly action: "reset" }
  | { readonly action: "rate"; readonly outcome: RunOutcome }
  | { readonly action: "error"; readonly message: string };

export const emptyState = (): JspaceState => ({
  goal: "",
  core: [],
  verified: [],
  open: [],
  next: "",
});

export function isJspaceMode(value: unknown): value is JspaceMode {
  return value === "off" || value === "observe" || value === "on";
}

export function readDefaultMode(path: string): JspaceMode {
  try {
    const value = readFileSync(path, "utf8").trim();
    return isJspaceMode(value) ? value : "off";
  } catch {
    return "off";
  }
}

export function isRunOutcome(value: unknown): value is RunOutcome {
  return value === "ok" || value === "fail";
}

const USAGE = "Use /jspace off|observe|on|status|reset|rate ok|fail.";

export function parseJspaceArgs(args: string | undefined): JspaceAction {
  const value = (args ?? "").trim().toLowerCase();
  if (value === "" || value === "status") return { action: "status" };
  if (value === "reset") return { action: "reset" };
  if (isJspaceMode(value)) return { action: "set", mode: value };
  const [head, ...rest] = value.split(/\s+/);
  if (head === "rate") {
    const outcome = rest.join(" ");
    if (isRunOutcome(outcome)) return { action: "rate", outcome };
    return {
      action: "error",
      message: `Rate the last run with /jspace rate ok or /jspace rate fail.`,
    };
  }
  return {
    action: "error",
    message: `Unknown argument "${value}". ${USAGE}`,
  };
}

export function readModeFromBranch(
  entries: readonly BranchEntryLike[],
  fallback: JspaceMode = "off",
): JspaceMode {
  let mode = fallback;
  for (const entry of entries) {
    if (entry.type !== "custom" || entry.customType !== MODE_ENTRY_TYPE)
      continue;
    const data = entry.data as { mode?: unknown } | undefined;
    if (isJspaceMode(data?.mode)) mode = data.mode;
  }
  return mode;
}

function isStringArray(value: unknown, maxItems: number): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= maxItems &&
    value.every((item) => typeof item === "string")
  );
}

function isVerified(value: unknown): value is VerifiedCheckpoint {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<VerifiedCheckpoint>;
  return (
    Number.isInteger(item.id) &&
    (item.id ?? 0) > 0 &&
    typeof item.claim === "string" &&
    typeof item.by === "string" &&
    typeof item.coverage === "string"
  );
}

function isState(value: unknown): value is JspaceState {
  if (!value || typeof value !== "object") return false;
  const state = value as Partial<JspaceState>;
  return (
    typeof state.goal === "string" &&
    isStringArray(state.core, 2) &&
    Array.isArray(state.verified) &&
    state.verified.every(isVerified) &&
    isStringArray(state.open, 8) &&
    typeof state.next === "string"
  );
}

export function readStateFromBranch(
  entries: readonly BranchEntryLike[],
): JspaceState {
  let state = emptyState();
  for (const entry of entries) {
    if (entry.type !== "custom" || entry.customType !== STATE_ENTRY_TYPE)
      continue;
    if (isState(entry.data)) {
      state = {
        goal: entry.data.goal,
        core: [...entry.data.core],
        verified: entry.data.verified.map((item) => ({ ...item })),
        open: [...entry.data.open],
        next: entry.data.next,
      };
    }
  }
  return state;
}

function finiteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

type StoredMetrics = Omit<JspaceRunMetrics, "runId"> & {
  readonly runId?: string;
};

function isMetrics(value: unknown): value is StoredMetrics {
  if (!value || typeof value !== "object") return false;
  const metrics = value as Partial<JspaceRunMetrics>;
  const usage = metrics.usage as Partial<UsageTotals> | undefined;
  return (
    (metrics.runId === undefined || typeof metrics.runId === "string") &&
    (metrics.mode === "observe" || metrics.mode === "on") &&
    finiteNonNegative(metrics.timestamp) &&
    finiteNonNegative(metrics.durationMs) &&
    finiteNonNegative(metrics.turns) &&
    finiteNonNegative(metrics.toolCalls) &&
    finiteNonNegative(metrics.toolErrors) &&
    typeof metrics.provider === "string" &&
    typeof metrics.model === "string" &&
    !!usage &&
    finiteNonNegative(usage.input) &&
    finiteNonNegative(usage.output) &&
    finiteNonNegative(usage.cacheRead) &&
    finiteNonNegative(usage.cacheWrite) &&
    finiteNonNegative(usage.totalTokens)
  );
}

export function readMetricsFromBranch(
  entries: readonly BranchEntryLike[],
): JspaceRunMetrics[] {
  const metrics: JspaceRunMetrics[] = [];
  for (const entry of entries) {
    if (entry.type !== "custom" || entry.customType !== METRICS_ENTRY_TYPE)
      continue;
    if (isMetrics(entry.data)) {
      metrics.push({
        ...entry.data,
        runId: entry.data.runId ?? `ts:${entry.data.timestamp}`,
      });
    }
  }
  return metrics;
}

export function isRunOutcomeSource(value: unknown): value is RunOutcomeSource {
  return value === "manual" || value === "model";
}

function isOutcomeEntry(value: unknown): value is RunOutcomeEntry {
  if (!value || typeof value !== "object") return false;
  const data = value as Partial<RunOutcomeEntry>;
  return (
    typeof data.runId === "string" &&
    data.runId.length > 0 &&
    isRunOutcome(data.outcome) &&
    isRunOutcomeSource(data.source) &&
    (data.reason === undefined || typeof data.reason === "string")
  );
}

/**
 * Effective outcome per run id. Later entries replace earlier ones, except that
 * a model rating never replaces a manual one.
 */
export function readOutcomesFromBranch(
  entries: readonly BranchEntryLike[],
): Map<string, RunOutcomeEntry> {
  const outcomes = new Map<string, RunOutcomeEntry>();
  for (const entry of entries) {
    if (entry.type !== "custom" || entry.customType !== OUTCOME_ENTRY_TYPE)
      continue;
    if (!isOutcomeEntry(entry.data)) continue;
    const existing = outcomes.get(entry.data.runId);
    if (existing?.source === "manual" && entry.data.source === "model")
      continue;
    outcomes.set(entry.data.runId, entry.data);
  }
  return outcomes;
}

export function describeOutcome(outcome: RunOutcomeEntry | undefined): string {
  if (!outcome) return "unrated";
  const detail = outcome.reason
    ? `${outcome.source}: ${outcome.reason}`
    : outcome.source;
  return `rated ${outcome.outcome} (${detail})`;
}

export function summarizeRun(
  run: JspaceRunMetrics,
  outcome: RunOutcomeEntry | undefined,
): string {
  const rating = describeOutcome(outcome);
  return `${(run.durationMs / 1000).toFixed(1)}s · ${run.turns} turn(s) · ${run.toolCalls} tool call(s) · ${run.toolErrors} error(s) · ${run.usage.totalTokens} tokens · ${rating}`;
}

/**
 * One line per mode with run count, per-run means, and rated outcomes so that
 * observe and on can be compared from the same branch.
 */
export function summarizeMetricsByMode(
  metrics: readonly JspaceRunMetrics[],
  outcomes: ReadonlyMap<string, RunOutcomeEntry>,
): string[] {
  const lines: string[] = [];
  for (const mode of ["observe", "on"] as const) {
    const runs = metrics.filter((run) => run.mode === mode);
    if (runs.length === 0) continue;
    const mean = (pick: (run: JspaceRunMetrics) => number) =>
      runs.reduce((sum, run) => sum + pick(run), 0) / runs.length;
    let ok = 0;
    let fail = 0;
    for (const run of runs) {
      const outcome = outcomes.get(run.runId)?.outcome;
      if (outcome === "ok") ok += 1;
      else if (outcome === "fail") fail += 1;
    }
    lines.push(
      `${mode}: ${runs.length} run(s) · mean ${(mean((r) => r.durationMs) / 1000).toFixed(1)}s · ${mean((r) => r.turns).toFixed(1)} turn(s) · ${mean((r) => r.toolCalls).toFixed(1)} tool call(s) · ${mean((r) => r.toolErrors).toFixed(2)} error(s) · ${Math.round(mean((r) => r.usage.totalTokens))} tokens · ${ok} ok / ${fail} fail / ${runs.length - ok - fail} unrated`,
    );
  }
  return lines;
}

function requiredText(value: string, name: string, maxLength: number): string {
  const text = value.trim();
  if (!text) throw new Error(`${name} must not be empty.`);
  if (text.length > maxLength) {
    throw new Error(`${name} must be at most ${maxLength} characters.`);
  }
  return text;
}

function normalizedList(
  values: readonly string[],
  name: string,
  maxItems: number,
  maxLength: number,
): string[] {
  if (values.length > maxItems) {
    throw new Error(`${name} accepts at most ${maxItems} items.`);
  }
  const result = values.map((value) => requiredText(value, name, maxLength));
  if (new Set(result).size !== result.length) {
    throw new Error(`${name} must not contain duplicates.`);
  }
  return result;
}

export function applyCheckpoint(
  current: JspaceState,
  input: CheckpointInput,
): JspaceState {
  const goal = input.goal
    ? requiredText(input.goal, "goal", 500)
    : current.goal;
  if (!goal) throw new Error("The first checkpoint must set goal.");

  const core = input.core
    ? normalizedList(input.core, "core", 2, 240)
    : [...current.core];
  const open = input.open
    ? normalizedList(input.open, "open", 8, 400)
    : [...current.open];
  const next = requiredText(input.next, "next", 500);
  const verified = [...current.verified];

  if (input.verified) {
    verified.push({
      id: (verified.at(-1)?.id ?? 0) + 1,
      claim: requiredText(input.verified.claim, "verified claim", 500),
      by: requiredText(input.verified.by, "verifier", 500),
      coverage: requiredText(input.verified.coverage, "coverage", 500),
    });
  }

  return { goal, core, verified, open, next };
}

export function summarizeState(state: JspaceState): string {
  if (!state.goal) return "ledger: not started";
  const lines = [
    `goal: ${state.goal}`,
    `core: ${state.core.length > 0 ? state.core.join(" | ") : "(none)"}`,
    `verified: ${state.verified.length}`,
    `open: ${state.open.length > 0 ? state.open.join(" | ") : "(none)"}`,
    `next: ${state.next}`,
  ];
  const last = state.verified.at(-1);
  if (last) {
    lines.splice(
      3,
      0,
      `last verified: ${last.claim} — by ${last.by}; coverage: ${last.coverage}`,
    );
  }
  return lines.join("\n");
}
