import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Type, type Static } from "typebox";
import { buildJspaceSystemPrompt } from "./src/prompt.ts";
import {
  applyCheckpoint,
  emptyState,
  isJspaceMode,
  METRICS_ENTRY_TYPE,
  MODE_ENTRY_TYPE,
  parseJspaceArgs,
  readDefaultMode,
  readMetricsFromBranch,
  readModeFromBranch,
  readStateFromBranch,
  STATE_ENTRY_TYPE,
  summarizeState,
  type JspaceMode,
  type JspaceRunMetrics,
  type UsageTotals,
} from "./src/state.ts";

const TOOL_NAME = "jspace_checkpoint";

const VerifiedSchema = Type.Object(
  {
    claim: Type.String({ maxLength: 500 }),
    by: Type.String({ maxLength: 500 }),
    coverage: Type.String({ maxLength: 500 }),
  },
  { additionalProperties: false },
);

const CheckpointParameters = Type.Object(
  {
    goal: Type.Optional(Type.String({ maxLength: 500 })),
    core: Type.Optional(
      Type.Array(Type.String({ maxLength: 240 }), { maxItems: 2 }),
    ),
    verified: Type.Optional(VerifiedSchema),
    open: Type.Optional(
      Type.Array(Type.String({ maxLength: 400 }), { maxItems: 8 }),
    ),
    next: Type.String({ maxLength: 500 }),
  },
  { additionalProperties: false },
);

type CheckpointParameters = Static<typeof CheckpointParameters>;

interface ActiveRun {
  readonly mode: "observe" | "on";
  readonly startedAt: number;
  turns: number;
  toolCalls: number;
  toolErrors: number;
}

interface UsageLike {
  readonly input?: unknown;
  readonly output?: unknown;
  readonly cacheRead?: unknown;
  readonly cacheWrite?: unknown;
  readonly totalTokens?: unknown;
}

interface MessageLike {
  readonly role?: unknown;
  readonly usage?: UsageLike;
}

const numberOrZero = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;

export function usageFromMessages(messages: readonly unknown[]): UsageTotals {
  let input = 0;
  let output = 0;
  let cacheRead = 0;
  let cacheWrite = 0;
  let totalTokens = 0;
  for (const value of messages) {
    const message = value as MessageLike;
    if (message.role !== "assistant" || !message.usage) continue;
    input += numberOrZero(message.usage.input);
    output += numberOrZero(message.usage.output);
    cacheRead += numberOrZero(message.usage.cacheRead);
    cacheWrite += numberOrZero(message.usage.cacheWrite);
    totalTokens += numberOrZero(message.usage.totalTokens);
  }
  return { input, output, cacheRead, cacheWrite, totalTokens };
}

export default function jspaceMode(pi: ExtensionAPI) {
  const extensionDir = dirname(fileURLToPath(import.meta.url));
  const defaultModePath = resolve(extensionDir, "../../config/jspace");

  pi.registerFlag("jspace", {
    description: "J-Space mode for this run: off, observe, or on",
    type: "string",
  });

  let mode: JspaceMode = "off";
  let state = emptyState();
  let activeRun: ActiveRun | undefined;

  const syncTool = () => {
    const active = pi.getActiveTools();
    const hasTool = active.includes(TOOL_NAME);
    if (mode === "on" && !hasTool) {
      pi.setActiveTools([...active, TOOL_NAME]);
    } else if (mode !== "on" && hasTool) {
      pi.setActiveTools(active.filter((name) => name !== TOOL_NAME));
    }
  };

  const updateStatus = (ctx: ExtensionContext) => {
    ctx.ui.setStatus("jspace", mode === "off" ? undefined : `jspace ${mode}`);
  };

  const restore = (ctx: ExtensionContext, honorFlag: boolean) => {
    const branch = ctx.sessionManager.getBranch();
    const storedMode = readModeFromBranch(
      branch,
      readDefaultMode(defaultModePath),
    );
    const flag = honorFlag ? pi.getFlag("jspace") : undefined;
    mode = typeof flag === "string" && isJspaceMode(flag) ? flag : storedMode;
    state = readStateFromBranch(branch);
    if (honorFlag && flag !== undefined && !isJspaceMode(flag)) {
      ctx.ui.notify(
        `Invalid --jspace value "${String(flag)}"; using ${storedMode}.`,
        "error",
      );
    }
    if (honorFlag && isJspaceMode(flag) && flag !== storedMode) {
      pi.appendEntry(MODE_ENTRY_TYPE, { mode: flag });
    }
    syncTool();
    updateStatus(ctx);
  };

  const persistMode = (next: JspaceMode, ctx: ExtensionContext) => {
    mode = next;
    pi.appendEntry(MODE_ENTRY_TYPE, { mode: next });
    syncTool();
    updateStatus(ctx);
  };

  const statusText = (ctx: ExtensionContext) => {
    const metrics = readMetricsFromBranch(ctx.sessionManager.getBranch());
    const last = metrics.at(-1);
    const lines = [`mode: ${mode}`, summarizeState(state)];
    if (last) {
      lines.push(
        `last run: ${(last.durationMs / 1000).toFixed(1)}s · ${last.turns} turn(s) · ${last.toolCalls} tool call(s) · ${last.toolErrors} error(s) · ${last.usage.totalTokens} tokens`,
      );
      lines.push(`measured runs: ${metrics.length}`);
    } else {
      lines.push("measured runs: 0");
    }
    return lines.join("\n");
  };

  pi.registerTool({
    name: TOOL_NAME,
    label: "J-Space checkpoint",
    description:
      "Persist the active task goal, core constraints, verified evidence, open questions, and next action.",
    promptSnippet:
      "Record durable task state after evidence changes the plan and before delivery.",
    promptGuidelines: [
      "Use only while J-Space mode is on. Keep state concise; record verified claims only with a verifier and explicit coverage.",
    ],
    parameters: CheckpointParameters,
    async execute(_toolCallId, params: CheckpointParameters) {
      if (mode !== "on") {
        throw new Error(
          "jspace_checkpoint is available only in J-Space on mode.",
        );
      }
      state = applyCheckpoint(state, params);
      pi.appendEntry(STATE_ENTRY_TYPE, state);
      return {
        content: [{ type: "text" as const, text: summarizeState(state) }],
        details: state,
      };
    },
  });

  pi.registerCommand("jspace", {
    description: "Control J-Space session mode (off/observe/on/status/reset)",
    getArgumentCompletions: (prefix) => {
      const items = ["off", "observe", "on", "status", "reset"]
        .filter((value) => value.startsWith(prefix))
        .map((value) => ({ value, label: value }));
      return items.length > 0 ? items : null;
    },
    handler: async (args, ctx) => {
      const action = parseJspaceArgs(args);
      if (action.action === "error") {
        ctx.ui.notify(action.message, "error");
        return;
      }
      if (action.action === "status") {
        ctx.ui.notify(statusText(ctx), "info");
        return;
      }
      if (action.action === "reset") {
        state = emptyState();
        pi.appendEntry(STATE_ENTRY_TYPE, state);
        ctx.ui.notify("J-Space ledger reset for this branch.", "info");
        return;
      }
      persistMode(action.mode, ctx);
      ctx.ui.notify(`J-Space mode: ${action.mode}.`, "info");
    },
  });

  pi.on("session_start", (_event, ctx) => restore(ctx, true));
  pi.on("session_tree", (_event, ctx) => restore(ctx, false));

  pi.on("session_compact", (_event, ctx) => {
    pi.appendEntry(MODE_ENTRY_TYPE, { mode });
    if (state.goal) pi.appendEntry(STATE_ENTRY_TYPE, state);
    updateStatus(ctx);
  });

  pi.on("before_agent_start", (event) => {
    syncTool();
    if (mode !== "on") return;
    return { systemPrompt: buildJspaceSystemPrompt(event.systemPrompt, state) };
  });

  pi.on("tool_call", (event) => {
    if (event.toolName === TOOL_NAME && mode !== "on") {
      return { block: true, reason: "J-Space mode is not on." };
    }
    if (activeRun) activeRun.toolCalls += 1;
  });

  pi.on("tool_result", (event) => {
    if (activeRun && event.isError) activeRun.toolErrors += 1;
  });

  pi.on("agent_start", () => {
    activeRun =
      mode === "off"
        ? undefined
        : {
            mode,
            startedAt: Date.now(),
            turns: 0,
            toolCalls: 0,
            toolErrors: 0,
          };
  });

  pi.on("turn_end", () => {
    if (activeRun) activeRun.turns += 1;
  });

  pi.on("agent_end", (event, ctx) => {
    const run = activeRun;
    activeRun = undefined;
    if (!run) return;
    const metrics: JspaceRunMetrics = {
      mode: run.mode,
      timestamp: Date.now(),
      durationMs: Math.max(0, Date.now() - run.startedAt),
      turns: run.turns,
      toolCalls: run.toolCalls,
      toolErrors: run.toolErrors,
      provider: ctx.model?.provider ?? "",
      model: ctx.model?.id ?? "",
      usage: usageFromMessages(event.messages),
    };
    pi.appendEntry(METRICS_ENTRY_TYPE, metrics);
  });
}
