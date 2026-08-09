import assert from "node:assert/strict";
import test from "node:test";
import { ElementRefGenerations, resolveNodeId, toonText } from "./index.ts";

test("encodes structured model output as compact TOON", () => {
  assert.equal(toonText(undefined), "null");
  const rows = [
    { id: 1, name: "one" },
    { id: 2, name: "two" },
  ];
  assert.equal(toonText(rows), "[2]{id,name}:\n  1,one\n  2,two");
  assert.ok(toonText(rows).length < JSON.stringify(rows, null, 2).length);
  assert.throws(
    () => toonText("x".repeat(1024 * 1024 + 1)),
    /result exceeds 1 MiB/,
  );
});

test("invalidates refs across mutations and failed postcondition snapshots", () => {
  const refs = new ElementRefGenerations();
  assert.equal(refs.install(7), 1);
  assert.equal(resolveNodeId("g1:42", undefined, refs.current(7)), 42);
  assert.equal(resolveNodeId(undefined, 42, refs.current(7)), 42);

  // A mutation starts by invalidating the current generation. If its optional
  // or automatic postcondition snapshot never installs a replacement, the old
  // ref must remain stale.
  refs.invalidate(7);
  assert.throws(
    () => resolveNodeId("g1:42", undefined, refs.current(7)),
    /STALE_REF.*latest snapshot/,
  );
  assert.throws(
    () => resolveNodeId(undefined, 42, refs.current(7)),
    /STALE_REF.*no current snapshot/,
  );
  assert.equal(refs.install(7), 2);
});
