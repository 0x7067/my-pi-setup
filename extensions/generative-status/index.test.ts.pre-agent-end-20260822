import assert from "node:assert/strict";
import test from "node:test";
import {
  default as generativeStatus,
  loaderFrames,
  parseLoaderStyle,
  styleChoices,
  toolMessage,
} from "./index.ts";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";

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

test("the working row exists only while the agent is active", async () => {
  const handlers = new Map<
    string,
    (event: unknown, ctx: ExtensionContext) => void | Promise<void>
  >();
  const visibility: boolean[] = [];
  const thinkingLabels: Array<string | undefined> = [];
  const pi = {
    on: (
      event: string,
      handler: (event: unknown, ctx: ExtensionContext) => void,
    ) => handlers.set(event, handler),
    registerCommand: () => undefined,
  } as unknown as ExtensionAPI;
  const ctx = {
    mode: "tui",
    isIdle: () => true,
    ui: {
      theme,
      setHiddenThinkingLabel: (label?: string) => thinkingLabels.push(label),
      setWorkingVisible: (visible: boolean) => visibility.push(visible),
      setWorkingIndicator: () => undefined,
      setWorkingMessage: () => undefined,
    },
  } as unknown as ExtensionContext;

  generativeStatus(pi);
  await handlers.get("session_start")?.({}, ctx);
  await handlers.get("agent_start")?.({}, ctx);
  await handlers.get("agent_settled")?.({}, ctx);
  await handlers.get("session_shutdown")?.({}, ctx);

  assert.deepEqual(visibility, [false, true, false, true]);
  assert.deepEqual(thinkingLabels, ["", undefined]);
});
