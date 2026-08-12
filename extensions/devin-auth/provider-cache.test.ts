import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { Api, Context, Model } from "@earendil-works/pi-ai";
import { collectStats } from "../stats/src/stats.ts";
import { streamDevin } from "./src/stream.ts";
import { clearCachedUserJwt } from "./src/cloud-direct/auth.ts";
import { clearCachedCatalog } from "./src/cloud-direct/catalog.ts";
import { clearSessionIds } from "./src/cloud-direct/session-ids.ts";
import {
  encodeMessage,
  encodeString,
  encodeTag,
  encodeVarintField,
  iterFields,
  parseConnectFrames,
} from "./src/cloud-direct/wire.ts";

const apiKey = "test-api-key";
const model = {
  id: "swe-1-7",
  name: "SWE-1.7",
  api: "devin-cloud",
  provider: "devin",
  baseUrl: "https://server.codeium.test",
  reasoning: true,
  input: ["text"],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 256_000,
  maxTokens: 128_000,
} satisfies Model<Api>;

const context = {
  messages: [
    {
      role: "user",
      content: "Demonstrate cache accounting",
      timestamp: Date.now(),
    },
  ],
  tools: [],
} satisfies Context;

function fixed32(field: number, value: number) {
  const bytes = Buffer.alloc(4);
  bytes.writeFloatLE(value);
  return Buffer.concat([encodeTag(field, 5), bytes]);
}

function usageEntry(metric: string, value: number) {
  return encodeMessage(
    2,
    Buffer.concat([
      encodeMessage(4, fixed32(2, value)),
      encodeString(5, metric),
    ]),
  );
}

function connectFrame(payload: Buffer, eos = false) {
  const header = Buffer.alloc(5);
  header[0] = eos ? 0x02 : 0;
  header.writeUInt32BE(payload.length, 1);
  return Buffer.concat([header, payload]);
}

function jwt() {
  const segment = (value: object) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${segment({ alg: "none", typ: "JWT" })}.${segment({ exp: Math.floor(Date.now() / 1000) + 3600 })}.test-signature`;
}

function readString(fields: ReturnType<typeof iterFields>, number: number) {
  for (const field of fields) {
    if (
      field.num === number &&
      field.wire === 2 &&
      Buffer.isBuffer(field.value)
    ) {
      return field.value.toString("utf8");
    }
  }
  throw new Error(`Missing protobuf string field ${number}`);
}

test("Pi conversation identity and cache usage survive the provider boundary", async (t) => {
  clearCachedUserJwt();
  clearCachedCatalog();
  clearSessionIds();

  const requests: Array<{
    sessionId: string;
    cascadeId: string;
    telemetryAllowed: boolean;
  }> = [];
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
    clearCachedUserJwt();
    clearCachedCatalog();
    clearSessionIds();
  });

  globalThis.fetch = (async (input, init) => {
    const url = String(input);
    if (url.endsWith("/exa.auth_pb.AuthService/GetUserJwt")) {
      return new Response(new Uint8Array(encodeString(1, jwt())));
    }
    if (
      url.endsWith("/exa.api_server_pb.ApiServerService/GetCascadeModelConfigs")
    ) {
      return new Response(
        new Uint8Array(
          encodeMessage(
            1,
            Buffer.concat([
              encodeString(1, "SWE-1.7"),
              encodeVarintField(4, 0),
              encodeString(22, model.id),
            ]),
          ),
        ),
      );
    }
    if (url.endsWith("/exa.api_server_pb.ApiServerService/GetChatMessage")) {
      const requestBody = Buffer.from(init?.body as Uint8Array);
      const request = parseConnectFrames(requestBody)[0]?.payload;
      assert.ok(request, "chat request has a Connect-RPC payload");

      let sessionId = "";
      let cascadeId = "";
      const telemetryFlags: bigint[] = [];
      for (const field of iterFields(request)) {
        if (field.num === 1 && Buffer.isBuffer(field.value)) {
          sessionId = readString(iterFields(field.value), 10);
        } else if (field.num === 3 && Buffer.isBuffer(field.value)) {
          for (const promptField of iterFields(field.value)) {
            if (promptField.num === 5 && promptField.wire === 0) {
              telemetryFlags.push(promptField.value as bigint);
            }
          }
        } else if (field.num === 16 && Buffer.isBuffer(field.value)) {
          cascadeId = field.value.toString("utf8");
        }
      }
      assert.ok(sessionId);
      assert.ok(cascadeId);
      assert.ok(telemetryFlags.length > 0);
      requests.push({
        sessionId,
        cascadeId,
        telemetryAllowed: telemetryFlags.some((flag) => flag !== 0n),
      });

      const usage = Buffer.concat([
        usageEntry("input_tokens", 120),
        usageEntry("output_tokens", 12),
        usageEntry("cached_input_tokens", 80),
        usageEntry("cache_creation_input_tokens", 5),
      ]);
      const response = Buffer.concat([
        connectFrame(
          Buffer.concat([
            encodeString(3, "Cache accounting is visible."),
            encodeMessage(28, usage),
            encodeVarintField(5, 2),
          ]),
        ),
        connectFrame(Buffer.from("{}"), true),
      ]);
      return new Response(response, {
        headers: { "Content-Type": "application/connect+proto" },
      });
    }
    throw new Error(`Unexpected request: ${url}`);
  }) as typeof fetch;

  const run = async (conversationId: string) => {
    const stream = streamDevin(model, context, {
      apiKey,
      sessionId: conversationId,
    });
    for await (const _event of stream) {
      // Consuming the stream exercises the same event surface Pi persists.
    }
    return stream.result();
  };

  const first = await run("pi-conversation-a");
  const restarted = await run("pi-conversation-a");
  const separate = await run("pi-conversation-b");

  assert.deepEqual(requests[1], requests[0]);
  assert.notEqual(requests[2]?.sessionId, requests[0]?.sessionId);
  assert.notEqual(requests[2]?.cascadeId, requests[0]?.cascadeId);
  assert.equal(
    requests.some((request) => request.telemetryAllowed),
    false,
  );
  assert.deepEqual(first.usage, restarted.usage);
  assert.equal(first.usage.input, 35);
  assert.equal(first.usage.cacheRead, 80);
  assert.equal(first.usage.cacheWrite, 5);

  const statsRoot = await mkdtemp(join(tmpdir(), "pi-devin-stats-test-"));
  t.after(() => rm(statsRoot, { recursive: true, force: true }));
  await mkdir(join(statsRoot, "project"));
  await writeFile(
    join(statsRoot, "project", "conversation.jsonl"),
    [
      JSON.stringify({
        type: "session",
        id: "pi-conversation-a",
        timestamp: new Date().toISOString(),
        cwd: "/work/project",
      }),
      JSON.stringify({
        type: "message",
        id: "assistant-1",
        timestamp: new Date().toISOString(),
        message: first,
      }),
    ].join("\n"),
  );

  const stats = await collectStats(statsRoot);
  assert.equal(stats.byProvider[0]?.key, "devin");
  assert.equal(stats.totals.cacheRead, 80);
  assert.equal(stats.totals.cacheWrite, 5);
  assert.equal(stats.byProviderModel[0]?.recentCacheReuse, 80 / 120);
  assert.equal(stats.byProviderModel[0]?.cacheWriteStatus, "reported");
  assert.equal(separate.content[0]?.type, "text");

  if (process.env.DEVIN_CACHE_EVIDENCE === "1") {
    t.diagnostic(
      JSON.stringify(
        {
          conversationA: {
            initialRequest: requests[0],
            restartedRequest: requests[1],
            response: first.content,
            usagePersistedByPi: first.usage,
          },
          conversationB: { request: requests[2] },
          localStatsReport: {
            provider: stats.byProvider[0]?.key,
            cacheRead: stats.totals.cacheRead,
            cacheWrite: stats.totals.cacheWrite,
          },
        },
        null,
        2,
      ),
    );
  }
});
