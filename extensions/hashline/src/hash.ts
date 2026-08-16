/**
 * Deterministic string hashes for hashline's Node runtime.
 *
 * omp's src calls `Bun.hash` / `Bun.hash.xxHash32`, which don't exist under
 * pi's Node runtime. These are pure-TS replacements:
 *
 * - `xxHash32(text, seed)` implements the standard xxHash32 algorithm, so it
 *   returns the exact same values Bun's `Bun.hash.xxHash32` produces — the
 *   file tags hashline mints stay byte-identical to omp's.
 * - `hashText(text)` is a stable 32-bit string hash for in-memory cache keys
 *   (collisions only cost a cache miss, never correctness).
 */

const P1 = 0x9e3779b1;
const P2 = 0x85ebca77;
const P3 = 0xc2b2ae3d;
const P4 = 0x27d4eb2f;
const P5 = 0x165667b1;

function rotl(x: number, r: number): number {
	return ((x << r) | (x >>> (32 - r))) >>> 0;
}

function readU32(bytes: Uint8Array, i: number): number {
	return (
		(bytes[i] |
			(bytes[i + 1] << 8) |
			(bytes[i + 2] << 16) |
			(bytes[i + 3] << 24)) >>>
		0
	);
}

function round(acc: number, lane: number): number {
	// Math.imul computes the exact low 32 bits of the 64-bit product; plain `*`
	// loses precision past 2^53 for 32-bit operands.
	acc = (acc + Math.imul(lane, P2)) >>> 0;
	acc = rotl(acc, 13);
	return Math.imul(acc, P1) >>> 0;
}

/** Standard xxHash32 (same output as Bun's `Bun.hash.xxHash32`). */
export function xxHash32(input: string, seed = 0): number {
	const bytes = new TextEncoder().encode(input);
	const len = bytes.length;
	let i = 0;

	let h: number;
	if (len >= 16) {
		let v1 = (seed + P1 + P2) >>> 0;
		let v2 = (seed + P2) >>> 0;
		let v3 = seed >>> 0;
		let v4 = (seed - P1) >>> 0;
		for (; i + 16 <= len; i += 16) {
			v1 = round(v1, readU32(bytes, i));
			v2 = round(v2, readU32(bytes, i + 4));
			v3 = round(v3, readU32(bytes, i + 8));
			v4 = round(v4, readU32(bytes, i + 12));
		}
		h = (rotl(v1, 1) + rotl(v2, 7) + rotl(v3, 12) + rotl(v4, 18)) >>> 0;
	} else {
		h = (seed + P5) >>> 0;
	}

	h = (h + len) >>> 0;
	for (; i + 4 <= len; i += 4) {
		h = (h + Math.imul(readU32(bytes, i), P3)) >>> 0;
		h = rotl(h, 17);
		h = Math.imul(h, P4) >>> 0;
	}
	for (; i < len; i++) {
		h = (h + Math.imul(bytes[i], P5)) >>> 0;
		h = rotl(h, 11);
		h = Math.imul(h, P1) >>> 0;
	}

	h ^= h >>> 15;
	h = Math.imul(h, P2) >>> 0;
	h ^= h >>> 13;
	h = Math.imul(h, P3) >>> 0;
	h ^= h >>> 16;
	return h >>> 0;
}

/** Stable 32-bit hash for cache keys (FNV-1a over UTF-8). */
export function hashText(text: string): number {
	let h = 0x811c9dc5;
	const bytes = new TextEncoder().encode(text);
	for (let i = 0; i < bytes.length; i++) {
		h ^= bytes[i];
		h = Math.imul(h, 0x01000193) >>> 0;
	}
	return h;
}
