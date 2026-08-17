import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createJiti } from "jiti";

const houndModulePath = new URL(
  "../git/github.com/dondai44423/master-fetch/pi-extension/extensions/hound.ts",
  import.meta.url,
).pathname;

/** Keep Hound registered while deferring its MCP process until the first call. */
export default async function lazyHound(pi: ExtensionAPI) {
  const registerHound = await createJiti(import.meta.url).import<
    (api: ExtensionAPI) => void
  >(houndModulePath, { default: true });
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
