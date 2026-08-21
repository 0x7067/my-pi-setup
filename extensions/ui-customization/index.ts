import { homedir } from "node:os";
import { relative } from "node:path";
import type {
  ExtensionAPI,
  ExtensionContext,
  ReadonlyFooterDataProvider,
  Theme,
} from "@earendil-works/pi-coding-agent";
import {
  getCapabilities,
  hyperlink,
  truncateToWidth,
  visibleWidth,
} from "@earendil-works/pi-tui";
import {
  emptyGitInfoState,
  emptyModelInfoState,
  GIT_INFO_CHANNEL,
  MODEL_INFO_CHANNEL,
  REFRESH_CHANNEL,
  isGitInfoState,
  isModelInfoState,
} from "../shared/dashboard-state.ts";

interface FooterPart {
  text: string;
  priority: number;
  order: number;
}

const FULL_MASTHEAD_MIN_WIDTH = 100;
const COMPACT_FOOTER_MAX_WIDTH = 71;
const WIDE_FOOTER_MIN_WIDTH = 100;
const TITLE_LINES = [
  "██████╗  ██╗",
  "██╔══██╗ ██║",
  "██████╔╝ ██║",
  "██╔═══╝  ██║",
  "██║      ██║",
  "╚═╝      ╚═╝",
];
// eslint-disable-next-line no-control-regex
const OSC_PATTERN =
  /(?:\u001b\]|\u009d)(?:[^\u0007\u001b\u009c]|\u001b(?!\\))*(?:\u0007|\u001b\\|\u009c)/g;
// eslint-disable-next-line no-control-regex
const CSI_PATTERN = /(?:\u001b\[|\u009b)[0-?]*[ -/]*[@-~]/g;
// eslint-disable-next-line no-control-regex
const ESCAPE_PATTERN = /\u001b(?:[()][0-2A-Z]|[ -/]*[@-~])/g;

function sanitizeTerminalLabel(text: string) {
  return text
    .replace(OSC_PATTERN, "")
    .replace(CSI_PATTERN, "")
    .replace(ESCAPE_PATTERN, "")
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, "");
}

function formatTokens(tokens: number) {
  if (tokens < 1_000) return `${tokens}`;
  if (tokens < 1_000_000) return `${Math.round(tokens / 1_000)}k`;
  return `${(tokens / 1_000_000).toFixed(1)}m`;
}

function formatDirectory(cwd: string) {
  const home = homedir();
  if (cwd === home) return "~";
  const display = cwd.startsWith(`${home}/`) ? `~/${relative(home, cwd)}` : cwd;
  return sanitizeTerminalLabel(display);
}

function columns(left: string, right: string, width: number, leftShare = 0.45) {
  if (!right) return truncateToWidth(left, width);

  const naturalGap = width - visibleWidth(left) - visibleWidth(right);
  if (naturalGap >= 1) return `${left}${" ".repeat(naturalGap)}${right}`;

  const leftWidth = Math.max(1, Math.floor(width * leftShare));
  const rightWidth = Math.max(1, width - leftWidth - 1);
  const fittedLeft = truncateToWidth(left, leftWidth);
  const fittedRight = truncateToWidth(right, rightWidth);
  const gap = Math.max(
    1,
    width - visibleWidth(fittedLeft) - visibleWidth(fittedRight),
  );
  return truncateToWidth(
    `${fittedLeft}${" ".repeat(gap)}${fittedRight}`,
    width,
  );
}

function joinParts(theme: Theme, parts: string[]) {
  return parts.filter(Boolean).join(theme.fg("dim", " · "));
}

function columnWidths(width: number, leftShare: number) {
  const left = Math.max(1, Math.floor(width * leftShare));
  return { left, right: Math.max(1, width - left - 1) };
}

function fitPriorityParts(theme: Theme, parts: FooterPart[], width: number) {
  let selected: FooterPart[] = [];

  for (const part of [...parts].sort(
    (left, right) => right.priority - left.priority || left.order - right.order,
  )) {
    if (!part.text) continue;
    const candidate = [...selected, part].sort(
      (left, right) => left.order - right.order,
    );
    if (
      visibleWidth(
        joinParts(
          theme,
          candidate.map(({ text }) => text),
        ),
      ) <= width
    ) {
      selected = candidate;
    }
  }

  return joinParts(
    theme,
    selected.map(({ text }) => text),
  );
}

function sameStatuses(
  previous: ReadonlyMap<string, string>,
  current: ReadonlyMap<string, string>,
) {
  if (previous.size !== current.size) return false;
  for (const [key, value] of current) {
    if (previous.get(key) !== value) return false;
  }
  return true;
}

export default function uiCustomization(pi: ExtensionAPI) {
  let title = "pi";
  let modelInfo = emptyModelInfoState();
  let gitInfo = emptyGitInfoState();
  let requestRender: (() => void) | undefined;

  const stopModelListener = pi.events.on(MODEL_INFO_CHANNEL, (value) => {
    if (!isModelInfoState(value)) return;
    modelInfo = value;
    requestRender?.();
  });

  const stopGitListener = pi.events.on(GIT_INFO_CHANNEL, (value) => {
    if (!isGitInfoState(value)) return;
    gitInfo = value;
    requestRender?.();
  });

  function install(ctx: ExtensionContext) {
    if (ctx.mode !== "tui") return;

    const directoryLabel = formatDirectory(ctx.cwd);

    ctx.ui.setHeader((tui, theme) => {
      requestRender = () => tui.requestRender();

      let cachedWidth: number | undefined;
      let cachedLines: string[] | undefined;
      let showFullMasthead: boolean | undefined;

      return {
        render(width: number) {
          if (cachedWidth === width && cachedLines) return cachedLines;

          const masthead = columns(
            `${theme.fg("accent", theme.bold("pi"))}${theme.fg("dim", " · ")}${theme.fg("text", title)}`,
            theme.fg("dim", "session · interactive"),
            width,
          );
          cachedWidth = width;
          showFullMasthead ??= width >= FULL_MASTHEAD_MIN_WIDTH;
          if (!showFullMasthead) {
            cachedLines = [masthead];
            return cachedLines;
          }

          const art = TITLE_LINES.map((line, row) => {
            const color =
              row === 0 || row === TITLE_LINES.length - 1 ? "muted" : "accent";
            return truncateToWidth(
              `  ${theme.fg(color, theme.bold(line))}`,
              width,
            );
          });
          cachedLines = [masthead, "", ...art, ""];
          return cachedLines;
        },
        invalidate() {
          cachedWidth = undefined;
          cachedLines = undefined;
        },
      };
    });

    ctx.ui.setFooter((tui, theme, footerData: ReadonlyFooterDataProvider) => {
      requestRender = () => tui.requestRender();

      const directory = theme.fg("text", directoryLabel);
      let cached:
        | {
            width: number;
            modelInfo: typeof modelInfo;
            gitInfo: typeof gitInfo;
            statuses: ReadonlyMap<string, string>;
            lines: string[];
          }
        | undefined;

      return {
        invalidate() {
          cached = undefined;
        },
        render(width: number) {
          const compact = width <= COMPACT_FOOTER_MAX_WIDTH;
          const wide = width >= WIDE_FOOTER_MIN_WIDTH;
          const rowWidths = columnWidths(width, 0.65);
          const statuses = footerData.getExtensionStatuses();
          if (
            cached?.width === width &&
            cached.modelInfo === modelInfo &&
            cached.gitInfo === gitInfo &&
            sameStatuses(cached.statuses, statuses)
          ) {
            return cached.lines;
          }

          const gitParts: FooterPart[] = [];
          if (gitInfo.isRepository && gitInfo.pullRequest) {
            const prLabel = `PR #${gitInfo.pullRequest.number}`;
            const styledPr = theme.fg("accent", prLabel);
            const linkedPr = getCapabilities().hyperlinks
              ? hyperlink(styledPr, gitInfo.pullRequest.url)
              : styledPr;
            gitParts.push({ text: linkedPr, priority: 100, order: 1 });
          }
          if (gitInfo.isRepository) {
            gitParts.push({
              text: theme.fg("muted", gitInfo.branch ?? "detached"),
              priority: 90,
              order: 0,
            });
          }
          if (gitInfo.isRepository && !compact) {
            const fileLabel = gitInfo.changedFiles === 1 ? "file" : "files";
            gitParts.push({
              text: theme.fg(
                "muted",
                `${gitInfo.changedFiles} ${fileLabel} changed`,
              ),
              priority: 10,
              order: 2,
            });
          }
          const git = gitInfo.isRepository
            ? fitPriorityParts(theme, gitParts, rowWidths.right)
            : compact
              ? ""
              : theme.fg("dim", "not a repo");

          const contextPercent =
            modelInfo.contextPercent === null
              ? null
              : Math.round(modelInfo.contextPercent);
          const contextWindow =
            modelInfo.contextWindow > 0
              ? formatTokens(modelInfo.contextWindow)
              : null;
          const context =
            contextPercent === null
              ? ""
              : theme.fg(
                  contextPercent >= 90
                    ? "error"
                    : contextPercent >= 75
                      ? "warning"
                      : "muted",
                  wide && contextWindow
                    ? `ctx ${contextPercent}%/${contextWindow}${contextPercent >= 90 ? "!" : ""}`
                    : `ctx ${contextPercent}%${contextPercent >= 90 ? "!" : ""}`,
                );

          const modelName = modelInfo.modelName || modelInfo.modelId;
          const model = modelInfo.provider
            ? compact
              ? modelName
              : wide
                ? `${modelInfo.provider}/${modelName} · thinking ${modelInfo.thinking}`
                : `${modelName} · thinking ${modelInfo.thinking}`
            : "model unavailable";

          // Keep the footer at the same two-row height as Pi's startup footer.
          // Active extension statuses lead the operational row. Secondary
          // telemetry drops away before anything actionable is truncated.
          const statusParts = Array.from(statuses.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .flatMap(([, text]) => text.split("\n"))
            .map(sanitizeTerminalLabel)
            .filter(Boolean);
          const displayedStatuses =
            compact && statusParts.length > 1
              ? [`${statusParts.length} active`]
              : statusParts;
          const operationalParts: FooterPart[] = [];
          if (context) {
            operationalParts.push({ text: context, priority: 100, order: 0 });
          }
          for (const [index, status] of displayedStatuses.entries()) {
            operationalParts.push({
              text: theme.fg("text", status),
              priority: 80 - index,
              order: index + 1,
            });
          }
          if (wide) {
            if (modelInfo.cost > 0) {
              operationalParts.push({
                text: theme.fg("muted", `$${modelInfo.cost.toFixed(2)}`),
                priority: 20,
                order: operationalParts.length,
              });
            }
            if (modelInfo.generating) {
              operationalParts.push({
                text: theme.fg(
                  "muted",
                  modelInfo.tokensPerSecond === null
                    ? "generating"
                    : `${Math.round(modelInfo.tokensPerSecond)} tok/s`,
                ),
                priority: 30,
                order: operationalParts.length,
              });
            }
          }
          const operational = fitPriorityParts(
            theme,
            operationalParts,
            rowWidths.left,
          );

          const lines = [
            columns(directory, theme.fg("muted", model), width),
            columns(operational, git, width, 0.65),
          ];
          cached = {
            width,
            modelInfo,
            gitInfo,
            statuses: new Map(statuses),
            lines,
          };
          return lines;
        },
      };
    });

    ctx.ui.setTitle(`pi · ${title}`);
    pi.events.emit(REFRESH_CHANNEL, undefined);
  }

  pi.on("session_start", (_event, ctx) => {
    title = formatDirectory(ctx.cwd);
    modelInfo = emptyModelInfoState();
    gitInfo = emptyGitInfoState();
    install(ctx);
  });

  pi.on("session_shutdown", (_event, ctx) => {
    stopModelListener();
    stopGitListener();
    requestRender = undefined;
    if (ctx.mode === "tui") {
      ctx.ui.setHeader(undefined);
      ctx.ui.setFooter(undefined);
    }
  });
}
