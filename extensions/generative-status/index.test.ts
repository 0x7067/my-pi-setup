import assert from "node:assert/strict";
import test from "node:test";
import {
  loaderFrames,
  parseLoaderStyle,
  styleChoices,
  toolMessage,
} from "./index.ts";

const theme = {
  fg: (role: string, text: string) => `<${role}>${text}`,
};

test("choreography coalesces while thinking", () => {
  assert.deepEqual(loaderFrames(theme, "choreography", "thinking", false), [
    "<muted>·",
    "<accent>∙",
    "<accent>●",
    "<accent>∙",
  ]);
});

test("choreography switches to signal frames for tools", () => {
  assert.deepEqual(loaderFrames(theme, "choreography", "tool", false), [
    "<accent>▁",
    "<accent>▃",
    "<accent>▅",
    "<accent>▇",
    "<accent>▅",
    "<accent>▃",
  ]);
});

test("orbit and Pi default styles stay available", () => {
  assert.deepEqual(loaderFrames(theme, "orbit", "thinking", false), [
    "<accent>◜",
    "<accent>◝",
    "<accent>◞",
    "<accent>◟",
  ]);
  assert.equal(loaderFrames(theme, "default", "thinking", false), undefined);
});

test("reduced motion overrides animated styles", () => {
  assert.deepEqual(loaderFrames(theme, "orbit", "tool", true), ["<accent>●"]);
});

test("loader style defaults safely", () => {
  assert.equal(parseLoaderStyle("signal"), "signal");
  assert.equal(parseLoaderStyle("surprise"), "choreography");
  assert.equal(parseLoaderStyle(undefined), "choreography");
});

test("the active style appears first in the picker", () => {
  const choices = styleChoices("orbit");
  assert.equal(choices[0]?.style, "orbit");
  assert.equal(choices.length, 6);
  assert.equal(new Set(choices.map(({ style }) => style)).size, 6);
});

test("tool labels are humanized and have a safe fallback", () => {
  assert.equal(toolMessage("read_file"), "Using read file…");
  assert.equal(toolMessage("\u001b[31mread_file"), "Using read file…");
  assert.equal(toolMessage(" "), "Using a tool…");
});
