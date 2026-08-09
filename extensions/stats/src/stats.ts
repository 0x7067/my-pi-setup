import { createReadStream } from "node:fs";
import { readdir } from "node:fs/promises";
import { basename, join } from "node:path";
import { createInterface } from "node:readline";

export interface UsageTotals {
  requests: number;
  errors: number;
  input: number;
  output: number;
  reasoning: number;
  cacheRead: number;
  cacheWrite: number;
  totalTokens: number;
  cost: number;
}

export interface Breakdown extends UsageTotals {
  key: string;
}

export interface PiStats {
  generatedAt: string;
  sessionFiles: number;
  malformedLines: number;
  totals: UsageTotals;
  byModel: Breakdown[];
  byProvider: Breakdown[];
  byProject: Breakdown[];
  byDay: Breakdown[];
}

interface Usage {
  input?: unknown;
  output?: unknown;
  reasoning?: unknown;
  cacheRead?: unknown;
  cacheWrite?: unknown;
  totalTokens?: unknown;
  cost?: { total?: unknown };
}

interface SessionEntry {
  type?: unknown;
  id?: unknown;
  timestamp?: unknown;
  cwd?: unknown;
  message?: {
    role?: unknown;
    model?: unknown;
    provider?: unknown;
    stopReason?: unknown;
    errorMessage?: unknown;
    timestamp?: unknown;
    usage?: Usage;
  };
}

interface UsageRecord {
  stableId: string;
  project: string;
  model: string;
  provider: string;
  day: string;
  value: UsageTotals;
}

interface ParsedSession {
  file: string;
  startedAt: number;
  malformedLines: number;
  records: UsageRecord[];
}

function number(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function emptyTotals(): UsageTotals {
  return {
    requests: 0,
    errors: 0,
    input: 0,
    output: 0,
    reasoning: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    cost: 0,
  };
}

function add(target: UsageTotals, source: UsageTotals) {
  for (const key of Object.keys(target) as (keyof UsageTotals)[]) {
    target[key] += source[key];
  }
}

function breakdown(
  map: Map<string, UsageTotals>,
  key: string,
  value: UsageTotals,
) {
  const totals = map.get(key) ?? emptyTotals();
  add(totals, value);
  map.set(key, totals);
}

function sorted(map: Map<string, UsageTotals>, chronological = false) {
  return [...map.entries()]
    .map(([key, value]) => ({ key, ...value }))
    .sort((left, right) =>
      chronological
        ? left.key.localeCompare(right.key)
        : right.cost - left.cost ||
          right.requests - left.requests ||
          left.key.localeCompare(right.key),
    );
}

async function sessionFiles(root: string) {
  const files: string[] = [];
  const visit = async (directory: string): Promise<void> => {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "ENOENT"
      )
        return;
      throw error;
    }
    await Promise.all(
      entries.map(async (entry) => {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) await visit(path);
        else if (entry.isFile() && entry.name.endsWith(".jsonl"))
          files.push(path);
      }),
    );
  };
  await visit(root);
  return files.sort();
}

function messageTotals(entry: SessionEntry): UsageTotals | undefined {
  const message = entry.message;
  if (entry.type !== "message" || message?.role !== "assistant") return;
  const usage = message.usage ?? {};
  return {
    requests: 1,
    errors:
      message.stopReason === "error" || typeof message.errorMessage === "string"
        ? 1
        : 0,
    input: number(usage.input),
    output: number(usage.output),
    reasoning: number(usage.reasoning),
    cacheRead: number(usage.cacheRead),
    cacheWrite: number(usage.cacheWrite),
    totalTokens: number(usage.totalTokens),
    cost: number(usage.cost?.total),
  };
}

function validTimestamp(value: unknown) {
  if (typeof value !== "number" && typeof value !== "string") return "";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : "";
}

async function parseSession(file: string): Promise<ParsedSession> {
  let project = basename(file, ".jsonl");
  let startedAt = Number.POSITIVE_INFINITY;
  let malformedLines = 0;
  let lineNumber = 0;
  const records: UsageRecord[] = [];
  const lines = createInterface({
    input: createReadStream(file, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });

  for await (const line of lines) {
    lineNumber += 1;
    if (!line.trim()) continue;
    let entry: SessionEntry;
    try {
      entry = JSON.parse(line) as SessionEntry;
    } catch {
      malformedLines += 1;
      continue;
    }
    if (entry.type === "session") {
      if (typeof entry.cwd === "string")
        project = basename(entry.cwd) || entry.cwd;
      const sessionTimestamp = validTimestamp(entry.timestamp);
      if (sessionTimestamp) startedAt = new Date(sessionTimestamp).getTime();
      continue;
    }
    const value = messageTotals(entry);
    if (!value) continue;

    const message = entry.message ?? {};
    const model = typeof message.model === "string" ? message.model : "unknown";
    const provider =
      typeof message.provider === "string" ? message.provider : "unknown";
    const rawTimestamp = message.timestamp ?? entry.timestamp;
    const timestamp = validTimestamp(rawTimestamp);
    const day = /^\d{4}-\d{2}-\d{2}/.exec(timestamp)?.[0] ?? "unknown";
    const stableId =
      typeof entry.id === "string"
        ? `id:${entry.id}:${JSON.stringify([
            rawTimestamp,
            model,
            provider,
            value.input,
            value.output,
            value.reasoning,
            value.cacheRead,
            value.cacheWrite,
            value.totalTokens,
            value.cost,
          ])}`
        : `fallback:${file}:${lineNumber}`;
    records.push({ stableId, project, model, provider, day, value });
  }

  return { file, startedAt, malformedLines, records };
}

export async function collectStats(root: string): Promise<PiStats> {
  const files = await sessionFiles(root);
  const totals = emptyTotals();
  const byModel = new Map<string, UsageTotals>();
  const byProvider = new Map<string, UsageTotals>();
  const byProject = new Map<string, UsageTotals>();
  const byDay = new Map<string, UsageTotals>();
  const seen = new Set<string>();
  const sessions = await Promise.all(files.map(parseSession));
  sessions.sort(
    (left, right) =>
      left.startedAt - right.startedAt || left.file.localeCompare(right.file),
  );
  const malformedLines = sessions.reduce(
    (sum, session) => sum + session.malformedLines,
    0,
  );

  for (const session of sessions) {
    for (const record of session.records) {
      if (seen.has(record.stableId)) continue;
      seen.add(record.stableId);
      add(totals, record.value);
      breakdown(byModel, record.model, record.value);
      breakdown(byProvider, record.provider, record.value);
      breakdown(byProject, record.project, record.value);
      breakdown(byDay, record.day, record.value);
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    sessionFiles: files.length,
    malformedLines,
    totals,
    byModel: sorted(byModel),
    byProvider: sorted(byProvider),
    byProject: sorted(byProject),
    byDay: sorted(byDay, true),
  };
}

export function formatSummary(stats: PiStats) {
  const reusable = stats.totals.input + stats.totals.cacheRead;
  const cacheRate =
    reusable > 0 ? (stats.totals.cacheRead / reusable) * 100 : 0;
  const errorRate =
    stats.totals.requests > 0
      ? (stats.totals.errors / stats.totals.requests) * 100
      : 0;
  return [
    `${stats.totals.requests.toLocaleString()} requests across ${stats.sessionFiles.toLocaleString()} session files`,
    `$${stats.totals.cost.toFixed(2)} total cost`,
    `${stats.totals.totalTokens.toLocaleString()} tokens (${stats.totals.output.toLocaleString()} output, ${stats.totals.reasoning.toLocaleString()} reasoning)`,
    `${cacheRate.toFixed(1)}% cache reuse`,
    `${errorRate.toFixed(1)}% errors`,
    stats.malformedLines > 0
      ? `${stats.malformedLines} malformed JSONL lines skipped`
      : "No malformed JSONL lines",
  ].join("\n");
}
