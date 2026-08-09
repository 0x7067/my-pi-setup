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
