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
 *   - clipboard_read_image  save the clipboard image to a private temp PNG, return path
 *   - clipboard_copy        copy text to the system clipboard
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import {
	access,
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
// model context. Outputs over the cap are truncated with an explicit marker.
const MAX_PDF_BYTES = 50 * 1024 * 1024; // 50 MB
const MAX_HTML_CHARS = 2 * 1024 * 1024; // 2M chars
const MAX_OUTPUT_CHARS = 60_000; // tool result cap (~15k tokens)

function truncate(text: string): string {
	if (text.length <= MAX_OUTPUT_CHARS) return text;
	return (
		text.slice(0, MAX_OUTPUT_CHARS) +
		`\n\n[… truncated: ${text.length - MAX_OUTPUT_CHARS} more chars (${text.length.toLocaleString()} total) ]`
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

export default function (pi: ExtensionAPI) {
	// Local PDF -> Markdown. No network, no hosted model.
	pi.registerTool({
		name: "pdf_to_markdown",
		label: "PDF to Markdown",
		description:
			"Extract text from a local PDF file as Markdown using a native Rust extractor. " +
			"No network call, no hosted model. Returns markdown plus page count and any pages " +
			"flagged as needing OCR (scanned/image pages). Prefer this over parse-file for fast " +
			"local text extraction from text-based PDFs. Input capped at 50MB; output truncated at 60k chars.",
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
				return err(`Could not read ${params.path}: ${(e as Error).message}`);
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
				(result.hasEncodingIssues ? " · encoding issues detected" : "") +
				"_\n\n";
			return ok(truncate(meta + result.markdown), {
				pageCount: result.pageCount,
				pagesNeedingOcr: result.pagesNeedingOcr,
				hasEncodingIssues: result.hasEncodingIssues,
				title: result.title,
			});
		},
	});

	// HTML string -> Markdown. Native, no network.
	pi.registerTool({
		name: "html_to_markdown",
		label: "HTML to Markdown",
		description:
			"Convert an HTML string to clean Markdown using a native Rust converter. " +
			"Strips navigation/forms/headers/footers by default. Pass raw HTML (max 2M chars), not " +
			"a URL (use web_fetch first if you need to retrieve a page). Output truncated at 60k chars.",
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
				return ok(truncate(md));
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
				Type.Union([Type.Literal("o200k_base"), Type.Literal("cl100k_base")], {
					description: "Tokenizer encoding. Defaults to o200k_base.",
				}),
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
					return ok("Clipboard does not contain an image.", { empty: true });
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
			text: Type.String({ description: "Text to place on the clipboard." }),
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
		ctx.ui.notify("omp-natives loaded (pdf/html/tokens/clipboard)", "info");
	});
}

void access;
