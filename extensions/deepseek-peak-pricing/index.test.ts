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

  const coloredCharacters: Array<{ color: string; text: string }> = [];
  const theme = {
    bold: (text: string) => text,
    fg: (color: string, text: string) => {
      coloredCharacters.push({ color, text });
      return text;
    },
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

  const wideLine = component.render(100);
  assert.equal(wideLine.length, 1);
  assert.match(wideLine[0] ?? "", /DeepSeek/);
  assert.match(wideLine[0] ?? "", /Beijing/);

  const peakBlocks = coloredCharacters.filter(({ text }) => text === "▓");
  assert.ok(peakBlocks.length > 0);
  assert.ok(peakBlocks.every(({ color }) => color === "warning"));

  const statusDot = coloredCharacters.find(({ text }) => text === "●");
  const currentBlock = coloredCharacters.find(({ text }) => text === "█");
  assert.ok(statusDot);
  assert.ok(currentBlock);
  assert.equal(currentBlock.color, statusDot.color);

  const narrowLine = component.render(40)[0] ?? "";
  assert.match(narrowLine, /DeepSeek/);
  assert.doesNotMatch(narrowLine, /Beijing|\[/);
  onSessionShutdown?.();
});
