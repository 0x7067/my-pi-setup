/**
 * native-node — load the @oh-my-pi/pi-natives Rust addon under Node.
 *
 * omp ships a Bun-first JS loader (`native/loader-state.js`) that uses
 * `import.meta.dir` and other Bun-only globals, so importing the package
 * normally throws under pi's Node runtime. The underlying `.node` binary is
 * plain N-API and loads fine under Node when `require`d directly — this module
 * is that direct load, shared by extensions that want the Rust impl.
 *
 * Usage:
 *   import { loadNatives } from "../shared/native-node.ts";
 *   const { diffLineRuns, countTokens } = loadNatives();
 *
 * Types come from `import type { ... } from "@oh-my-pi/pi-natives"` (erased at
 * runtime, so it never touches the Bun-only loader).
 */
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);

function platformTag(): string {
	return `${process.platform}-${process.arch}`;
}

/** Absolute path of the platform-specific .node binary inside the installed npm package. */
function binaryPath(): string {
	const platform = platformTag();
	const fileName = `pi_natives.${platform}.node`;
	const relPkg = path.join(
		"node_modules",
		"@oh-my-pi",
		`pi-natives-${platform}`,
		fileName,
	);
	// Walk up from this loader's own directory looking for the hoisted
	// optional-dep package in any enclosing node_modules (works whether the
	// extension tree lives under ~/.pi/agent or is installed standalone).
	const here = path.dirname(fileURLToPath(import.meta.url));
	let dir = here;
	for (let depth = 0; depth < 8; depth++) {
		const candidate = path.join(dir, relPkg);
		try {
			require("node:fs").accessSync(candidate);
			return candidate;
		} catch {
			const parent = path.dirname(dir);
			if (parent === dir) break;
			dir = parent;
		}
	}
	throw new Error(
		`[native-node] Could not find pi-natives-${platform} .node binary in any enclosing node_modules. ` +
			`Ensure "@oh-my-pi/pi-natives" is installed (bun add @oh-my-pi/pi-natives).`,
	);
}

type Natives = typeof import("@oh-my-pi/pi-natives");

let cached: Natives | null = null;

/** Load (once) and return the native addon's exports. Callers destructure the fns they need. */
export function loadNatives(): Natives {
	if (cached) return cached;
	// The path is derived from a fixed npm package layout (allowlisted above),
	// not user input.
	const addon = require(binaryPath()) as Natives;
	cached = addon;
	return addon;
}
