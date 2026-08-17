import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateCacheGuard,
  formatPromptProfile,
  profileProviderPayload,
} from "./src/prompt-profile.ts";

test("profiles OpenAI payload sections without retaining content", () => {
  const profile = profileProviderPayload({
    model: "test-model",
    messages: [
      { role: "system", content: "system instructions" },
      { role: "user", content: "hello" },
    ],
    tools: [{ type: "function", function: { name: "read" } }],
    stream: true,
  });

  assert.ok(profile.totalBytes > profile.systemBytes);
  assert.ok(profile.systemBytes > 2);
  assert.ok(profile.conversationBytes > 2);
  assert.ok(profile.toolBytes > 2);
  assert.equal(profile.messages, 1);
  assert.equal(profile.tools, 1);
  assert.equal(profile.stableHash.length, 64);
});

test("stability ignores conversation growth but detects prompt and tool changes", () => {
  const initial = profileProviderPayload({
    model: "test-model",
    messages: [
      { role: "system", content: "stable" },
      { role: "user", content: "first" },
    ],
    tools: [{ name: "read" }],
  });
  const continued = profileProviderPayload({
    model: "test-model",
    messages: [
      { role: "system", content: "stable" },
      { role: "user", content: "first" },
      { role: "assistant", content: "answer" },
      { role: "user", content: "second" },
    ],
    tools: [{ name: "read" }],
  });
  const changedTool = profileProviderPayload({
    model: "test-model",
    messages: [{ role: "system", content: "stable" }],
    tools: [{ name: "write" }],
  });
  const changedPrompt = profileProviderPayload({
    model: "test-model",
    messages: [{ role: "system", content: "changed" }],
    tools: [{ name: "read" }],
  });

  assert.equal(initial.stableHash, continued.stableHash);
  assert.notEqual(initial.stableHash, changedTool.stableHash);
  assert.notEqual(initial.stableHash, changedPrompt.stableHash);
});

test("profiles Anthropic root system prompts", () => {
  const profile = profileProviderPayload({
    model: "test-model",
    system: [{ type: "text", text: "instructions" }],
    messages: [{ role: "user", content: "hello" }],
    tools: [],
  });

  assert.ok(profile.systemBytes > 2);
  assert.equal(profile.messages, 1);
  assert.equal(profile.tools, 0);
});

test("cache guard warns only for large stable warm misses", () => {
  const usage = { input: 10_000, cacheRead: 0 };
  assert.equal(
    evaluateCacheGuard(usage, {
      hadPriorRequest: false,
      stablePayload: true,
      supportsCache: true,
    }).status,
    "cold",
  );
  assert.equal(
    evaluateCacheGuard(usage, {
      hadPriorRequest: true,
      stablePayload: false,
      supportsCache: true,
    }).status,
    "changed",
  );
  assert.equal(
    evaluateCacheGuard(
      { input: 1000, cacheRead: 0 },
      {
        hadPriorRequest: true,
        stablePayload: true,
        supportsCache: true,
      },
    ).status,
    "small",
  );
  assert.equal(
    evaluateCacheGuard(usage, {
      hadPriorRequest: true,
      stablePayload: true,
      supportsCache: false,
    }).status,
    "unsupported",
  );
  assert.equal(
    evaluateCacheGuard(usage, {
      hadPriorRequest: true,
      stablePayload: true,
      supportsCache: true,
    }).status,
    "warning",
  );
});

test("cache guard accepts high reuse and accounts for reported writes", () => {
  const healthy = evaluateCacheGuard(
    { input: 58, cacheRead: 11_648 },
    {
      hadPriorRequest: true,
      stablePayload: true,
      supportsCache: true,
    },
  );
  assert.equal(healthy.status, "healthy");
  assert.ok((healthy.cacheRate ?? 0) > 0.99);

  const write = evaluateCacheGuard(
    {
      input: 76,
      cacheRead: 8941,
      cacheWrite: 76,
      cacheWriteReported: true,
    },
    {
      hadPriorRequest: true,
      stablePayload: true,
      supportsCache: true,
    },
  );
  assert.equal(write.status, "healthy");
  assert.equal(write.reusableTokens, 9093);
});

test("formats a compact prompt and cache report", () => {
  const profile = profileProviderPayload({
    model: "test-model",
    messages: [{ role: "system", content: "stable" }],
    tools: [],
  });
  const cache = evaluateCacheGuard(
    { input: 58, cacheRead: 11_648 },
    {
      hadPriorRequest: true,
      stablePayload: true,
      supportsCache: true,
    },
  );
  const output = formatPromptProfile(profile, cache);
  assert.match(output, /Last provider payload:/);
  assert.match(output, /tools .* \(0\)/);
  assert.match(output, /Cache 99\.5%/);
});
