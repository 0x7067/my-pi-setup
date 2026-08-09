import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";

const INTERVAL_MS = 140;
const DEFAULT_MESSAGE = "Assembling…";
const CSI_PATTERN = /(?:\u001b\[|\u009b)[0-?]*[ -/]*[@-~]/g;

type Theme = Pick<ExtensionContext["ui"]["theme"], "fg">;
export type LoaderPhase = "thinking" | "tool";
export type LoaderStyle =
  "choreography" | "coalesce" | "signal" | "orbit" | "static" | "default";

const STYLE_CHOICES = [
  {
    label: "Choreography — coalesce thinking, signal tools",
    style: "choreography",
  },
  { label: "Coalesce — gather into a solid point", style: "coalesce" },
  { label: "Signal — rise and fall", style: "signal" },
  { label: "Orbit — rotate around the work", style: "orbit" },
  { label: "Static — no motion", style: "static" },
  { label: "Pi default — restore the built-in spinner", style: "default" },
] as const satisfies ReadonlyArray<{ label: string; style: LoaderStyle }>;

export function styleChoices(currentStyle: LoaderStyle) {
  return [
    ...STYLE_CHOICES.filter(({ style }) => style === currentStyle),
    ...STYLE_CHOICES.filter(({ style }) => style !== currentStyle),
  ];
}

export function parseLoaderStyle(value: string | undefined): LoaderStyle {
  switch (value) {
    case "choreography":
    case "coalesce":
    case "signal":
    case "orbit":
    case "static":
    case "default":
      return value;
    default:
      return "choreography";
  }
}

export function loaderFrames(
  theme: Theme,
  style: LoaderStyle,
  phase: LoaderPhase,
  reducedMotion: boolean,
) {
  if (reducedMotion || style === "static") {
    return [theme.fg("accent", "●")];
  }

  const resolvedStyle =
    style === "choreography"
      ? phase === "tool"
        ? "signal"
        : "coalesce"
      : style;

  if (resolvedStyle === "default") return undefined;

  if (resolvedStyle === "signal") {
    return ["▁", "▃", "▅", "▇", "▅", "▃"].map((frame) =>
      theme.fg("accent", frame),
    );
  }

  if (resolvedStyle === "orbit") {
    return ["◜", "◝", "◞", "◟"].map((frame) => theme.fg("accent", frame));
  }

  return [
    theme.fg("muted", "·"),
    theme.fg("accent", "∙"),
    theme.fg("accent", "●"),
    theme.fg("accent", "∙"),
  ];
}

export function toolMessage(toolName: string) {
  const label = toolName
    .replace(CSI_PATTERN, "")
    .replace(/[^a-zA-Z0-9./: _-]+/g, "")
    .replace(/[_-]+/g, " ")
    .trim();
  return label ? `Using ${label}…` : "Using a tool…";
}

function applyState(
  ctx: ExtensionContext,
  style: LoaderStyle,
  phase: LoaderPhase,
  toolName: string | undefined,
  reducedMotion: boolean,
) {
  const frames = loaderFrames(ctx.ui.theme, style, phase, reducedMotion);
  ctx.ui.setWorkingIndicator(
    frames ? { frames, intervalMs: INTERVAL_MS } : undefined,
  );
  ctx.ui.setWorkingMessage(
    style === "default"
      ? undefined
      : toolName
        ? toolMessage(toolName)
        : DEFAULT_MESSAGE,
  );
}

export default function generativeStatus(pi: ExtensionAPI) {
  const activeTools = new Map<string, string>();
  const reducedMotion = process.env.PI_REDUCED_MOTION === "1";
  let style = parseLoaderStyle(process.env.PI_LOADER_STYLE);

  pi.on("session_start", (_event, ctx) => {
    if (ctx.mode !== "tui") return;
    applyState(ctx, style, "thinking", undefined, reducedMotion);
  });

  pi.on("agent_start", (_event, ctx) => {
    activeTools.clear();
    if (ctx.mode === "tui")
      applyState(ctx, style, "thinking", undefined, reducedMotion);
  });

  pi.on("tool_execution_start", (event, ctx) => {
    activeTools.set(event.toolCallId, event.toolName);
    if (ctx.mode === "tui")
      applyState(ctx, style, "tool", event.toolName, reducedMotion);
  });

  pi.on("tool_execution_end", (event, ctx) => {
    activeTools.delete(event.toolCallId);
    if (ctx.mode !== "tui") return;

    const currentTool = Array.from(activeTools.values()).at(-1);
    applyState(
      ctx,
      style,
      currentTool ? "tool" : "thinking",
      currentTool,
      reducedMotion,
    );
  });

  pi.on("agent_settled", () => {
    activeTools.clear();
  });

  pi.registerCommand("loader", {
    description: "Choose the generative working animation",
    handler: async (_args, ctx) => {
      if (ctx.mode !== "tui") {
        ctx.ui.notify(
          "The loader picker requires the interactive TUI.",
          "warning",
        );
        return;
      }

      const choices = styleChoices(style);
      const choice = await ctx.ui.select(
        "Generative loader",
        choices.map(({ label }) => label),
      );
      const selected = choices.find(({ label }) => label === choice);
      if (!selected) return;

      style = selected.style;
      const currentTool = Array.from(activeTools.values()).at(-1);
      applyState(
        ctx,
        style,
        currentTool ? "tool" : "thinking",
        currentTool,
        reducedMotion,
      );
      ctx.ui.notify(`Loader: ${selected.label}`, "info");
    },
  });

  pi.on("session_shutdown", (_event, ctx) => {
    activeTools.clear();
    if (ctx.mode !== "tui") return;
    ctx.ui.setWorkingIndicator();
    ctx.ui.setWorkingMessage();
  });
}
