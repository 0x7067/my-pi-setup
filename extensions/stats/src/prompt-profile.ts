import { createHash } from "node:crypto";

export interface PromptProfile {
  totalBytes: number;
  systemBytes: number;
  conversationBytes: number;
  toolBytes: number;
  otherBytes: number;
  messages: number;
  tools: number;
  stableHash: string;
}

export interface CacheUsage {
  input: number;
  cacheRead: number;
  cacheWrite?: number;
  cacheWriteReported?: boolean;
}

export type CacheGuardStatus =
  "cold" | "changed" | "small" | "unsupported" | "healthy" | "warning";

export interface CacheGuardResult {
  status: CacheGuardStatus;
  cacheRate: number | null;
  reusableTokens: number;
  message: string;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function serialized(value: unknown) {
  return JSON.stringify(value) ?? "";
}

function bytes(value: unknown) {
  return Buffer.byteLength(serialized(value), "utf8");
}

function hash(value: unknown) {
  return createHash("sha256").update(serialized(value)).digest("hex");
}

function role(message: unknown) {
  return record(message)?.role;
}

/** Profile provider payload sections without retaining their prompt content. */
export function profileProviderPayload(payload: unknown): PromptProfile {
  const root = record(payload) ?? {};
  const rawMessages = Array.isArray(root.messages)
    ? root.messages
    : Array.isArray(root.input)
      ? root.input
      : Array.isArray(root.contents)
        ? root.contents
        : [];
  const instructionMessages = rawMessages.filter(
    (message) => role(message) === "system" || role(message) === "developer",
  );
  const conversation = rawMessages.filter(
    (message) => role(message) !== "system" && role(message) !== "developer",
  );
  const rootInstructions = [
    root.system,
    root.instructions,
    root.systemInstruction,
  ].filter((value) => value !== undefined);
  const instructions = [...rootInstructions, ...instructionMessages];
  const tools = Array.isArray(root.tools) ? root.tools : [];

  const totalBytes = bytes(payload);
  const systemBytes = bytes(instructions);
  const conversationBytes = bytes(conversation);
  const toolBytes = bytes(tools);
  return {
    totalBytes,
    systemBytes,
    conversationBytes,
    toolBytes,
    otherBytes: Math.max(
      0,
      totalBytes - systemBytes - conversationBytes - toolBytes,
    ),
    messages: conversation.length,
    tools: tools.length,
    stableHash: hash({ model: root.model, instructions, tools }),
  };
}

export function evaluateCacheGuard(
  usage: CacheUsage,
  options: {
    hadPriorRequest: boolean;
    stablePayload: boolean;
    supportsCache: boolean;
    minimumTokens?: number;
    minimumRate?: number;
  },
): CacheGuardResult {
  const input = Math.max(0, usage.input);
  const cacheRead = Math.max(0, usage.cacheRead);
  const reportedWrite =
    usage.cacheWriteReported === true ? Math.max(0, usage.cacheWrite ?? 0) : 0;
  const reusableTokens = input + cacheRead + reportedWrite;
  const cacheRate = reusableTokens > 0 ? cacheRead / reusableTokens : null;

  if (!options.supportsCache) {
    return {
      status: "unsupported",
      cacheRate,
      reusableTokens,
      message: "cache telemetry is not expected for this model",
    };
  }
  if (!options.hadPriorRequest) {
    return {
      status: "cold",
      cacheRate,
      reusableTokens,
      message: "cold request; no prior request for this provider/model",
    };
  }
  if (!options.stablePayload) {
    return {
      status: "changed",
      cacheRate,
      reusableTokens,
      message: "system prompt, tools, or model changed",
    };
  }
  if (reusableTokens < (options.minimumTokens ?? 4096)) {
    return {
      status: "small",
      cacheRate,
      reusableTokens,
      message: "request is below the cache guard threshold",
    };
  }

  const minimumRate = options.minimumRate ?? 0.8;
  if (cacheRate === null || cacheRate < minimumRate) {
    return {
      status: "warning",
      cacheRate,
      reusableTokens,
      message: `stable prompt cache reuse fell below ${(minimumRate * 100).toFixed(0)}%`,
    };
  }
  return {
    status: "healthy",
    cacheRate,
    reusableTokens,
    message: "stable prompt cache reuse is healthy",
  };
}

function kibibytes(value: number) {
  return `${(value / 1024).toFixed(1)} KiB`;
}

export function formatPromptProfile(
  profile: PromptProfile,
  cache?: CacheGuardResult,
) {
  const lines = [
    `Last provider payload: ${kibibytes(profile.totalBytes)}`,
    `System ${kibibytes(profile.systemBytes)} · tools ${kibibytes(profile.toolBytes)} (${profile.tools}) · conversation ${kibibytes(profile.conversationBytes)} (${profile.messages} messages) · other ${kibibytes(profile.otherBytes)}`,
  ];
  if (cache) {
    const rate =
      cache.cacheRate === null
        ? "unavailable"
        : `${(cache.cacheRate * 100).toFixed(1)}%`;
    lines.push(
      `Cache ${rate} across ${cache.reusableTokens.toLocaleString()} reusable tokens · ${cache.message}`,
    );
  }
  return lines.join("\n");
}
