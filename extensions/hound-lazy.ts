import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createJiti } from "jiti";
import { access } from "node:fs/promises";

const houndModulePath = new URL(
  "../git/github.com/dondai44423/master-fetch/pi-extension/extensions/hound.ts",
  import.meta.url,
).pathname;

type HoundRegistrar = (api: ExtensionAPI) => void;

async function loadHoundRegistrar(): Promise<HoundRegistrar> {
  try {
    await access(houndModulePath);
  } catch {
    throw new Error(
      `Pinned Hound extension source is missing: ${houndModulePath}`,
    );
  }

  try {
    return await createJiti(import.meta.url).import<HoundRegistrar>(
      houndModulePath,
      { default: true },
    );
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to load pinned Hound extension at ${houndModulePath}: ${detail}`,
      { cause: error },
    );
  }
}

/** Keep Hound registered while deferring its MCP process until the first call. */
export default async function lazyHound(pi: ExtensionAPI) {
  const registerHound = await loadHoundRegistrar();
  const lazyApi = new Proxy(pi, {
    get(target, property) {
      if (property !== "on") {
        const value = Reflect.get(target, property, target);
        return typeof value === "function" ? value.bind(target) : value;
      }

      return (event: string, handler: (...args: unknown[]) => unknown) => {
        if (event === "session_start") return;
        return (target.on as (...args: unknown[]) => unknown)(event, handler);
      };
    },
  }) as ExtensionAPI;

  registerHound(lazyApi);
}
