import assert from "node:assert/strict";
import test from "node:test";

import { nativeBinaryFilenames } from "./native-node.ts";

test("orders Linux x64 native binaries by detected CPU support", () => {
  assert.deepEqual(nativeBinaryFilenames("linux", "x64", "modern"), [
    "pi_natives.linux-x64-modern.node",
    "pi_natives.linux-x64-baseline.node",
    "pi_natives.linux-x64.node",
  ]);
  assert.deepEqual(nativeBinaryFilenames("linux", "x64", "baseline"), [
    "pi_natives.linux-x64-baseline.node",
    "pi_natives.linux-x64.node",
  ]);
});

test("uses the unsuffixed binary on non-x64 platforms", () => {
  assert.deepEqual(nativeBinaryFilenames("darwin", "arm64", null), [
    "pi_natives.darwin-arm64.node",
  ]);
});
