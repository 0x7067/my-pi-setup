/**
 * omp-natives — exposes selected capabilities from the @oh-my-pi/pi-natives
 * Rust addon as pi tools.
 *
 * The addon is reused verbatim (prebuilt .node per platform); nothing is
 * reimplemented. Because omp ships a Bun-only JS loader and pi runs Node, the
 * raw .node binary is loaded directly via ../shared/native-node.ts (plain
 * N-API `require` — the binary itself is runtime-agnostic). Types are imported
 * type-only from the package (erased at runtime, so the Bun loader never runs).
 *
 * Tools:
 *   - pdf_to_markdown       local PDF extraction (no hosted model, no network)
 *   - html_to_markdown      HTML string -> clean Markdown
 *   - count_tokens          native token estimate for a string
 *   - chunk_text_by_tokens  split text into token-budgeted chunks (ranges, not content)
 *   - clipboard_read_image  save the clipboard image to a private temp PNG, return path
 *   - clipboard_copy        copy text to the system clipboard
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import {
	access,
	chmod,
	mkdtemp,
	mkdir,
	readFile,
	readdir,
	rm,
	stat,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadNatives } from "../shared/native-node.ts";
import type { Encoding, PdfMarkdownResult } from "@oh-my-pi/pi-natives";

const {
	pdfToMarkdown,
	htmlToMarkdown,
	countTokens,
	copyToClipboard,
	readImageFromClipboard,
} = loadNatives();

type Details = Record<string, unknown>;
type Result = { content: [{ type: "text"; text: string }]; details: Details };

const ok = (text: string, details: Details = {}): Result => ({
	content: [{ type: "text", text }],
	details,
});
const err = (msg: string, details: Details = {}): Result => ({
	content: [{ type: "text", text: msg }],
	details: { error: true, ...details },
});
const aborted = (): Result => ok("Aborted.", { aborted: true });

// Hard bounds so a hostile/oversized input cannot blow memory or overflow the
// model context. Outputs over the cap are truncated at a token boundary (native
// tiktoken count, not a chars/4 guess) with an explicit marker.
const MAX_PDF_BYTES = 50 * 1024 * 1024; // 50 MB
const MAX_HTML_CHARS = 2 * 1024 * 1024; // 2M chars
const MAX_OUTPUT_TOKENS = 15_000; // tool result cap (~60k chars of prose)
const ENC: Encoding = "O200kBase" as Encoding; // string enum; type-only import, so the Bun loader never runs

// Chunking has a tighter bound than PDF extraction. Chunk manifests contain
// one range per chunk, so an unbounded input/minimum budget can otherwise
// create a large synchronous tokenizer workload and a huge JSON result.
const MAX_CHUNK_INPUT_CHARS = 8 * 1024 * 1024;
const MAX_CHUNK_INPUT_BYTES = 16 * 1024 * 1024;
const MAX_CHUNK_BUDGET_TOKENS = 8_000;
const MAX_CHUNK_MANIFEST_BYTES = 96 * 1024;
const MAX_CHUNK_MANIFEST_TOKENS = 4_000;
const MAX_CHUNKS_REPORTED = 512;
const CHUNK_DIR_PREFIX = "omp-chunks-";
const MAX_CHUNK_LINE_CHARS = 128 * 1024;
const MAX_PREFIX_SEARCH_WINDOW_CHARS = 256 * 1024;

/** Native token count for a string. */
function tokensOf(text: string): number {
	return countTokens(text, ENC);
}

type TokenCounter = (text: string, enc: Encoding) => number;

function throwIfAborted(signal?: AbortSignal): void {
	if (signal?.aborted) {
		const error = new Error("Chunking aborted");
		error.name = "AbortError";
		throw error;
	}
}

/** Move a UTF-16 offset back so it never lands between a surrogate pair. */
function safeUtf16Boundary(text: string, offset: number): number {
	if (
		offset > 0 &&
		offset < text.length &&
		text.charCodeAt(offset - 1) >= 0xd800 &&
		text.charCodeAt(offset - 1) <= 0xdbff &&
		text.charCodeAt(offset) >= 0xdc00 &&
		text.charCodeAt(offset) <= 0xdfff
	) {
		return offset - 1;
	}
	return offset;
}

function nonEmptySafeBoundary(
	text: string,
	start: number,
	offset: number,
	end = text.length,
): number {
	const safe = safeUtf16Boundary(text, Math.min(end, offset));
	if (safe > start || safe === end) return safe;
	const code = text.codePointAt(start);
	return Math.min(end, start + (code !== undefined && code > 0xffff ? 2 : 1));
}

/** Longest safe char offset whose prefix stays within `maxTokens`. */
function longestPrefixWithin(
	text: string,
	maxTokens: number,
	enc: Encoding = ENC,
	signal?: AbortSignal,
	tokenCounter: TokenCounter = countTokens,
): number {
	if (maxTokens <= 0 || text.length === 0) return 0;
	throwIfAborted(signal);
	const totalTokens = tokenCounter(text, enc);
	if (totalTokens <= maxTokens) return text.length;

	// A full-text count gives us a useful first probe. Subsequent probes are
	// bounded to a small window instead of repeatedly tokenizing a giant suffix.
	let lo = 0;
	const searchEnd = Math.min(text.length, MAX_PREFIX_SEARCH_WINDOW_CHARS);
	let hi = Math.min(
		searchEnd,
		Math.max(1, Math.ceil((text.length * maxTokens) / totalTokens)),
	);
	let hiTokens = tokenCounter(text.slice(0, hi), enc);
	while (hi < searchEnd && hiTokens <= maxTokens) {
		throwIfAborted(signal);
		lo = hi;
		hi = Math.min(searchEnd, Math.max(hi + 1, hi * 2));
		hiTokens = tokenCounter(text.slice(0, hi), enc);
	}
	if (hiTokens <= maxTokens) return nonEmptySafeBoundary(text, 0, hi);

	while (lo < hi) {
		throwIfAborted(signal);
		const mid = (lo + hi + 1) >> 1;
		if (tokenCounter(text.slice(0, mid), enc) <= maxTokens) lo = mid;
		else hi = mid - 1;
	}
	return nonEmptySafeBoundary(text, 0, lo);
}

/** Truncate at a token boundary, backing off to a line break, with a marker. */
function truncateToTokens(text: string, maxTokens: number): string {
	if (tokensOf(text) <= maxTokens) return text;
	const cut = longestPrefixWithin(text, maxTokens); // Prefer a clean line boundary near the cut (up to 2000 chars back).
	const nl = text.lastIndexOf("\n", cut);
	const boundary = safeUtf16Boundary(
		text,
		nl >= 0 && cut - nl <= 2000 ? nl + 1 : cut,
	);
	const dropped = text.slice(boundary);
	return (
		text.slice(0, boundary) +
		`\n\n[… truncated: ${dropped.length.toLocaleString()} more chars (~${tokensOf(dropped).toLocaleString()} tokens omitted, ${text.length.toLocaleString()} total) ]`
	);
}

/** Private per-call temp dir for clipboard images, with stale-file cleanup. */
const CLIP_DIR_PREFIX = "omp-clip-";
async function clipDir(): Promise<string> {
	const dir = join(
		tmpdir(),
		`${CLIP_DIR_PREFIX}${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
	);
	await mkdir(dir, { recursive: true, mode: 0o700 });
	return dir;
}
/** Remove our own temp dirs older than 24h (best-effort, fires on session start). */
async function cleanupStaleClips(): Promise<void> {
	try {
		const entries = await readdir(tmpdir());
		const day = 24 * 60 * 60 * 1000;
		const now = Date.now();
		await Promise.all(
			entries
				.filter((e) => e.startsWith(CLIP_DIR_PREFIX))
				.map((e) => join(tmpdir(), e))
				.map(async (p) => {
					try {
						if (now - (await stat(p)).mtimeMs > day)
							await rm(p, { recursive: true, force: true });
					} catch {
						// ignore per-entry errors
					}
					return undefined;
				}),
		);
	} catch {
		// best-effort
	}
}

/** Create an owner-only directory/file for bounded manifests and inline input. */
async function writePrivateChunkFile(
	name: string,
	contents: string,
): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), CHUNK_DIR_PREFIX));
	await chmod(dir, 0o700);
	const file = join(dir, name);
	await writeFile(file, contents, { encoding: "utf8", mode: 0o600 });
	return file;
}

async function cleanupStaleChunks(): Promise<void> {
	try {
		const entries = await readdir(tmpdir());
		const day = 24 * 60 * 60 * 1000;
		const now = Date.now();
		await Promise.all(
			entries
				.filter((entry) => entry.startsWith(CHUNK_DIR_PREFIX))
				.map((entry) => join(tmpdir(), entry))
				.map(async (path) => {
					try {
						if (now - (await stat(path)).mtimeMs > day)
							await rm(path, { recursive: true, force: true });
					} catch {
						// Best-effort per-entry cleanup.
					}
				}),
		);
	} catch {
		// Best-effort cleanup.
	}
}

export function manifestPreview(result: ChunkResult): {
	json: string;
	ranges: number;
	tokens: number;
	bytes: number;
} {
	let ranges = Math.min(MAX_CHUNKS_REPORTED, result.chunks.length);
	let json = "";
	let tokens = 0;
	let bytes = 0;
	while (ranges >= 0) {
		json = JSON.stringify(
			{ ...result, chunks: result.chunks.slice(0, ranges) },
			null,
			2,
		);
		bytes = Buffer.byteLength(json, "utf8");
		tokens = tokensOf(json);
		if (
			bytes <= MAX_CHUNK_MANIFEST_BYTES &&
			tokens <= MAX_CHUNK_MANIFEST_TOKENS
		)
			break;
		ranges = Math.max(0, ranges - 64);
	}
	return { json, ranges, tokens, bytes };
}

// ---------------------------------------------------------------------------
// Token-budgeted chunking (ranges only — content stays out of context)
// ---------------------------------------------------------------------------
interface ChunkRange {
	index: number;
	startChar: number;
	endChar: number;
	startLine: number;
	endLine: number;
	tokens: number;
	chars: number;
}
interface ChunkResult {
	source: string;
	totalChars: number;
	totalTokens: number;
	chunkCount: number;
	chunksTruncated: boolean;
	chunks: ChunkRange[];
}

/**
 * Estimate one long-line segment from the known whole-line token density.
 * A single bounded native count validates the conservative estimate; only an
 * over-budget estimate triggers geometric shrinking. This avoids binary
 * searching (and repeatedly retokenizing) the remainder of a minified line.
 */
function conservativeSegment(
	text: string,
	start: number,
	end: number,
	budget: number,
	enc: Encoding,
	lineChars: number,
	lineTokens: number,
	signal?: AbortSignal,
	tokenCounter: TokenCounter = countTokens,
): { end: number; tokens: number } {
	if (start >= end) return { end: start, tokens: 0 };
	const averageCharsPerToken = lineChars / Math.max(1, lineTokens);
	let span = Math.max(
		1,
		Math.floor(budget * 0.9 * Math.max(1, averageCharsPerToken)),
	);
	let segmentEnd = nonEmptySafeBoundary(
		text,
		start,
		Math.min(end, start + span),
		end,
	);
	let segmentTokens = 0;
	while (true) {
		throwIfAborted(signal);
		segmentTokens = tokenCounter(text.slice(start, segmentEnd), enc);
		if (segmentTokens <= budget || segmentEnd <= start + 1) break;
		span = Math.max(1, Math.floor((segmentEnd - start) * 0.8));
		segmentEnd = nonEmptySafeBoundary(text, start, start + span, end);
	}
	return { end: segmentEnd, tokens: segmentTokens };
}

/** Split text into ≤budget-token chunks; returns ranges, never the content. */
export function chunkText(
	text: string,
	budget: number,
	enc: Encoding,
	source: string,
	signal?: AbortSignal,
	tokenCounter: TokenCounter = countTokens,
): ChunkResult {
	if (!Number.isInteger(budget) || budget < 1) {
		throw new RangeError("Chunk budget must be a positive integer");
	}
	if (text.length > MAX_CHUNK_INPUT_CHARS) {
		throw new RangeError(
			`Chunk input too large: ${text.length.toLocaleString()} UTF-16 chars (cap ${MAX_CHUNK_INPUT_CHARS.toLocaleString()}).`,
		);
	}
	throwIfAborted(signal);
	// Split into lines, recording char offsets and per-line token counts.
	const lines: { start: number; end: number; tokens: number }[] = [];
	{
		let pos = 0;
		while (pos < text.length) {
			throwIfAborted(signal);
			const nl = text.indexOf("\n", pos);
			const end = nl === -1 ? text.length : nl + 1; // keep the newline with its line
			if (end - pos > MAX_CHUNK_LINE_CHARS) {
				throw new RangeError(
					`Chunk line too long: ${(end - pos).toLocaleString()} UTF-16 chars (cap ${MAX_CHUNK_LINE_CHARS.toLocaleString()}).`,
				);
			}
			lines.push({
				start: pos,
				end,
				tokens: tokenCounter(text.slice(pos, end), enc),
			});
			pos = end;
		}
	}
	if (text.length === 0) {
		return {
			source,
			totalChars: 0,
			totalTokens: 0,
			chunkCount: 0,
			chunksTruncated: false,
			chunks: [],
		};
	}
	const chunks: ChunkRange[] = [];
	let totalTokens = 0;
	const push = (
		startChar: number,
		endChar: number,
		startLine: number,
		endLine: number,
		knownTokens?: number,
	) => {
		if (endChar <= startChar) return;
		const tokens =
			knownTokens ?? tokenCounter(text.slice(startChar, endChar), enc);
		totalTokens += tokens;
		chunks.push({
			index: chunks.length,
			startChar,
			endChar,
			startLine,
			endLine,
			tokens,
			chars: endChar - startChar,
		});
	};

	let curStart = 0;
	let curStartLine = 1;
	let curTokens = 0;
	let i = 0;
	while (i < lines.length) {
		throwIfAborted(signal);
		const line = lines[i];
		if (line.tokens > budget) {
			// A single line exceeds the budget: close the pending chunk, then
			// split it using conservative density estimates and one check/piece.
			if (curTokens > 0) {
				push(curStart, line.start, curStartLine, i, curTokens);
				curTokens = 0;
			}
			let segStart = line.start;
			while (segStart < line.end) {
				throwIfAborted(signal);
				const segment = conservativeSegment(
					text,
					segStart,
					line.end,
					budget,
					enc,
					line.end - line.start,
					line.tokens,
					signal,
					tokenCounter,
				);
				push(segStart, segment.end, i + 1, i + 1, segment.tokens);
				segStart = segment.end;
			}
			curStart = line.end;
			curStartLine = i + 2;
			i += 1;
			continue;
		}
		if (curTokens > 0 && curTokens + line.tokens > budget) {
			push(curStart, line.start, curStartLine, i, curTokens);
			curStart = line.start;
			curStartLine = i + 1;
			curTokens = 0;
		}
		curTokens += line.tokens;
		i += 1;
	}
	if (curTokens > 0) {
		push(curStart, text.length, curStartLine, lines.length, curTokens);
	}
	const truncated = chunks.length > MAX_CHUNKS_REPORTED;
	return {
		source,
		totalChars: text.length,
		totalTokens,
		chunkCount: chunks.length,
		chunksTruncated: truncated,
		// Keep the complete range list in memory for the owner-only manifest and
		// chunk retrieval. Tool output projects this list down to a bounded preview.
		chunks,
	};
}

export default function (pi: ExtensionAPI) {
	// Local PDF -> Markdown. No network, no hosted model.
	pi.registerTool({
		name: "pdf_to_markdown",
		label: "PDF to Markdown",
		description:
			"Extract text from a local PDF file as Markdown using a native Rust extractor. " +
			"No network call, no hosted model. Returns markdown plus page count and any pages " +
			"flagged as needing OCR (scanned/image pages). Prefer this over parse-file for fast " +
			"local text extraction from text-based PDFs. Input capped at 50MB; output truncated at 15k tokens.",
		parameters: Type.Object({
			path: Type.String({
				description: "Absolute or cwd-relative path to the .pdf file.",
			}),
		}),
		async execute(_id, params, signal): Promise<Result> {
			let bytes: Uint8Array;
			try {
				const st = await stat(params.path);
				if (st.size > MAX_PDF_BYTES) {
					return err(
						`PDF too large: ${(st.size / 1024 / 1024).toFixed(1)}MB (cap ${MAX_PDF_BYTES / 1024 / 1024}MB).`,
					);
				}
				bytes = await readFile(params.path);
			} catch (e) {
				return err(
					`Could not read ${params.path}: ${(e as Error).message}`,
				);
			}
			if (signal?.aborted) return aborted();
			let result: PdfMarkdownResult;
			try {
				result = await pdfToMarkdown(bytes);
			} catch (e) {
				return err(`PDF extraction failed: ${(e as Error).message}`);
			}
			const meta =
				`# ${result.title ?? params.path}\n\n` +
				`_Pages: ${result.pageCount}` +
				(result.pagesNeedingOcr.length
					? ` · OCR-needed: ${result.pagesNeedingOcr.join(", ")}`
					: "") +
				(result.hasEncodingIssues
					? " · encoding issues detected"
					: "") +
				"_\n\n";
			return ok(
				truncateToTokens(meta + result.markdown, MAX_OUTPUT_TOKENS),
				{
					pageCount: result.pageCount,
					pagesNeedingOcr: result.pagesNeedingOcr,
					hasEncodingIssues: result.hasEncodingIssues,
					title: result.title,
				},
			);
		},
	});

	// HTML string -> Markdown. Native, no network.
	pi.registerTool({
		name: "html_to_markdown",
		label: "HTML to Markdown",
		description:
			"Convert an HTML string to clean Markdown using a native Rust converter. " +
			"Strips navigation/forms/headers/footers by default. Pass raw HTML (max 2M chars), not " +
			"a URL (use web_fetch first if you need to retrieve a page). Output truncated at 15k tokens.",
		parameters: Type.Object({
			html: Type.String({ description: "Raw HTML content to convert." }),
			skipImages: Type.Boolean({
				description: "Drop <img> tags from the output.",
				default: false,
			}),
		}),
		async execute(_id, params, signal): Promise<Result> {
			if (signal?.aborted) return aborted();
			if (params.html.length > MAX_HTML_CHARS) {
				return err(
					`HTML too large: ${params.html.length.toLocaleString()} chars (cap ${MAX_HTML_CHARS.toLocaleString()}).`,
				);
			}
			try {
				const md = await htmlToMarkdown(params.html, {
					cleanContent: true,
					skipImages: params.skipImages ?? false,
				});
				return ok(truncateToTokens(md, MAX_OUTPUT_TOKENS));
			} catch (e) {
				return err(`HTML conversion failed: ${(e as Error).message}`);
			}
		},
	});

	// Token counting via the native tiktoken-backed counter.
	pi.registerTool({
		name: "count_tokens",
		label: "Count tokens",
		description:
			"Estimate the token count of a string with the native tokenizer (tiktoken o200k_base or " +
			"cl100k_base). This is a text-only approximation — it does not account for provider " +
			"message wrappers, images, or tool schemas, so treat it as a rough budget, not an exact " +
			"provider billing count.",
		parameters: Type.Object({
			text: Type.String({ description: "The text to count tokens for." }),
			encoding: Type.Optional(
				Type.Union(
					[Type.Literal("o200k_base"), Type.Literal("cl100k_base")],
					{
						description:
							"Tokenizer encoding. Defaults to o200k_base.",
					},
				),
			),
		}),
		async execute(_id, params, signal): Promise<Result> {
			if (signal?.aborted) return aborted();
			const enc =
				params.encoding === "cl100k_base" ? "Cl100kBase" : "O200kBase";
			const n = countTokens(params.text, enc as Encoding);
			const label = params.encoding ?? "o200k_base";
			return ok(`${n} tokens (${label})`, { count: n, encoding: label });
		},
	});

	// Chunk large text into token-budgeted pieces, returning ranges + counts.
	pi.registerTool({
		name: "chunk_text_by_tokens",
		label: "Chunk text by tokens",
		description:
			"Split text (from a file or inline) into chunks of at most `budget` tokens using the native " +
			"tokenizer, and return each chunk's char/line range and token count — not the text itself. " +
			"Prefer `path` for large inputs so the content never enters context. Exactly one of `path` " +
			"or `text` is required; chunks never split mid-line, and an over-budget single line is split " +
			"at safe token boundaries. The manifest preview is bounded; use the returned owner-only " +
			"manifestPath for the complete range list. To retrieve one chunk, call this tool again with " +
			"the same path, budget, and zero-based `chunk` index; this works for chunks inside long lines. " +
			"Inputs are capped at 8M UTF-16 chars and individual lines at 128K chars. " +
			"Do not pass character offsets to Pi's read tool (its offsets are line-based).",
		parameters: Type.Object({
			path: Type.Optional(
				Type.String({
					description:
						"Absolute or cwd-relative path to the file to chunk.",
				}),
			),
			text: Type.Optional(
				Type.String({
					description: "Inline text to chunk instead of a file.",
				}),
			),
			budget: Type.Integer({
				minimum: 256,
				maximum: MAX_CHUNK_BUDGET_TOKENS,
				description: "Maximum tokens per chunk.",
			}),
			chunk: Type.Optional(
				Type.Integer({
					minimum: 0,
					description:
						"Zero-based chunk index to retrieve as bounded text instead of returning a manifest.",
				}),
			),
			encoding: Type.Optional(
				Type.Union(
					[Type.Literal("o200k_base"), Type.Literal("cl100k_base")],
					{
						description:
							"Tokenizer encoding. Defaults to o200k_base.",
					},
				),
			),
		}),
		async execute(_id, params, signal): Promise<Result> {
			if (signal?.aborted) return aborted();
			if ((params.path === undefined) === (params.text === undefined)) {
				return err("Provide exactly one of `path` or `text`.");
			}
			const enc: Encoding = (
				params.encoding === "cl100k_base" ? "Cl100kBase" : "O200kBase"
			) as Encoding;
			let text: string;
			let source: string;
			if (params.path !== undefined) {
				try {
					const st = await stat(params.path);
					if (st.size > MAX_CHUNK_INPUT_BYTES) {
						return err(
							`File too large: ${(st.size / 1024 / 1024).toFixed(1)}MB (cap ${MAX_CHUNK_INPUT_BYTES / 1024 / 1024}MB).`,
						);
					}
					text = await readFile(params.path, "utf8");
				} catch (e) {
					return err(
						`Could not read ${params.path}: ${(e as Error).message}`,
					);
				}
				source = params.path;
			} else {
				text = params.text!;
				source = "<inline>";
			}
			if (text.length > MAX_CHUNK_INPUT_CHARS) {
				return err(
					`Chunk input too large: ${text.length.toLocaleString()} UTF-16 chars (cap ${MAX_CHUNK_INPUT_CHARS.toLocaleString()}).`,
				);
			}
			if (signal?.aborted) return aborted();
			let result: ChunkResult;
			try {
				result = chunkText(text, params.budget, enc, source, signal);
			} catch (error) {
				if ((error as Error).name === "AbortError") return aborted();
				return err(`Chunking failed: ${(error as Error).message}`);
			}

			if (params.chunk !== undefined) {
				const range = result.chunks[params.chunk];
				if (!range) {
					return err(
						`Chunk index ${params.chunk} is out of range (0–${Math.max(0, result.chunkCount - 1)}).`,
					);
				}
				const chunk = text.slice(range.startChar, range.endChar);
				const chunkTokens = tokensOf(chunk);
				if (chunkTokens > MAX_CHUNK_BUDGET_TOKENS) {
					return err(
						`Selected chunk is ${chunkTokens.toLocaleString()} tokens, above the ${MAX_CHUNK_BUDGET_TOKENS.toLocaleString()}-token retrieval cap.`,
					);
				}
				return ok(
					`Chunk ${params.chunk} of ${result.chunkCount} (${range.startChar}–${range.endChar}, ` +
						`${range.startLine}–${range.endLine}, ${chunkTokens} tokens):\n\n${chunk}`,
					{
						chunk: params.chunk,
						chunkCount: result.chunkCount,
						startChar: range.startChar,
						endChar: range.endChar,
						tokens: chunkTokens,
						source,
					},
				);
			}

			let sourcePath: string | undefined;
			try {
				if (params.text !== undefined)
					sourcePath = await writePrivateChunkFile(
						"source.txt",
						text,
					);
				const manifest = JSON.stringify(result, null, 2);
				const manifestPath = await writePrivateChunkFile(
					"manifest.json",
					manifest,
				);
				const preview = manifestPreview(result);
				const summary =
					`${result.chunkCount.toLocaleString()} chunks, ~${result.totalTokens.toLocaleString()} tokens total ` +
					`(budget ${params.budget.toLocaleString()}/chunk) from ${source}. ` +
					(preview.ranges < result.chunks.length
						? `Only the first ${preview.ranges.toLocaleString()} ranges are shown in this bounded preview. `
						: "") +
					`Complete manifest: ${manifestPath}. ` +
					(sourcePath
						? `Inline source saved privately at ${sourcePath}; reuse it with chunk=N for retrieval. `
						: "") +
					"Use chunk=N with the same path and budget to retrieve text; chunks can split long lines.\n\n" +
					preview.json;
				return ok(summary, {
					chunkCount: result.chunkCount,
					totalTokens: result.totalTokens,
					totalChars: result.totalChars,
					source: result.source,
					manifestPath,
					sourcePath,
					manifestPreviewRanges: preview.ranges,
					manifestPreviewTokens: preview.tokens,
					manifestPreviewBytes: preview.bytes,
				});
			} catch (error) {
				return err(
					`Could not write private chunk manifest: ${(error as Error).message}`,
				);
			}
		},
	});

	// Clipboard: read an image to a private temp file the agent can reference.
	pi.registerTool({
		name: "clipboard_read_image",
		label: "Read clipboard image",
		description:
			"Read an image from the system clipboard and save it to a private temp PNG file (mode 0600). " +
			"Returns the file path. Use when the user has a screenshot/image copied and you need a path " +
			"to pass to other tools. Returns a notice if the clipboard has no image.",
		parameters: Type.Object({}),
		async execute(_id, _params, signal): Promise<Result> {
			if (signal?.aborted) return aborted();
			try {
				const img = await readImageFromClipboard();
				if (!img)
					return ok("Clipboard does not contain an image.", {
						empty: true,
					});
				const dir = await clipDir();
				const dest = join(dir, "clipboard.png");
				await writeFile(dest, img.data, { mode: 0o600 });
				return ok(`Saved clipboard image to ${dest}`, {
					path: dest,
					mimeType: img.mimeType,
					bytes: img.data.byteLength,
				});
			} catch (e) {
				return err(`Clipboard read failed: ${(e as Error).message}`);
			}
		},
	});

	// Clipboard: copy text out.
	pi.registerTool({
		name: "clipboard_copy",
		label: "Copy to clipboard",
		description: "Copy text to the system clipboard.",
		parameters: Type.Object({
			text: Type.String({
				description: "Text to place on the clipboard.",
			}),
		}),
		async execute(_id, params, signal): Promise<Result> {
			if (signal?.aborted) return aborted();
			try {
				copyToClipboard(params.text);
				return ok(`Copied ${params.text.length} chars to clipboard.`);
			} catch (e) {
				return err(`Clipboard write failed: ${(e as Error).message}`);
			}
		},
	});

	// Surface availability on startup; also sweep stale clip dirs.
	pi.on("session_start", async (_event, ctx) => {
		await cleanupStaleClips();
		await cleanupStaleChunks();
		ctx.ui.notify("omp-natives loaded (pdf/html/tokens/clipboard)", "info");
	});
}

void access;
