import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  applyCheckpoint,
  emptyState,
  METRICS_ENTRY_TYPE,
  MODE_ENTRY_TYPE,
  OUTCOME_ENTRY_TYPE,
  parseJspaceArgs,
  readDefaultMode,
  readMetricsFromBranch,
  readModeFromBranch,
  readOutcomesFromBranch,
  readStateFromBranch,
  STATE_ENTRY_TYPE,
  summarizeMetricsByMode,
  type JspaceRunMetrics,
} from "./src/state.ts";

const entry = (customType: string, data: unknown) => ({
  type: "custom",
  customType,
  data,
});

test("mode parsing is explicit and defaults to status", () => {
  assert.deepEqual(parseJspaceArgs(""), { action: "status" });
  assert.deepEqual(parseJspaceArgs(" observe "), {
    action: "set",
    mode: "observe",
  });
  assert.equal(parseJspaceArgs("automatic").action, "error");
  assert.deepEqual(parseJspaceArgs("rate ok"), {
    action: "rate",
    outcome: "ok",
  });
  assert.deepEqual(parseJspaceArgs("Rate  FAIL"), {
    action: "rate",
    outcome: "fail",
  });
  assert.equal(parseJspaceArgs("rate").action, "error");
  assert.equal(parseJspaceArgs("rate great").action, "error");
});

test("branch mode uses the latest valid entry", () => {
  assert.equal(
    readModeFromBranch([
      entry(MODE_ENTRY_TYPE, { mode: "on" }),
      entry(MODE_ENTRY_TYPE, { mode: "bogus" }),
      entry(MODE_ENTRY_TYPE, { mode: "observe" }),
    ]),
    "observe",
  );
});

test("default mode is read from config and fails safe to off", () => {
  const dir = mkdtempSync(join(tmpdir(), "jspace-mode-"));
  const path = join(dir, "jspace");
  try {
    assert.equal(readDefaultMode(path), "off");
    writeFileSync(path, "observe\n");
    assert.equal(readDefaultMode(path), "observe");
    writeFileSync(path, "automatic\n");
    assert.equal(readDefaultMode(path), "off");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("checkpoint requires a goal, next action, verifier, and coverage", () => {
  assert.throws(
    () => applyCheckpoint(emptyState(), { next: "Inspect" }),
    /first checkpoint must set goal/i,
  );
  const state = applyCheckpoint(emptyState(), {
    goal: "Ship a measured pilot",
    core: ["default off", "branch local"],
    verified: {
      claim: "Loader found the extension",
      by: "Pi resource loader",
      coverage: "one isolated agent directory",
    },
    open: ["Does on mode help real work?"],
    next: "Run a matched task",
  });
  assert.equal(state.verified[0]?.id, 1);
  assert.equal(state.next, "Run a matched task");
  assert.throws(
    () => applyCheckpoint(state, { core: ["a", "b", "c"], next: "x" }),
    /at most 2/i,
  );
});

test("latest valid ledger snapshot wins", () => {
  const first = applyCheckpoint(emptyState(), {
    goal: "Pilot",
    next: "First",
  });
  const second = applyCheckpoint(first, { next: "Second" });
  assert.equal(
    readStateFromBranch([
      entry(STATE_ENTRY_TYPE, first),
      entry(STATE_ENTRY_TYPE, { malformed: true }),
      entry(STATE_ENTRY_TYPE, second),
    ]).next,
    "Second",
  );
});

test("metrics reader ignores malformed entries and derives legacy run ids", () => {
  const metrics = {
    mode: "observe",
    timestamp: 1,
    durationMs: 10,
    turns: 1,
    toolCalls: 2,
    toolErrors: 0,
    provider: "ollama",
    model: "qwen",
    usage: {
      input: 5,
      output: 3,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 8,
    },
  };
  assert.deepEqual(
    readMetricsFromBranch([
      entry(METRICS_ENTRY_TYPE, { mode: "off" }),
      entry(METRICS_ENTRY_TYPE, metrics),
      entry(METRICS_ENTRY_TYPE, metrics),
      entry(METRICS_ENTRY_TYPE, { ...metrics, runId: "abc" }),
    ]),
    [
      { ...metrics, runId: "ts:1:1" },
      { ...metrics, runId: "ts:1:2" },
      { ...metrics, runId: "abc" },
    ],
  );
});

test("per-mode summary averages runs and joins the latest outcome by timestamp", () => {
  const run = (
    mode: "observe" | "on",
    timestamp: number,
    durationMs: number,
    totalTokens: number,
  ): JspaceRunMetrics => ({
    runId: `run-${timestamp}`,
    mode,
    timestamp,
    durationMs,
    turns: 2,
    toolCalls: 4,
    toolErrors: 1,
    provider: "p",
    model: "m",
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens },
  });
  const outcomes = readOutcomesFromBranch([
    entry(OUTCOME_ENTRY_TYPE, {
      runId: "run-1",
      outcome: "fail",
      source: "model",
    }),
    entry(OUTCOME_ENTRY_TYPE, {
      runId: "run-1",
      outcome: "ok",
      source: "manual",
    }),
    // A later model rating never replaces a manual one.
    entry(OUTCOME_ENTRY_TYPE, {
      runId: "run-1",
      outcome: "fail",
      source: "model",
      reason: "late",
    }),
    entry(OUTCOME_ENTRY_TYPE, {
      runId: "run-3",
      outcome: "maybe",
      source: "model",
    }),
    entry(OUTCOME_ENTRY_TYPE, {
      runId: "run-3",
      outcome: "ok",
      source: "robot",
    }),
    entry(OUTCOME_ENTRY_TYPE, { runId: "", outcome: "ok", source: "manual" }),
  ]);
  assert.deepEqual(
    [...outcomes],
    [["run-1", { runId: "run-1", outcome: "ok", source: "manual" }]],
  );
  const lines = summarizeMetricsByMode(
    [
      run("observe", 1, 10_000, 100),
      run("observe", 2, 20_000, 300),
      run("on", 3, 5_000, 50),
    ],
    outcomes,
  );
  assert.equal(lines.length, 2);
  assert.match(
    lines[0]!,
    /^observe: 2 run\(s\) · mean 15\.0s · 2\.0 turn\(s\) · 4\.0 tool call\(s\) · 1\.00 error\(s\) · 200 tokens · 1 ok \/ 0 fail \/ 1 unrated$/,
  );
  assert.match(
    lines[1]!,
    /^on: 1 run\(s\) · mean 5\.0s .* 50 tokens · 0 ok \/ 0 fail \/ 1 unrated$/,
  );
  assert.deepEqual(summarizeMetricsByMode([], outcomes), []);
});
