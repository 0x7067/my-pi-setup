import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");

const patches = [
  {
    module: "@earendil-works/pi-ai/api/anthropic-messages",
    replacements: [
      [
        "output.usage.cacheWrite = event.message.usage.cache_creation_input_tokens || 0;",
        'output.usage.cacheWrite = event.message.usage.cache_creation_input_tokens || 0;\n                    if (typeof event.message.usage.cache_creation_input_tokens === "number")\n                        output.usage.cacheWriteReported = true;',
      ],
      [
        "output.usage.cacheWrite = event.usage.cache_creation_input_tokens;",
        "output.usage.cacheWrite = event.usage.cache_creation_input_tokens;\n                            output.usage.cacheWriteReported = true;",
      ],
    ],
  },
  {
    module: "@earendil-works/pi-ai/api/bedrock-converse-stream",
    replacements: [
      [
        "output.usage.cacheWrite = event.usage.cacheWriteInputTokens || 0;",
        'output.usage.cacheWrite = event.usage.cacheWriteInputTokens || 0;\n        if (typeof event.usage.cacheWriteInputTokens === "number")\n            output.usage.cacheWriteReported = true;',
      ],
    ],
  },
  {
    module: "@earendil-works/pi-ai/api/openai-completions",
    replacements: [
      [
        "const cacheWriteTokens = rawUsage.prompt_tokens_details?.cache_write_tokens || 0;",
        'const rawCacheWriteTokens = rawUsage.prompt_tokens_details?.cache_write_tokens;\n    const cacheWriteReported = typeof rawCacheWriteTokens === "number" && Number.isFinite(rawCacheWriteTokens);\n    const cacheWriteTokens = cacheWriteReported ? rawCacheWriteTokens : 0;',
      ],
      [
        "cacheWrite: cacheWriteTokens,\n        reasoning:",
        "cacheWrite: cacheWriteTokens,\n        ...(cacheWriteReported ? { cacheWriteReported: true } : {}),\n        reasoning:",
      ],
    ],
  },
  {
    module: "@earendil-works/pi-ai/api/openai-responses-shared",
    replacements: [
      [
        "const cacheWriteTokens = inputDetails?.cache_write_tokens || 0;",
        'const rawCacheWriteTokens = inputDetails?.cache_creation_tokens ?? inputDetails?.cache_write_tokens;\n            const cacheWriteReported = typeof rawCacheWriteTokens === "number" && Number.isFinite(rawCacheWriteTokens);\n            const cacheWriteTokens = cacheWriteReported ? rawCacheWriteTokens : 0;',
      ],
      [
        "cacheWrite: cacheWriteTokens,\n                reasoning:",
        "cacheWrite: cacheWriteTokens,\n                ...(cacheWriteReported ? { cacheWriteReported: true } : {}),\n                reasoning:",
      ],
    ],
  },
];

for (const patch of patches) {
  const file = fileURLToPath(import.meta.resolve(patch.module));
  const location = relative(root, file);
  if (location.startsWith("..")) {
    throw new Error(
      `Refusing to patch dependency outside the worktree: ${file}`,
    );
  }
  let source = await readFile(file, "utf8");
  let changed = false;
  for (const [before, after] of patch.replacements) {
    if (source.includes(after)) continue;
    if (!source.includes(before)) {
      throw new Error(`Unsupported ${patch.module} source at ${location}`);
    }
    source = source.replace(before, after);
    changed = true;
  }
  if (changed) await writeFile(file, source);
}
