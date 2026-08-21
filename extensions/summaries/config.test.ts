import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  DEFAULT_SUMMARY_CONFIG,
  parseSummaryConfig,
  runSummariesEnabled,
} from "./src/config.ts";

test("summary config defaults to Codex Luna at medium reasoning", () => {
  assert.deepEqual(parseSummaryConfig(undefined), DEFAULT_SUMMARY_CONFIG);
  assert.deepEqual(DEFAULT_SUMMARY_CONFIG, {
    provider: "openai-codex",
    model: "gpt-5.6-luna",
    reasoning: "medium",
  });
});

test("run summaries honor the explicit off switch", () => {
  const directory = mkdtempSync(join(tmpdir(), "pi-summaries-"));
  const path = join(directory, "enabled");

  try {
    assert.equal(runSummariesEnabled(path), true);
    writeFileSync(path, "off\n");
    assert.equal(runSummariesEnabled(path), false);
    writeFileSync(path, "on\n");
    assert.equal(runSummariesEnabled(path), true);
    assert.equal(readFileSync(path, "utf8"), "on\n");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("summary config accepts valid private overrides and rejects partial corruption", () => {
  assert.deepEqual(
    parseSummaryConfig({
      provider: " anthropic ",
      model: " claude-sonnet ",
      reasoning: "high",
    }),
    {
      provider: "anthropic",
      model: "claude-sonnet",
      reasoning: "high",
    },
  );

  assert.deepEqual(
    parseSummaryConfig({ provider: "", model: 42, reasoning: "turbo" }),
    DEFAULT_SUMMARY_CONFIG,
  );
  assert.deepEqual(
    parseSummaryConfig({
      provider: "anthropic",
      model: 42,
      reasoning: "high",
    }),
    DEFAULT_SUMMARY_CONFIG,
  );
});
