import { randomBytes } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { Type } from "typebox";
import { StatsServer } from "./src/server.ts";
import { collectStats, formatSummary } from "./src/stats.ts";

const noParameters = Type.Object({});

type CacheWriteUsage = {
  cacheWrite: number;
  cacheWriteReported?: boolean;
};

export function recordCacheWriteProvenance(event: { message: AgentMessage }) {
  if (event.message.role !== "assistant") return;
  const usage = event.message.usage as typeof event.message.usage &
    CacheWriteUsage;
  if (
    usage.cacheWriteReported === true ||
    !Number.isFinite(usage.cacheWrite) ||
    usage.cacheWrite <= 0
  ) {
    return;
  }
  return {
    message: {
      ...event.message,
      usage: { ...usage, cacheWriteReported: true },
    },
  };
}

function sessionDirectory() {
  return (
    process.env.PI_STATS_SESSIONS_DIR ??
    join(homedir(), ".pi", "agent", "sessions")
  );
}

function configuredPort() {
  const value = Number(process.env.PI_STATS_PORT ?? 3847);
  if (!Number.isInteger(value) || value < 0 || value > 65_535) {
    throw new Error("PI_STATS_PORT must be an integer from 0 to 65535");
  }
  return value;
}

export default function statsExtension(pi: ExtensionAPI) {
  let server: StatsServer | undefined;
  let starting: Promise<StatsServer> | undefined;
  let shuttingDown = false;

  pi.on("message_end", recordCacheWriteProvenance);

  async function dashboard() {
    if (shuttingDown) throw new Error("Pi Stats is shutting down");
    if (server) return server;
    if (starting) return await starting;
    const candidate = new StatsServer(
      randomBytes(24).toString("base64url"),
      sessionDirectory(),
      configuredPort(),
    );
    starting = candidate
      .start()
      .then(() => {
        if (shuttingDown) throw new Error("Pi Stats is shutting down");
        server = candidate;
        return candidate;
      })
      .catch(async (error) => {
        await candidate.close();
        throw error;
      });
    try {
      return await starting;
    } finally {
      starting = undefined;
    }
  }

  pi.registerCommand("stats", {
    description: "Show a local Pi usage summary or start the private dashboard",
    getArgumentCompletions: (prefix) => {
      const options = ["dashboard", "summary"]
        .filter((value) => value.startsWith(prefix))
        .map((value) => ({ value, label: value }));
      return options.length > 0 ? options : null;
    },
    handler: async (args, ctx) => {
      const action = args.trim() || "dashboard";
      if (action === "summary") {
        ctx.ui.notify(
          formatSummary(await collectStats(sessionDirectory())),
          "info",
        );
        return;
      }
      if (action !== "dashboard") {
        ctx.ui.notify("Usage: /stats [dashboard|summary]", "error");
        return;
      }
      const running = await dashboard();
      ctx.ui.notify(
        `Pi Stats is available while this Pi session is open:\n${running.url}`,
        "info",
      );
    },
  });

  pi.registerTool({
    name: "pi-stats",
    label: "Pi Stats",
    description:
      "Return a read-only aggregate of local Pi session usage, including requests, tokens, cost, cache reuse, errors, models, providers, projects, and days.",
    promptSnippet: "Summarize local Pi model usage and cost",
    parameters: noParameters,
    async execute() {
      const stats = await collectStats(sessionDirectory());
      return {
        content: [
          {
            type: "text" as const,
            text: `${formatSummary(stats)}\n\n${JSON.stringify(
              {
                byModel: stats.byModel,
                byProviderModel: stats.byProviderModel,
                byProvider: stats.byProvider,
                byProject: stats.byProject,
                byDay: stats.byDay,
              },
              null,
              2,
            )}`,
          },
        ],
        details: { generatedAt: stats.generatedAt },
      };
    },
  });

  pi.on("session_shutdown", async () => {
    shuttingDown = true;
    const pending = starting;
    const running = server;
    server = undefined;
    await pending?.catch(() => undefined);
    await running?.close();
  });
}
