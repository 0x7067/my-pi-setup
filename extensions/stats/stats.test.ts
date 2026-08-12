import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { collectStats, formatSummary } from "./src/stats.ts";

test("attributes forked usage to its origin and tolerates malformed timestamps", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "pi-stats-test-"));
  await mkdir(join(root, "project"));
  context.after(() => rm(root, { recursive: true, force: true }));

  const session = ({
    entryId,
    cwd,
    startedAt,
    messageTimestamp = "2026-08-08T10:00:00.000Z",
  }: {
    entryId: string;
    cwd: string;
    startedAt: string;
    messageTimestamp?: string | number;
  }) => [
    JSON.stringify({
      type: "session",
      id: `session-${cwd}`,
      timestamp: startedAt,
      cwd,
    }),
    JSON.stringify({
      type: "message",
      id: entryId,
      timestamp: messageTimestamp,
      message: {
        role: "assistant",
        provider: "openai-codex",
        model: "gpt-test",
        stopReason: "stop",
        usage: {
          input: 100,
          output: 20,
          reasoning: 5,
          cacheRead: 80,
          cacheWrite: 0,
          totalTokens: 205,
          cost: { total: 0.25 },
        },
      },
    }),
  ];

  await writeFile(
    join(root, "project", "source.jsonl"),
    `${session({ entryId: "shared", cwd: "/work/source", startedAt: "2026-08-08T09:00:00.000Z" }).join("\n")}\n{truncated`,
    "utf8",
  );
  await writeFile(
    join(root, "project", "fork.jsonl"),
    `${session({ entryId: "shared", cwd: "/work/fork", startedAt: "2026-08-08T11:00:00.000Z" }).join("\n")}\n`,
    "utf8",
  );
  await writeFile(
    join(root, "project", "unique.jsonl"),
    `${session({ entryId: "unique", cwd: "/work/unique", startedAt: "2026-08-08T12:00:00.000Z" }).join("\n")}\n`,
    "utf8",
  );
  await writeFile(
    join(root, "project", "collision.jsonl"),
    `${session({ entryId: "shared", cwd: "/work/collision", startedAt: "2026-08-08T13:00:00.000Z", messageTimestamp: "2026-08-08T10:05:00.000Z" }).join("\n")}\n`,
    "utf8",
  );
  await writeFile(
    join(root, "project", "invalid-time.jsonl"),
    `${session({ entryId: "bad-time", cwd: "/work/invalid", startedAt: "2026-08-08T14:00:00.000Z", messageTimestamp: 1e99 }).join("\n")}\n`,
    "utf8",
  );

  const stats = await collectStats(root);
  assert.equal(stats.sessionFiles, 5);
  assert.equal(stats.malformedLines, 1);
  assert.equal(stats.totals.requests, 4);
  assert.equal(stats.totals.totalTokens, 820);
  assert.equal(stats.totals.cost, 1);
  assert.equal(stats.byModel[0]?.key, "gpt-test");
  assert.equal(
    stats.byProject.find((item) => item.key === "source")?.requests,
    1,
  );
  assert.equal(
    stats.byProject.some((item) => item.key === "fork"),
    false,
  );
  assert.equal(stats.byDay.find((item) => item.key === "unknown")?.requests, 1);
  assert.equal(stats.cacheWriteStatus, "not-reported");
  assert.match(formatSummary(stats), /Cache writes not reported/);
  const providerModel = stats.byProviderModel[0];
  assert.equal(providerModel?.key, "openai-codex/gpt-test");
  assert.equal(providerModel?.meteredRequests, 4);
  assert.equal(providerModel?.cacheHits, 4);
  assert.equal(providerModel?.coldStartMisses, 0);
  assert.equal(providerModel?.midSessionMisses, 0);
  assert.equal(providerModel?.recentRequests, 4);
  assert.equal(providerModel?.recentCacheMisses, 0);
  assert.equal(providerModel?.cacheWriteStatus, "not-reported");
});

test("separates cold and mid-session misses without inventing cache writes", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "pi-stats-cache-test-"));
  context.after(() => rm(root, { recursive: true, force: true }));

  const message = (
    id: string,
    timestamp: string,
    usage: { input: number; cacheRead: number; cacheWrite?: number },
    provider = "openai-codex",
    model = "gpt-test",
  ) =>
    JSON.stringify({
      type: "message",
      id,
      timestamp,
      message: {
        role: "assistant",
        provider,
        model,
        stopReason: "stop",
        usage: {
          input: usage.input,
          output: 1,
          cacheRead: usage.cacheRead,
          cacheWrite: usage.cacheWrite ?? 0,
          totalTokens:
            usage.input + usage.cacheRead + (usage.cacheWrite ?? 0) + 1,
          cost: { total: 0 },
        },
      },
    });

  await writeFile(
    join(root, "session-a.jsonl"),
    [
      JSON.stringify({
        type: "session",
        timestamp: "2026-08-08T09:00:00.000Z",
        cwd: "/work/a",
      }),
      message("a1", "2026-08-08T09:00:01.000Z", {
        input: 100,
        cacheRead: 0,
      }),
      message("a2", "2026-08-08T09:00:02.000Z", {
        input: 20,
        cacheRead: 80,
      }),
      message("a3", "2026-08-08T09:00:03.000Z", {
        input: 50,
        cacheRead: 0,
      }),
    ].join("\n") + "\n",
    "utf8",
  );
  await writeFile(
    join(root, "session-b.jsonl"),
    [
      JSON.stringify({
        type: "session",
        timestamp: "2026-08-08T10:00:00.000Z",
        cwd: "/work/b",
      }),
      message("b1", "2026-08-08T10:00:01.000Z", {
        input: 10,
        cacheRead: 90,
      }),
      message(
        "b2",
        "2026-08-08T10:00:02.000Z",
        { input: 10, cacheRead: 0, cacheWrite: 100 },
        "anthropic",
        "claude-test",
      ),
    ].join("\n") + "\n",
    "utf8",
  );

  const stats = await collectStats(root);
  const openai = stats.byProviderModel.find(
    (item) => item.key === "openai-codex/gpt-test",
  );
  assert.equal(openai?.meteredRequests, 4);
  assert.equal(openai?.cacheHits, 2);
  assert.equal(openai?.coldStartMisses, 1);
  assert.equal(openai?.midSessionMisses, 1);
  assert.equal(openai?.recentCacheMisses, 2);
  assert.equal(openai?.recentCacheReuse, 170 / 350);
  assert.equal(openai?.cacheWriteStatus, "not-reported");

  const anthropic = stats.byProviderModel.find(
    (item) => item.key === "anthropic/claude-test",
  );
  assert.equal(anthropic?.cacheWrite, 100);
  assert.equal(anthropic?.meteredRequests, 1);
  assert.equal(anthropic?.coldStartMisses, 1);
  assert.equal(anthropic?.recentRequests, 1);
  assert.equal(anthropic?.recentCacheReuse, 0);
  assert.equal(anthropic?.cacheWriteStatus, "reported");
  assert.equal(stats.cacheWriteStatus, "reported");
});

test("labels an archive with only unmetered responses as unmetered", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "pi-stats-unmetered-test-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(
    join(root, "session.jsonl"),
    `${JSON.stringify({
      type: "message",
      id: "error",
      message: {
        role: "assistant",
        provider: "cursor",
        model: "composer-test",
        stopReason: "error",
      },
    })}\n`,
    "utf8",
  );

  const stats = await collectStats(root);
  assert.equal(stats.totals.requests, 1);
  assert.equal(stats.cacheWriteStatus, "unmetered");
  assert.equal(stats.byProviderModel[0]?.cacheWriteStatus, "unmetered");
});
