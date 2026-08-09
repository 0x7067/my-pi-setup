import assert from "node:assert/strict";
import test from "node:test";
import { coalesceFrames, toolMessage } from "./index.ts";

const theme = {
  fg: (role: string, text: string) => `<${role}>${text}`,
};

test("coalesce animation grows to a solid glyph and recedes", () => {
  assert.deepEqual(coalesceFrames(theme, false), [
    "<muted>·",
    "<accent>∙",
    "<accent>●",
    "<accent>∙",
  ]);
});

test("reduced motion uses one static frame", () => {
  assert.deepEqual(coalesceFrames(theme, true), ["<accent>●"]);
});

test("tool labels are humanized and have a safe fallback", () => {
  assert.equal(toolMessage("read_file"), "Using read file…");
  assert.equal(toolMessage("\u001b[31mread_file"), "Using read file…");
  assert.equal(toolMessage(" "), "Using a tool…");
});
