import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";

const INTERVAL_MS = 140;
const DEFAULT_MESSAGE = "Assembling…";
const CSI_PATTERN = /(?:\u001b\[|\u009b)[0-?]*[ -/]*[@-~]/g;

type Theme = Pick<ExtensionContext["ui"]["theme"], "fg">;

export function coalesceFrames(theme: Theme, reducedMotion: boolean) {
  if (reducedMotion) return [theme.fg("accent", "●")];

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

export default function generativeStatus(pi: ExtensionAPI) {
  const activeTools = new Map<string, string>();

  pi.on("session_start", (_event, ctx) => {
    if (ctx.mode !== "tui") return;

    const reducedMotion = process.env.PI_REDUCED_MOTION === "1";
    ctx.ui.setWorkingIndicator({
      frames: coalesceFrames(ctx.ui.theme, reducedMotion),
      intervalMs: INTERVAL_MS,
    });
    ctx.ui.setWorkingMessage(DEFAULT_MESSAGE);
  });

  pi.on("agent_start", (_event, ctx) => {
    activeTools.clear();
    if (ctx.mode === "tui") ctx.ui.setWorkingMessage(DEFAULT_MESSAGE);
  });

  pi.on("tool_execution_start", (event, ctx) => {
    activeTools.set(event.toolCallId, event.toolName);
    if (ctx.mode === "tui")
      ctx.ui.setWorkingMessage(toolMessage(event.toolName));
  });

  pi.on("tool_execution_end", (event, ctx) => {
    activeTools.delete(event.toolCallId);
    if (ctx.mode !== "tui") return;

    const currentTool = Array.from(activeTools.values()).at(-1);
    ctx.ui.setWorkingMessage(
      currentTool ? toolMessage(currentTool) : DEFAULT_MESSAGE,
    );
  });

  pi.on("session_shutdown", (_event, ctx) => {
    activeTools.clear();
    if (ctx.mode !== "tui") return;
    ctx.ui.setWorkingIndicator();
    ctx.ui.setWorkingMessage();
  });
}
