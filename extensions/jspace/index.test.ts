import assert from "node:assert/strict";
import test from "node:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import jspaceMode, { usageFromMessages } from "./index.ts";
import {
  METRICS_ENTRY_TYPE,
  MODE_ENTRY_TYPE,
  STATE_ENTRY_TYPE,
} from "./src/state.ts";

function harness(flag?: string) {
  const handlers = new Map<string, Array<(event: any, ctx: any) => any>>();
  const commands = new Map<string, any>();
  const tools = new Map<string, any>();
  const branch: any[] = [];
  const notifications: Array<{ text: string; level: string }> = [];
  const statuses = new Map<string, string | undefined>();
  let activeTools = ["read", "jspace_checkpoint"];

  const pi = {
    registerFlag() {},
    getFlag: () => flag,
    registerCommand: (name: string, options: any) =>
      commands.set(name, options),
    registerTool: (tool: any) => tools.set(tool.name, tool),
    on: (event: string, handler: (event: any, ctx: any) => any) => {
      const values = handlers.get(event) ?? [];
      values.push(handler);
      handlers.set(event, values);
    },
    appendEntry: (customType: string, data: unknown) =>
      branch.push({ type: "custom", customType, data }),
    getActiveTools: () => [...activeTools],
    setActiveTools: (names: string[]) => {
      activeTools = [...names];
    },
  } as unknown as ExtensionAPI;

  const ctx = {
    mode: "print",
    model: { provider: "ollama", id: "qwen3.8-27b" },
    sessionManager: { getBranch: () => branch },
    ui: {
      setStatus: (key: string, value: string | undefined) =>
        statuses.set(key, value),
      notify: (text: string, level: string) =>
        notifications.push({ text, level }),
    },
  };

  const emit = async (event: string, payload: any = {}) => {
    let result: any;
    for (const handler of handlers.get(event) ?? []) {
      result = (await handler(payload, ctx)) ?? result;
    }
    return result;
  };

  jspaceMode(pi);
  return {
    branch,
    commands,
    tools,
    notifications,
    statuses,
    emit,
    ctx,
    activeTools: () => activeTools,
  };
}

test("configured observe is prompt-neutral and removes the checkpoint tool", async () => {
  const h = harness();
  await h.emit("session_start");
  assert.deepEqual(h.activeTools(), ["read"]);
  assert.equal(h.statuses.get("jspace"), "jspace observe");
  const result = await h.emit("before_agent_start", { systemPrompt: "BASE" });
  assert.equal(result, undefined);
});

test("explicit off overrides the configured default", async () => {
  const h = harness("off");
  await h.emit("session_start");
  assert.deepEqual(h.activeTools(), ["read"]);
  assert.equal(h.statuses.get("jspace"), undefined);
});

test("observe records metrics without changing the prompt", async () => {
  const h = harness("observe");
  await h.emit("session_start");
  assert.deepEqual(h.activeTools(), ["read"]);
  assert.equal(
    await h.emit("before_agent_start", { systemPrompt: "BASE" }),
    undefined,
  );
  await h.emit("agent_start");
  await h.emit("tool_call", { toolName: "read" });
  await h.emit("tool_result", { isError: false });
  await h.emit("turn_end");
  await h.emit("agent_end", {
    messages: [
      {
        role: "assistant",
        usage: {
          input: 10,
          output: 4,
          cacheRead: 2,
          cacheWrite: 1,
          totalTokens: 17,
        },
      },
    ],
  });
  const metrics = h.branch.find(
    (entry) => entry.customType === METRICS_ENTRY_TYPE,
  );
  assert.equal(metrics?.data.mode, "observe");
  assert.equal(metrics?.data.toolCalls, 1);
  assert.equal(metrics?.data.usage.totalTokens, 17);
});

test("on injects policy and persists structured checkpoints", async () => {
  const h = harness("on");
  await h.emit("session_start");
  assert.ok(h.activeTools().includes("jspace_checkpoint"));
  const result = await h.emit("before_agent_start", { systemPrompt: "BASE" });
  assert.match(result.systemPrompt, /J-Space session mode is on/);

  const tool = h.tools.get("jspace_checkpoint");
  const output = await tool.execute(
    "call-1",
    {
      goal: "Ship the extension",
      core: ["default off"],
      next: "Run validation",
    },
    undefined,
    () => {},
    h.ctx,
  );
  assert.match(output.content[0].text, /goal: Ship the extension/);
  assert.ok(h.branch.some((entry) => entry.customType === STATE_ENTRY_TYPE));
});

test("command changes are branch-local and reset preserves mode", async () => {
  const h = harness();
  await h.emit("session_start");
  await h.commands.get("jspace").handler("on", h.ctx);
  assert.equal(h.branch.at(-1)?.customType, MODE_ENTRY_TYPE);
  assert.ok(h.activeTools().includes("jspace_checkpoint"));
  await h.commands.get("jspace").handler("reset", h.ctx);
  assert.equal(h.branch.at(-1)?.customType, STATE_ENTRY_TYPE);
  assert.ok(h.activeTools().includes("jspace_checkpoint"));
});

test("usage aggregation ignores non-assistant and malformed values", () => {
  assert.deepEqual(
    usageFromMessages([
      { role: "user" },
      { role: "assistant", usage: { input: 2, output: 3, totalTokens: 5 } },
      { role: "assistant", usage: { input: -1, output: 4, totalTokens: 4 } },
    ]),
    {
      input: 2,
      output: 7,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 9,
    },
  );
});
