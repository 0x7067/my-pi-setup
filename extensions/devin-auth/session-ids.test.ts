import assert from "node:assert/strict";
import test from "node:test";
import {
  clearSessionIds,
  getOrAllocateSessionIds,
} from "./src/cloud-direct/session-ids.ts";

test("keeps cache identity stable for the same Pi conversation", () => {
  const first = getOrAllocateSessionIds("key", "host", "conversation-a");
  clearSessionIds();
  const second = getOrAllocateSessionIds("key", "host", "conversation-a");

  assert.deepEqual(second, first);
  assert.match(first.sessionId, /^[0-9a-f-]{36}$/);
  assert.match(first.cascadeId, /^[0-9a-f-]{36}$/);
  assert.notEqual(first.sessionId, first.cascadeId);
});

test("isolates different Pi conversations using the same account", () => {
  const first = getOrAllocateSessionIds("key", "host", "conversation-a");
  const second = getOrAllocateSessionIds("key", "host", "conversation-b");

  assert.notEqual(second.sessionId, first.sessionId);
  assert.notEqual(second.cascadeId, first.cascadeId);
});

test("honors an explicit cascade ID without changing the session ID", () => {
  const normal = getOrAllocateSessionIds("key", "host", "conversation-a");
  const overridden = getOrAllocateSessionIds(
    "key",
    "host",
    "conversation-a",
    "cascade-override",
  );

  assert.equal(overridden.sessionId, normal.sessionId);
  assert.equal(overridden.cascadeId, "cascade-override");
});

test("retains the legacy process-local fallback without a conversation ID", () => {
  clearSessionIds();
  const first = getOrAllocateSessionIds("key", "host");
  const second = getOrAllocateSessionIds("key", "host");

  assert.deepEqual(second, first);

  clearSessionIds();
  const afterClear = getOrAllocateSessionIds("key", "host");
  assert.notEqual(afterClear.sessionId, first.sessionId);
});
