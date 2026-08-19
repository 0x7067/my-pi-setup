import assert from "node:assert/strict";
import test from "node:test";
import { isPersistentSession } from "../ai-memory.ts";

test("ai-memory ignores in-memory sessions", () => {
  assert.equal(
    isPersistentSession({
      sessionManager: {
        getSessionFile: () => undefined,
      },
    }),
    false,
  );
});

test("ai-memory captures persisted sessions", () => {
  assert.equal(
    isPersistentSession({
      sessionManager: {
        getSessionFile: () => "/tmp/session.jsonl",
      },
    }),
    true,
  );
});
