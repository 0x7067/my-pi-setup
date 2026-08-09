import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { StatsServer } from "./src/server.ts";

test("serves a token-protected dashboard and API on loopback", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "pi-stats-server-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(
    join(root, "session.jsonl"),
    `${JSON.stringify({ type: "session", cwd: "/work/test" })}\n`,
    "utf8",
  );

  const server = new StatsServer("private-token", root, 0);
  await server.start();
  context.after(() => server.close());

  const unauthorized = await fetch(`http://127.0.0.1:${server.port}/api/stats`);
  assert.equal(unauthorized.status, 401);

  const api = await fetch(
    `http://127.0.0.1:${server.port}/api/stats?token=private-token`,
  );
  assert.equal(api.status, 200);
  assert.equal(
    ((await api.json()) as { sessionFiles: number }).sessionFiles,
    1,
  );

  const page = await fetch(server.url);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /<title>Pi Stats<\/title>/);
  assert.match(
    page.headers.get("content-security-policy") ?? "",
    /frame-ancestors 'none'/,
  );
});
