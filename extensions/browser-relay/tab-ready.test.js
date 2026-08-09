import assert from "node:assert/strict";
import test from "node:test";
import { waitForCommittedTab } from "./chrome-extension/tab-ready.js";

const isAttachable = (url) => /^(https?|file):/.test(url ?? "");

test("waits for a new tab to commit its requested URL", async () => {
  const states = [
    { id: 7, url: "about:blank", pendingUrl: "https://example.com/" },
    { id: 7, url: "https://example.com/" },
  ];
  let calls = 0;
  const tabs = {
    async get() {
      const state = states[Math.min(calls, states.length - 1)];
      calls += 1;
      return state;
    },
  };

  assert.equal(
    (await waitForCommittedTab(tabs, 7, isAttachable)).url,
    "https://example.com/",
  );
  assert.equal(calls, 2);
});

test("throws when the tab never commits an attachable URL", async (t) => {
  const realNow = Date.now;
  t.after(() => {
    Date.now = realNow;
  });
  let now = 0;
  Date.now = () => {
    const value = now;
    now += 5_000;
    return value;
  };
  const tabs = {
    async get() {
      return { id: 7, url: "about:blank" };
    },
  };

  await assert.rejects(
    waitForCommittedTab(tabs, 7, isAttachable),
    /did not commit an attachable URL/,
  );
});
