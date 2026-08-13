// Calm — conversation-only transcript presentation.
//
// /calm toggles calm mode and persists the preference to <config>/calm.
// Calm defaults to OFF, loaded from the preference file on session_start.
// In calm mode, wrapped built-in tools (read/bash/edit/write/grep/find/ls)
// hide their call+result rows, and assistant "thinking" blocks are filtered out.
// /share and /export temporarily reveal everything (export rendering).
// Built-in tools are claimed lazily on first activation, skipping any already
// owned by another extension.

import { randomUUID } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createBashToolDefinition,
  createEditToolDefinition,
  createFindToolDefinition,
  createGrepToolDefinition,
  createLsToolDefinition,
  createReadToolDefinition,
  createWriteToolDefinition,
  type ExtensionAPI,
  type ExtensionUIContext,
  type ToolDefinition,
  type ToolInfo,
  type ToolRenderResultOptions,
} from "@earendil-works/pi-coding-agent";
import {
  Box,
  Container,
  getKeybindings,
  type Component,
} from "@earendil-works/pi-tui";
import { installCalmAssistantLayout } from "./lib/calm-assistant-layout.js";
import {
  calmPresentationHides,
  calmPresentationIsActive,
  CALM_PRESENTATION_EVENT,
  setCalmPresentation,
  setCalmStockExportRendering,
} from "./lib/calm-visibility.js";

// Pi's ToolDefinition is generic over (TParams, TDetails, TState). An array
// holding all seven factories has no single sound instantiation, so — like Pi's
// own consumers — we erase to (any, any, any) here.
type AnyTool = ToolDefinition<any, any, any>;
type DefinitionFactory = (cwd: string) => AnyTool;
type RenderCall = NonNullable<AnyTool["renderCall"]>;
type RenderResult = NonNullable<AnyTool["renderResult"]>;
type RenderArgs = Parameters<RenderCall>[0];
type RenderTheme = Parameters<RenderCall>[1];
type RenderContext = Parameters<RenderCall>[2];
type RenderResultArg = Parameters<RenderResult>[0];

type StandardShellState = {
  shell?: Box;
  call?: Component;
  result?: Component;
};

const extensionFile = fileURLToPath(import.meta.url);
const extensionDir = dirname(extensionFile);
const root = resolve(extensionDir, "../..");

// sourceInfo.path values come from independent path-resolution code paths, and
// macOS alone symlinks /tmp and /var to /private/..., so resolve symlinks before
// comparing tool-ownership identity. Falls back to the raw path for synthetic
// sourceInfo paths that realpathSync rejects.
const realpathOrSelf = (path: string): string => {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
};
const extensionRealFile = realpathOrSelf(extensionFile);

function installCalmPresentationAdapter(
  name: string,
  install: () => void,
): void {
  try {
    install();
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error(
      `Calm: ${name} presentation adapter unavailable, skipping. ${reason}`,
    );
  }
}

export default function calm(pi: ExtensionAPI) {
  installCalmPresentationAdapter("collapsed-thinking", () =>
    installCalmAssistantLayout(pi),
  );

  // True while a /share or /export is rendering, so every wrapped tool renders
  // through its original slots unmodified.
  let exportRendering = false;
  let removeTerminalInputHandler: (() => void) | undefined;

  const calmHome =
    process.env.CALM_HOME || process.env.CALM_ROOT_OVERRIDE || root;
  const configDirectory =
    process.env.CALM_CONFIG_OVERRIDE || resolve(calmHome, "config");
  const calmPreferencePath = resolve(configDirectory, "calm");

  const loadCalmPreference = (): boolean => {
    try {
      return readFileSync(calmPreferencePath, "utf8").trim() === "on";
    } catch {
      return false;
    }
  };

  const persistCalmPreference = (active: boolean): void => {
    mkdirSync(dirname(calmPreferencePath), { recursive: true });
    const temporaryPath = `${calmPreferencePath}.${process.pid}.${randomUUID()}.tmp`;
    try {
      writeFileSync(temporaryPath, active ? "on\n" : "off\n", {
        encoding: "utf8",
        flag: "wx",
        mode: 0o600,
      });
      renameSync(temporaryPath, calmPreferencePath);
    } finally {
      rmSync(temporaryPath, { force: true });
    }
  };

  const publishPresentationState = (): void => {
    pi.events.emit(CALM_PRESENTATION_EVENT, {
      active: calmPresentationIsActive(),
      stockExportRendering: exportRendering,
    });
  };

  // Wrap a built-in tool factory so its call+result rows hide in calm mode.
  // Each call/result is still rendered through the original slots when calm is
  // off or during export rendering. Tools that already render their own shell
  // (renderShell: "self") are left to their own framing.
  function wrapBuiltIn(factory: DefinitionFactory): AnyTool {
    const definitions = new Map<string, AnyTool>();
    const definitionFor = (cwd: string): AnyTool => {
      let definition = definitions.get(cwd);
      if (!definition) {
        definition = factory(cwd);
        definitions.set(cwd, definition);
      }
      return definition;
    };

    const original = definitionFor(process.cwd());
    const originalRenderCall = original.renderCall;
    const originalRenderResult = original.renderResult;
    const originalSelfShell = original.renderShell === "self";

    if (!originalRenderCall || !originalRenderResult) {
      throw new Error(
        `Calm mode requires both render slots for Pi built-in tool ${original.name}`,
      );
    }

    const standardShells = new WeakMap<object, StandardShellState>();

    const shellStateFor = (context: RenderContext): StandardShellState => {
      const rowState = context.state as object;
      let shellState = standardShells.get(rowState);
      if (!shellState) {
        shellState = {};
        standardShells.set(rowState, shellState);
      }
      return shellState;
    };

    const refreshStandardShell = (
      state: StandardShellState,
      theme: RenderTheme,
      context: RenderContext,
    ): Box => {
      const background = context.isPartial
        ? (text: string) => theme.bg("toolPendingBg", text)
        : context.isError
          ? (text: string) => theme.bg("toolErrorBg", text)
          : (text: string) => theme.bg("toolSuccessBg", text);

      const shell = state.shell ?? new Box(1, 1, background);
      state.shell = shell;
      shell.setBgFn(background);
      shell.clear();
      if (state.call) shell.addChild(state.call);
      if (state.result) shell.addChild(state.result);
      return shell;
    };

    return {
      ...original,
      renderShell: "self",
      async execute(toolCallId, params, signal, onUpdate, ctx) {
        return definitionFor(ctx.cwd).execute(
          toolCallId,
          params,
          signal,
          onUpdate,
          ctx,
        );
      },
      renderCall(args: RenderArgs, theme: RenderTheme, context: RenderContext) {
        if (exportRendering) return originalRenderCall(args, theme, context);
        if (calmPresentationHides("assistant-tool-call"))
          return new Container();
        if (originalSelfShell) return originalRenderCall(args, theme, context);
        const state = shellStateFor(context);
        state.call = originalRenderCall(args, theme, {
          ...context,
          lastComponent: state.call,
        });
        return refreshStandardShell(state, theme, context);
      },
      renderResult(
        result: RenderResultArg,
        options: ToolRenderResultOptions,
        theme: RenderTheme,
        context: RenderContext,
      ) {
        if (exportRendering)
          return originalRenderResult(result, options, theme, context);
        if (calmPresentationHides("tool-result")) return new Container();
        if (originalSelfShell)
          return originalRenderResult(result, options, theme, context);
        const state = shellStateFor(context);
        state.result = originalRenderResult(result, options, theme, {
          ...context,
          lastComponent: state.result,
        });
        refreshStandardShell(state, theme, context);
        return new Container();
      },
    };
  }

  const wrappedBuiltIns: AnyTool[] = [
    wrapBuiltIn(createReadToolDefinition),
    wrapBuiltIn(createBashToolDefinition),
    wrapBuiltIn(createEditToolDefinition),
    wrapBuiltIn(createWriteToolDefinition),
    wrapBuiltIn(createGrepToolDefinition),
    wrapBuiltIn(createFindToolDefinition),
    wrapBuiltIn(createLsToolDefinition),
  ];

  // True once this extension has handled built-in registration for its lifetime:
  // either all seven synchronously at load (if calm was already on), or only the
  // uncontested subset during first activation.
  let builtInsRegistered = false;

  if (loadCalmPreference()) {
    for (const tool of wrappedBuiltIns) pi.registerTool(tool);
    builtInsRegistered = true;
  }

  // Which of the 7 built-ins are currently owned by a different extension. Only
  // safe once every extension has finished loading; never call during the
  // factory's own synchronous execution.
  function contestedBuiltIns(): AnyTool[] {
    let registered: ToolInfo[];
    try {
      registered = pi.getAllTools();
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      console.error(
        `Calm: built-in ownership check unavailable, claiming every built-in unconditionally. ${reason}`,
      );
      return [];
    }
    return wrappedBuiltIns.filter((tool) => {
      const owner = registered.find(
        (info) => info.name === tool.name,
      )?.sourceInfo;
      return (
        owner !== undefined &&
        owner.source !== "builtin" &&
        realpathOrSelf(owner.path) !== extensionRealFile
      );
    });
  }

  // First time calm turns on in a session that started off: claim every
  // uncontested built-in and leave contested tools to their owning extension.
  function activateBuiltInsIfNeeded(ui: ExtensionUIContext): void {
    if (builtInsRegistered) return;
    const contested = contestedBuiltIns();
    const contestedNames = new Set(contested.map((tool) => tool.name));
    for (const tool of wrappedBuiltIns) {
      if (!contestedNames.has(tool.name)) pi.registerTool(tool);
    }
    builtInsRegistered = true;
    if (contested.length === 0) return;
    const names = contested.map((tool) => `"${tool.name}"`).join(", ");
    const plural = contested.length > 1;
    ui.notify(
      `Calm: the ${names} built-in tool${plural ? "s are" : " is"} already provided by another extension, so Calm may not fully function for ${plural ? "them" : "it"} this session.`,
      "warning",
    );
    for (const tool of contested) {
      console.error(
        `Calm: skipped claiming built-in "${tool.name}" because another extension already owns it.`,
      );
    }
  }

  // Backstop: calm registered unconditionally at load because it was already on,
  // without a foreign-claim check. Report any built-in it silently lost.
  function reportBuiltInLosses(): void {
    if (!builtInsRegistered) return;
    let registered: ToolInfo[];
    try {
      registered = pi.getAllTools();
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      console.error(`Calm: built-in ownership check unavailable. ${reason}`);
      return;
    }
    for (const tool of wrappedBuiltIns) {
      const owner = registered.find(
        (info) => info.name === tool.name,
      )?.sourceInfo;
      if (
        owner &&
        owner.source !== "builtin" &&
        realpathOrSelf(owner.path) !== extensionRealFile
      ) {
        console.error(
          `Calm: another extension (${owner.path}) also claimed the built-in "${tool.name}" tool and won; Calm's presentation for it is unavailable this session.`,
        );
      }
    }
  }

  pi.on("session_start", (_event, ctx) => {
    reportBuiltInLosses();
    exportRendering = false;
    setCalmPresentation(loadCalmPreference());
    setCalmStockExportRendering(false);
    publishPresentationState();
    ctx.ui.setWorkingVisible(true);
    ctx.ui.setHiddenThinkingLabel(calmPresentationIsActive() ? "" : undefined);
    ctx.ui.setStatus("calm", undefined);
    removeTerminalInputHandler?.();
    removeTerminalInputHandler = ctx.ui.onTerminalInput((data) => {
      if (!getKeybindings().matches(data, "tui.input.submit")) return;
      const input = ctx.ui.getEditorText().trim();
      if (
        input !== "/share" &&
        input !== "/export" &&
        !input.startsWith("/export ")
      ) {
        return;
      }
      exportRendering = true;
      setCalmStockExportRendering(true);
      publishPresentationState();
      setTimeout(() => {
        exportRendering = false;
        setCalmStockExportRendering(false);
        publishPresentationState();
        const expanded = ctx.ui.getToolsExpanded();
        ctx.ui.setToolsExpanded(!expanded);
        ctx.ui.setToolsExpanded(expanded);
      }, 0);
    });
  });

  pi.on("session_shutdown", (_event, ctx) => {
    ctx.ui.setWorkingVisible(true);
  });

  pi.registerCommand("calm", {
    description: "Toggle conversation-only transcript presentation",
    handler: async (_args, ctx) => {
      const active = !calmPresentationIsActive();
      persistCalmPreference(active);
      setCalmPresentation(active);
      if (active) activateBuiltInsIfNeeded(ctx.ui);
      publishPresentationState();
      ctx.ui.setWorkingVisible(true);
      ctx.ui.setHiddenThinkingLabel(active ? "" : undefined);
      ctx.ui.setStatus("calm", undefined);
      const expanded = ctx.ui.getToolsExpanded();
      ctx.ui.setToolsExpanded(!expanded);
      ctx.ui.setToolsExpanded(expanded);
      ctx.ui.notify(
        active ? "Calm view enabled" : "Calm view disabled",
        "info",
      );
    },
  });
}
