import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { streamSimple as streamAnthropic } from "@earendil-works/pi-ai/api/anthropic-messages";
import { streamSimple as streamBedrock } from "@earendil-works/pi-ai/api/bedrock-converse-stream";
import { streamSimple as streamOpenAICompletions } from "@earendil-works/pi-ai/api/openai-completions";

const requireFromPiAi = createRequire(
  import.meta.resolve("@earendil-works/pi-ai/api/bedrock-converse-stream"),
);
const { BedrockRuntimeClient } = requireFromPiAi(
  "@aws-sdk/client-bedrock-runtime",
);

const context = {
  messages: [{ role: "user", content: "test", timestamp: 0 }],
  tools: [],
};

function model(api, provider, id, baseUrl) {
  return {
    api,
    provider,
    id,
    name: id,
    baseUrl,
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128_000,
    maxTokens: 4_096,
  };
}

async function result(stream) {
  for await (const _event of stream) {
  }
  return stream.result();
}

function sse(events) {
  return new Response(
    `${events
      .map(
        ({ event, data }) =>
          `${event ? `event: ${event}\n` : ""}data: ${JSON.stringify(data)}\n\n`,
      )
      .join("")}data: [DONE]\n\n`,
    { headers: { "Content-Type": "text/event-stream" } },
  );
}

async function anthropicUsage(cacheWrite) {
  const usage = {
    input_tokens: 100,
    output_tokens: 0,
    cache_read_input_tokens: 20,
    ...(cacheWrite === undefined
      ? {}
      : { cache_creation_input_tokens: cacheWrite }),
  };
  return result(
    streamAnthropic(
      model(
        "anthropic-messages",
        "anthropic",
        "claude-test",
        "https://api.anthropic.com",
      ),
      context,
      {
        apiKey: "test",
        fetch: async () =>
          sse([
            {
              event: "message_start",
              data: {
                type: "message_start",
                message: {
                  id: "msg-test",
                  type: "message",
                  role: "assistant",
                  model: "claude-test",
                  content: [],
                  stop_reason: null,
                  stop_sequence: null,
                  usage,
                },
              },
            },
            {
              event: "message_delta",
              data: {
                type: "message_delta",
                delta: { stop_reason: "end_turn", stop_sequence: null },
                usage: { output_tokens: 1 },
              },
            },
            { event: "message_stop", data: { type: "message_stop" } },
          ]),
      },
    ),
  );
}

async function openAICompletionsUsage(cacheWrite) {
  const details =
    cacheWrite === undefined ? {} : { cache_write_tokens: cacheWrite };
  return result(
    streamOpenAICompletions(
      model(
        "openai-completions",
        "openrouter",
        "openai-test",
        "https://openrouter.ai/api/v1",
      ),
      context,
      {
        apiKey: "test",
        fetch: async () =>
          sse([
            {
              data: {
                id: "chatcmpl-test",
                object: "chat.completion.chunk",
                created: 0,
                model: "openai-test",
                choices: [
                  {
                    index: 0,
                    delta: { role: "assistant", content: "ok" },
                    finish_reason: null,
                  },
                ],
              },
            },
            {
              data: {
                id: "chatcmpl-test",
                object: "chat.completion.chunk",
                created: 0,
                model: "openai-test",
                choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
                usage: {
                  prompt_tokens: 100,
                  completion_tokens: 1,
                  total_tokens: 101,
                  prompt_tokens_details: details,
                },
              },
            },
          ]),
      },
    ),
  );
}

async function bedrockUsage(cacheWrite) {
  const originalSend = BedrockRuntimeClient.prototype.send;
  BedrockRuntimeClient.prototype.send = async () => ({
    $metadata: { httpStatusCode: 200, requestId: "request-test" },
    stream: (async function* () {
      yield { messageStart: { role: "assistant" } };
      yield {
        metadata: {
          usage: {
            inputTokens: 100,
            outputTokens: 1,
            cacheReadInputTokens: 20,
            ...(cacheWrite === undefined
              ? {}
              : { cacheWriteInputTokens: cacheWrite }),
            totalTokens: 121 + (cacheWrite ?? 0),
          },
        },
      };
      yield { messageStop: { stopReason: "end_turn" } };
    })(),
  });
  try {
    return await result(
      streamBedrock(
        model(
          "bedrock-converse-stream",
          "amazon-bedrock",
          "anthropic.claude-test",
          "https://bedrock-runtime.us-east-1.amazonaws.com",
        ),
        context,
        { env: { AWS_BEDROCK_SKIP_AUTH: "1" } },
      ),
    );
  } finally {
    BedrockRuntimeClient.prototype.send = originalSend;
  }
}

test("provider adapters preserve cache-write count provenance", async () => {
  for (const run of [anthropicUsage, openAICompletionsUsage, bedrockUsage]) {
    const absent = await run(undefined);
    assert.equal(absent.usage.cacheWrite, 0);
    assert.equal(absent.usage.cacheWriteReported, undefined);

    const zero = await run(0);
    assert.equal(zero.usage.cacheWrite, 0);
    assert.equal(zero.usage.cacheWriteReported, true);

    const positive = await run(5);
    assert.equal(positive.usage.cacheWrite, 5);
    assert.equal(positive.usage.cacheWriteReported, true);
  }
});
