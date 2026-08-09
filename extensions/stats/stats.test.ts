import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { collectStats } from "./src/stats.ts";

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
});
