import assert from "node:assert/strict";
import test from "node:test";
import { RelayEventBuffer } from "./chrome-extension/event-buffer.js";

test("bounds debugger events and reports dropped entries", () => {
  const events = new RelayEventBuffer({ maxEvents: 2, maxBytes: 10_000 });
  events.push(7, "Network.one", { value: 1 });
  events.push(7, "Runtime.two", { value: 2 });
  events.push(7, "Network.three", { value: 3 });

  const drained = events.drain(7, { clear: false });
  assert.deepEqual(
    drained.events.map(({ method, params }) => ({ method, params })),
    [
      { method: "Runtime.two", params: { value: 2 } },
      { method: "Network.three", params: { value: 3 } },
    ],
  );
  assert.equal(drained.dropped, 1);
  assert.equal(drained.pending, 2);
});

test("filters and drains only returned debugger events", () => {
  const events = new RelayEventBuffer();
  events.push(7, "Network.requestWillBeSent", { requestId: "one" });
  events.push(7, "Runtime.consoleAPICalled", { type: "log" });
  events.push(7, "Network.loadingFinished", { requestId: "one" });

  const first = events.drain(7, { methodPrefix: "Network.", limit: 1 });
  assert.equal(first.events[0]?.method, "Network.requestWillBeSent");
  assert.equal(first.pending, 2);

  const remaining = events.drain(7);
  assert.deepEqual(
    remaining.events.map((event) => event.method),
    ["Runtime.consoleAPICalled", "Network.loadingFinished"],
  );
  assert.equal(remaining.pending, 0);
});

test("enforces the byte cap using UTF-8 bytes", () => {
  const events = new RelayEventBuffer({ maxEvents: 10, maxBytes: 130 });
  events.push(7, "Runtime.consoleAPICalled", { value: "😀".repeat(20) });

  const drained = events.drain(7);
  assert.equal(drained.events.length, 0);
  assert.equal(drained.dropped, 1);
});
