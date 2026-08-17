import assert from "node:assert/strict";
import { readFile, rm, stat } from "node:fs/promises";
import { dirname } from "node:path";
import test from "node:test";
import registerOmpNatives from "./index.ts";

test("chunk tool persists private manifests and retrieves a mid-line chunk", async (context) => {
  const tools = new Map<string, any>();
  registerOmpNatives({
    registerTool(tool: any) {
      tools.set(tool.name, tool);
    },
    on() {},
  } as any);
  const tool = tools.get("chunk_text_by_tokens");
  assert.ok(tool);

  const text = "😀 token ".repeat(1200);
  const signal = new AbortController().signal;
  const manifestResult = await tool.execute(
    "manifest",
    { text, budget: 256 },
    signal,
  );
  const { manifestPath, sourcePath } = manifestResult.details as {
    manifestPath: string;
    sourcePath: string;
  };
  assert.ok(manifestPath);
  assert.ok(sourcePath);
  context.after(async () => {
    await Promise.all([
      rm(dirname(manifestPath), { recursive: true, force: true }),
      rm(dirname(sourcePath), { recursive: true, force: true }),
    ]);
  });

  assert.equal((await stat(manifestPath)).mode & 0o777, 0o600);
  assert.equal((await stat(sourcePath)).mode & 0o777, 0o600);
  assert.equal((await stat(dirname(manifestPath))).mode & 0o777, 0o700);
  assert.equal((await stat(dirname(sourcePath))).mode & 0o777, 0o700);

  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
    chunkCount: number;
    chunks: Array<{
      startChar: number;
      endChar: number;
      tokens: number;
    }>;
  };
  assert.ok(manifest.chunkCount > 2);
  const expectedRange = manifest.chunks[1];
  assert.ok(expectedRange);
  const expected = text.slice(expectedRange.startChar, expectedRange.endChar);

  const selected = await tool.execute(
    "selected",
    { path: sourcePath, budget: 256, chunk: 1 },
    signal,
  );
  assert.equal(selected.details.chunk, 1);
  assert.equal(selected.details.tokens, expectedRange.tokens);
  assert.ok(selected.content[0].text.endsWith(`\n\n${expected}`));
});
