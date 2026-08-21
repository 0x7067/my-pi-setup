import assert from "node:assert/strict";
import test from "node:test";
import type {
  ExtensionAPI,
  ExtensionContext,
  ReadonlyFooterDataProvider,
  Theme,
} from "@earendil-works/pi-coding-agent";
import type { Component, TUI } from "@earendil-works/pi-tui";
import {
  GIT_INFO_CHANNEL,
  MODEL_INFO_CHANNEL,
} from "../shared/dashboard-state.ts";
import uiCustomization from "./index.ts";

type Handler = (...args: unknown[]) => unknown;
type HeaderFactory = (tui: TUI, theme: Theme) => Component;
type FooterFactory = (
  tui: TUI,
  theme: Theme,
  footerData: ReadonlyFooterDataProvider,
) => Component;

function createHarness() {
  const lifecycle = new Map<string, Handler>();
  const events = new Map<string, Handler>();
  let headerFactory: HeaderFactory | undefined;
  let footerFactory: FooterFactory | undefined;

  const pi = {
    events: {
      on(name: string, handler: Handler) {
        events.set(name, handler);
        return () => events.delete(name);
      },
      emit() {},
    },
    on(name: string, handler: Handler) {
      lifecycle.set(name, handler);
    },
  } as unknown as ExtensionAPI;

  uiCustomization(pi);

  const ui = {
    setHeader(factory: HeaderFactory | undefined) {
      headerFactory = factory;
    },
    setFooter(factory: FooterFactory | undefined) {
      footerFactory = factory;
    },
    setTitle() {},
  };
  const context = {
    mode: "tui",
    cwd: "/work/project",
    ui,
  } as unknown as ExtensionContext;
  const sessionStart = lifecycle.get("session_start");
  assert.ok(sessionStart);
  sessionStart({}, context);
  assert.ok(headerFactory);
  assert.ok(footerFactory);

  const colorCalls: Array<{ color: string; text: string }> = [];
  const theme = {
    fg(color: string, text: string) {
      colorCalls.push({ color, text });
      return text;
    },
    bold(text: string) {
      return text;
    },
  } as unknown as Theme;
  const tui = {
    children: [],
    invalidate() {},
    render() {
      return [];
    },
    requestRender() {},
  } as unknown as TUI;

  return {
    colorCalls,
    context,
    events,
    footerFactory,
    headerFactory,
    lifecycle,
    theme,
    tui,
    cleanup() {
      lifecycle.get("session_shutdown")?.({}, context);
    },
  };
}

test("keeps the initial masthead height while the terminal resizes", (t) => {
  const compactHarness = createHarness();
  const wideHarness = createHarness();
  t.after(compactHarness.cleanup);
  t.after(wideHarness.cleanup);

  const compactHeader = compactHarness.headerFactory(
    compactHarness.tui,
    compactHarness.theme,
  );
  const compact = compactHeader.render(99);
  assert.equal(compact.length, 1);
  assert.match(compact[0] ?? "", /pi · \/work\/project/);
  assert.doesNotMatch(compact.join("\n"), /██████/);

  compactHeader.invalidate();
  assert.equal(compactHeader.render(100).length, 1);

  const wideHeader = wideHarness.headerFactory(
    wideHarness.tui,
    wideHarness.theme,
  );
  const wide = wideHeader.render(100);
  assert.equal(wide.length, 9);
  assert.match(wide.join("\n"), /██████/);
  assert.doesNotMatch(wide.join("\n"), /\x1b\[38;2;/);

  wideHeader.invalidate();
  assert.equal(wideHeader.render(99).length, 9);
  assert.ok(
    compactHarness.colorCalls.some(
      ({ color, text }) => color === "accent" && text.includes("pi"),
    ),
  );
  assert.ok(
    wideHarness.colorCalls.some(
      ({ color, text }) => color === "muted" && text.includes("██████"),
    ),
  );
  assert.equal(compactHarness.lifecycle.has("resources_discover"), false);
});

test("keeps context and active status ahead of secondary telemetry", (t) => {
  const harness = createHarness();
  t.after(harness.cleanup);

  harness.events.get(MODEL_INFO_CHANNEL)?.({
    provider: "openai-codex",
    modelId: "gpt-5.6-luna",
    modelName: "GPT-5.6 Luna",
    thinking: "max",
    contextTokens: 223_040,
    contextWindow: 272_000,
    contextPercent: 82,
    cost: 1.23,
    tokensPerSecond: 44,
    generating: true,
  });
  harness.events.get(GIT_INFO_CHANNEL)?.({
    isRepository: true,
    branch: "main",
    changedFiles: 4,
    pullRequest: {
      number: 42,
      url: "https://example.com/pull/42",
      isDraft: false,
    },
  });

  const statuses = new Map([["summaries", "✦ summarizing run"]]);
  const footer = harness.footerFactory(harness.tui, harness.theme, {
    getExtensionStatuses() {
      return statuses;
    },
  } as unknown as ReadonlyFooterDataProvider);

  const wide = footer.render(120).join("\n");
  assert.match(wide, /openai-codex\/GPT-5\.6 Luna · thinking max/);
  assert.match(wide, /ctx 82%\/272k · ✦ summarizing run · \$1\.23 · 44 tok\/s/);
  assert.match(wide, /main · .*PR #42.* · 4 files changed/);
  assert.ok(
    harness.colorCalls.some(
      ({ color, text }) => color === "warning" && text === "ctx 82%/272k",
    ),
  );

  footer.invalidate();
  const compact = footer.render(60).join("\n");
  assert.match(compact, /GPT-5\.6 Luna/);
  assert.match(compact, /ctx 82% · ✦ summarizing run/);
  assert.doesNotMatch(compact, /\$1\.23|tok\/s|files changed/);
  assert.ok(
    harness.colorCalls.some(
      ({ color, text }) => color === "muted" && text === "main",
    ),
  );
  assert.ok(
    harness.colorCalls.some(
      ({ color, text }) => color === "accent" && text === "PR #42",
    ),
  );
});

test("preserves complete urgent fields at compact boundaries", (t) => {
  const harness = createHarness();
  t.after(harness.cleanup);

  harness.events.get(MODEL_INFO_CHANNEL)?.({
    provider: "openai-codex",
    modelId: "gpt-5.6-luna",
    modelName: "GPT-5.6 Luna",
    thinking: "max",
    contextTokens: 250_240,
    contextWindow: 272_000,
    contextPercent: 92,
    cost: 0,
    tokensPerSecond: null,
    generating: false,
  });
  harness.events.get(GIT_INFO_CHANNEL)?.({
    isRepository: true,
    branch: "feature/super-long-responsive-footer-name",
    changedFiles: 401,
    pullRequest: {
      number: 42,
      url: "https://example.com/pull/42",
      isDraft: false,
    },
  });

  const footer = harness.footerFactory(harness.tui, harness.theme, {
    getExtensionStatuses() {
      return new Map([["subagents", "■ 1 running"]]);
    },
  } as unknown as ReadonlyFooterDataProvider);

  for (const width of [71, 72]) {
    footer.invalidate();
    const rendered = footer.render(width).join("\n");
    assert.match(rendered, /ctx 92%! · ■ 1 running/);
    assert.match(rendered, /PR #42/);
    assert.doesNotMatch(rendered, /PR #4\.\.\.|401 files|feature\/super/);
  }
  assert.ok(
    harness.colorCalls.some(
      ({ color, text }) => color === "error" && text === "ctx 92%!",
    ),
  );
});
