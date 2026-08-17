import assert from "node:assert/strict";
import test from "node:test";
import { makeRefreshCoordinator } from "./src/refresh-coordinator.ts";

test("an explicit refresh waits for an active background refresh", async () => {
  const coordinator = makeRefreshCoordinator();
  let state = 0;
  let releaseBackground: (() => void) | undefined;
  const release = new Promise<void>((resolve) => {
    releaseBackground = resolve;
  });
  let markStarted: (() => void) | undefined;
  const started = new Promise<void>((resolve) => {
    markStarted = resolve;
  });

  const background = coordinator.run(async () => {
    markStarted?.();
    await release;
    state = 1;
  });

  await started;
  const skipped = coordinator.runIfIdle(async () => {
    state = 99;
  });

  const forced = coordinator.run(async () => {
    state += 1;
    return state;
  });

  releaseBackground?.();
  await background;
  const result = await forced;

  assert.equal(skipped, undefined);
  assert.equal(result, 2);
  assert.equal(state, 2);
});
