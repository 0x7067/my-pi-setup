import assert from "node:assert/strict";
import test from "node:test";
import type {
  ExtensionAPI,
  ExtensionContext,
  Theme,
} from "@earendil-works/pi-coding-agent";
import type { Component } from "@earendil-works/pi-tui";
import deepseekPeakPricing from "./index.ts";

test("renders the peak-pricing status without an extra margin row", () => {
  let onSessionStart:
    ((event: unknown, context: ExtensionContext) => void) | undefined;
  let onSessionShutdown: (() => void) | undefined;
  let widgetFactory:
    ((tui: { requestRender(): void }, theme: Theme) => Component) | undefined;

  deepseekPeakPricing({
    registerCommand() {},
    on(event: string, handler: Function) {
      if (event === "session_start")
        onSessionStart = handler as typeof onSessionStart;
      if (event === "session_shutdown")
        onSessionShutdown = handler as typeof onSessionShutdown;
    },
  } as unknown as ExtensionAPI);

  const theme = {
    bold: (text: string) => text,
    fg: (_color: string, text: string) => text,
  } as unknown as Theme;
  const context = {
    hasUI: true,
    ui: {
      setWidget(
        _key: string,
        factory: typeof widgetFactory,
        _options: unknown,
      ) {
        widgetFactory = factory;
      },
    },
  } as unknown as ExtensionContext;

  assert.ok(onSessionStart);
  onSessionStart({}, context);
  assert.ok(widgetFactory);
  const component = widgetFactory({ requestRender() {} }, theme);

  assert.equal(component.render(100).length, 1);
  assert.match(component.render(100)[0] ?? "", /DeepSeek/);
  onSessionShutdown?.();
});
