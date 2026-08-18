import assert from "node:assert/strict";
import test from "node:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import jspaceMode, { usageFromMessages } from "./index.ts";
import {
  METRICS_ENTRY_TYPE,
  MODE_ENTRY_TYPE,
  OUTCOME_ENTRY_TYPE,
  STATE_ENTRY_TYPE,
} from "./src/state.ts";

function harness(
  flag?: string,
  rateRun?: (options: {
    transcript: string;
    signal: AbortSignal;
  }) => Promise<any>,
) {
  const handlers = new Map<string, Array<(event: any, ctx: any) => any>>();
  const commands = new Map<string, any>();
  const tools = new Map<string, any>();
  const branch: any[] = [];
  let nextId = 0;
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
      branch.push({ id: String(++nextId), type: "custom", customType, data }),
    getActiveTools: () => [...activeTools],
    setActiveTools: (names: string[]) => {
      activeTools = [...names];
    },
  } as unknown as ExtensionAPI;

  const ctx = {
    mode: "print",
    model: { provider: "ollama", id: "qwen3.8-27b" },
    sessionManager: {
      getBranch: () => branch,
      getLeafId: () => branch.at(-1)?.id ?? null,
    },
    modelRegistry: {},
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

  jspaceMode(pi, {
    rateRun: rateRun as any,
    loadRaterConfig: () => ({
      provider: "p",
      model: "m",
      reasoning: "off" as const,
    }),
  });
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
  // A blocked checkpoint call never runs and must not count.
  assert.deepEqual(
    await h.emit("tool_call", { toolName: "jspace_checkpoint" }),
    {
      block: true,
      reason: "J-Space mode is not on.",
    },
  );
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

test("rate attaches an outcome to the last run and status compares modes", async () => {
  const h = harness("observe");
  await h.emit("session_start");
  const command = h.commands.get("jspace");

  await command.handler("rate ok", h.ctx);
  assert.equal(h.notifications.at(-1)?.level, "error");
  assert.ok(!h.branch.some((entry) => entry.customType === OUTCOME_ENTRY_TYPE));

  await h.emit("agent_start");
  await h.emit("turn_end");
  await h.emit("agent_end", { messages: [] });
  await command.handler("rate fail", h.ctx);
  const outcome = h.branch
    .filter((entry) => entry.customType === OUTCOME_ENTRY_TYPE)
    .at(-1);
  const run = h.branch
    .filter((entry) => entry.customType === METRICS_ENTRY_TYPE)
    .at(-1);
  assert.deepEqual(outcome?.data, {
    runId: run?.data.runId,
    outcome: "fail",
    source: "manual",
  });
  assert.match(run?.data.runId, /^[0-9a-f-]{36}$/);
  assert.match(
    h.notifications.at(-1)?.text ?? "",
    /Last observe run rated fail/,
  );

  await command.handler("on", h.ctx);
  await h.emit("agent_start");
  await h.emit("turn_end");
  await h.emit("agent_end", { messages: [] });
  const runs = h.branch.filter(
    (entry) => entry.customType === METRICS_ENTRY_TYPE,
  );
  assert.notEqual(runs[1].data.runId, runs[0].data.runId);
  await command.handler("status", h.ctx);
  const status = h.notifications.at(-1)?.text ?? "";
  assert.match(status, /last run: .* · unrated/);
  assert.match(status, /observe: 1 run\(s\) .* 0 ok \/ 1 fail \/ 0 unrated/);
  await command.handler("rate ok", h.ctx);
  await command.handler("status", h.ctx);
  assert.match(
    h.notifications.at(-1)?.text ?? "",
    /last run: .* · rated ok \(manual\)/,
  );
  assert.match(status, /on: 1 run\(s\) .* 0 ok \/ 0 fail \/ 1 unrated/);
});

const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

async function runOnce(h: ReturnType<typeof harness>) {
  await h.emit("before_agent_start", { systemPrompt: "BASE" });
  await h.emit("agent_start");
  await h.emit("turn_end");
  await h.emit("agent_end", { messages: [] });
  await h.emit("agent_settled");
  await settle();
}

test("model rating runs in the TUI after settle and defers to manual ratings", async () => {
  const seen: string[] = [];
  const h = harness("observe", async ({ transcript }) => {
    seen.push(transcript);
    return { outcome: "ok", reason: "tests pass" };
  });
  h.ctx.mode = "tui";
  await h.emit("session_start");
  await runOnce(h);
  const run = h.branch
    .filter((entry) => entry.customType === METRICS_ENTRY_TYPE)
    .at(-1);
  const outcome = h.branch
    .filter((entry) => entry.customType === OUTCOME_ENTRY_TYPE)
    .at(-1);
  assert.equal(seen.length, 1);
  assert.deepEqual(outcome?.data, {
    runId: run?.data.runId,
    outcome: "ok",
    source: "model",
    reason: "tests pass",
  });
  assert.match(
    h.notifications.at(-1)?.text ?? "",
    /model rating: ok — tests pass/,
  );

  // A manual rating recorded before the model answers is kept.
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  const h2 = harness("observe", async () => {
    await gate;
    return { outcome: "fail", reason: "late" };
  });
  h2.ctx.mode = "tui";
  await h2.emit("session_start");
  await runOnce(h2);
  await h2.commands.get("jspace").handler("rate ok", h2.ctx);
  release();
  await settle();
  const outcomes = h2.branch.filter(
    (entry) => entry.customType === OUTCOME_ENTRY_TYPE,
  );
  assert.equal(outcomes.length, 1);
  assert.equal(outcomes[0].data.source, "manual");
});

test("changing the session tree aborts an in-flight model rating", async () => {
  let release!: () => void;
  let signal: AbortSignal | undefined;
  const gate = new Promise<void>((resolve) => (release = resolve));
  const h = harness("observe", async (options) => {
    signal = options.signal;
    await gate;
    return { outcome: "ok", reason: "late" };
  });
  h.ctx.mode = "tui";
  await h.emit("session_start");
  await runOnce(h);

  await h.emit("session_tree");
  assert.equal(signal?.aborted, true);
  release();
  await settle();
  assert.ok(!h.branch.some((entry) => entry.customType === OUTCOME_ENTRY_TYPE));
});

test("model rating is skipped off-TUI, when off, and when unclear or failing", async () => {
  let calls = 0;
  const h = harness("observe", async () => {
    calls += 1;
    return { outcome: "unclear", reason: "" };
  });
  await h.emit("session_start");
  await runOnce(h);
  assert.equal(calls, 0, "print mode does not rate");

  h.ctx.mode = "tui";
  await h.commands.get("jspace").handler("off", h.ctx);
  await runOnce(h);
  assert.equal(calls, 0, "off mode does not rate");

  await h.commands.get("jspace").handler("on", h.ctx);
  await runOnce(h);
  assert.equal(calls, 1);
  assert.ok(!h.branch.some((entry) => entry.customType === OUTCOME_ENTRY_TYPE));

  const failing = harness("observe", async () => {
    throw new Error("boom");
  });
  failing.ctx.mode = "tui";
  await failing.emit("session_start");
  await runOnce(failing);
  assert.match(
    failing.notifications.at(-1)?.text ?? "",
    /rating failed\. boom/,
  );
  assert.equal(failing.notifications.at(-1)?.level, "warning");
});
