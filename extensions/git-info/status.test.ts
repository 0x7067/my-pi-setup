import assert from "node:assert/strict";
import test from "node:test";
import { parseGitStatus } from "./src/status.ts";

test("parses a tracked branch and changed files from one status response", () => {
  assert.deepEqual(
    parseGitStatus(
      "## feature/ui...origin/feature/ui [ahead 1]\n M src/app.ts\n?? notes.txt\n",
    ),
    { branchName: "feature/ui", changedFiles: 2 },
  );
});

test("parses initial and detached repositories", () => {
  assert.deepEqual(
    parseGitStatus("## No commits yet on main\n?? README.md\n"),
    {
      branchName: "main",
      changedFiles: 1,
    },
  );
  assert.deepEqual(parseGitStatus("## HEAD (no branch)\n"), {
    branchName: null,
    changedFiles: 0,
  });
});

test("rejects output that is not a repository status", () => {
  assert.equal(parseGitStatus("fatal: not a git repository\n"), null);
});
