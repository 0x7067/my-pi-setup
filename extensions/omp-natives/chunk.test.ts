/**
 * chunk.test.ts — token-budgeted chunking (chunk_text_by_tokens core).
 * Exercises the real function with the real native tokenizer.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { chunkText } from "./index.ts";
import { loadNatives } from "../shared/native-node.ts";
import type { Encoding } from "@oh-my-pi/pi-natives";

const { countTokens } = loadNatives();
const ENC = "O200kBase" as Encoding;
const tokensOf = (text: string) => countTokens(text, ENC);

/** Chunks must be contiguous, ordered, within budget, and cover the input. */
function assertValidChunks(
	text: string,
	budget: number,
	chunks: {
		startChar: number;
		endChar: number;
		tokens: number;
		chars: number;
	}[],
) {
	let cursor = 0;
	for (const chunk of chunks) {
		assert.equal(chunk.startChar, cursor, "chunks must be contiguous");
		assert.ok(chunk.endChar > chunk.startChar, "chunks must be non-empty");
		assert.equal(chunk.chars, chunk.endChar - chunk.startChar);
		assert.ok(
			chunk.tokens <= budget,
			`chunk ${chunk.tokens} tokens exceeds budget ${budget}`,
		);
		cursor = chunk.endChar;
	}
	assert.equal(cursor, text.length, "chunks must cover the whole input");
}

test("empty text yields no chunks", () => {
	const result = chunkText("", 1000, ENC, "t");
	assert.equal(result.chunkCount, 0);
	assert.deepEqual(result.chunks, []);
	assert.equal(result.totalTokens, 0);
});

test("short text under budget yields one full chunk", () => {
	const text = "line one\nline two\nline three\n";
	const result = chunkText(text, 1000, ENC, "t");
	assert.equal(result.chunkCount, 1);
	const [chunk] = result.chunks;
	assert.equal(chunk.startChar, 0);
	assert.equal(chunk.endChar, text.length);
	assert.equal(chunk.startLine, 1);
	assert.equal(chunk.endLine, 3);
	assert.equal(result.totalChars, text.length);
});

test("chunks split at line boundaries", () => {
	const line = "word ".repeat(200) + "\n"; // ~1000 chars/line, ~200 tokens/line
	const text = line.repeat(20);
	const budget = 1000;
	const result = chunkText(text, budget, ENC, "t");
	assert.ok(result.chunkCount > 1, "expected multiple chunks");
	assertValidChunks(text, budget, result.chunks);
	for (const chunk of result.chunks) {
		// Every chunk ends exactly at a line boundary (no mid-line cuts).
		assert.equal(
			text[chunk.endChar - 1],
			"\n",
			"chunk must end at a line boundary",
		);
		assert.equal(
			chunk.endLine - chunk.startLine + 1,
			chunk.chars / line.length,
			"line span must match",
		);
	}
});

test("a single line exceeding the budget is split at token boundaries", () => {
	const text = "token ".repeat(2000); // 10k chars, no newlines, ~4k tokens
	const budget = 500;
	const result = chunkText(text, budget, ENC, "t");
	assert.ok(result.chunkCount > 1, "expected the long line to be split");
	assertValidChunks(text, budget, result.chunks);
	for (const chunk of result.chunks) {
		assert.equal(
			chunk.startLine,
			1,
			"single-line input keeps line numbers at 1",
		);
		assert.equal(chunk.endLine, 1);
	}
});

test("mixed content: long line forces a split inside an otherwise line-chunked file", () => {
	const header = "short header line\n";
	const huge = "x".repeat(50_000) + "\n"; // one huge line (~12.5k tokens)
	const footer = "short footer line\n";
	const text = header + huge + footer;
	const budget = 2000;
	const result = chunkText(text, budget, ENC, "t");
	assertValidChunks(text, budget, result.chunks);
	// The header must stay in its own leading chunk; the footer in a trailing one.
	assert.equal(result.chunks[0].endChar, header.length);
	assert.equal(result.chunks.at(-1)!.startChar, header.length + huge.length);
	assert.equal(result.chunks.at(-1)!.endLine, 3);
	// Reported per-chunk tokens may over-count the true total (tiktoken merges
	// across cuts), but must never under-count it.
	const sum = result.chunks.reduce((acc, c) => acc + c.tokens, 0);
	assert.ok(
		sum >= tokensOf(text),
		"sum of chunk token counts must cover the input",
	);
});

test("chunked total matches a direct token count", () => {
	const text = "alpha beta gamma\n".repeat(500);
	const budget = 1500;
	const result = chunkText(text, budget, ENC, "t");
	assertValidChunks(text, budget, result.chunks);
	assert.ok(
		Math.abs(result.totalTokens - tokensOf(text)) <= 64,
		"totalTokens should be close to the direct count",
	);
});
