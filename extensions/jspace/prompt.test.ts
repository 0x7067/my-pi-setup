import assert from "node:assert/strict";
import test from "node:test";
import { buildJspaceSystemPrompt, JSPACE_POLICY } from "./src/prompt.ts";
import { applyCheckpoint, emptyState } from "./src/state.ts";

test("policy stays compact and operational", () => {
  assert.ok(JSPACE_POLICY.length < 1_200);
  assert.match(JSPACE_POLICY, /verifier and coverage/);
  assert.doesNotMatch(JSPACE_POLICY, /inner workspace|conscious|introspect/i);
});

test("system prompt includes the current branch ledger once", () => {
  const state = applyCheckpoint(emptyState(), {
    goal: "Finish the extension",
    core: ["default off"],
    next: "Run tests",
  });
  const result = buildJspaceSystemPrompt("BASE", state);
  assert.ok(result.startsWith("BASE\n\n"));
  assert.equal(result.match(/Current J-Space ledger:/g)?.length, 1);
  assert.match(result, /goal: Finish the extension/);
  assert.match(result, /next: Run tests/);
});
