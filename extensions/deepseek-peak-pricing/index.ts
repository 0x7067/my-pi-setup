/**
 * DeepSeek peak-pricing indicator, adapted from
 * deepseek-peak-pricing-hours@0.1.1 under the MIT license.
 */

import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

interface PeakWindow {
  startHour: number;
  endHour: number;
}

const PEAK_WINDOWS: PeakWindow[] = [
  { startHour: 9, endHour: 12 },
  { startHour: 14, endHour: 18 },
];

const BLOCK_FULL = "█";
const BLOCK_OFF = "░";
const BLOCK_CURRENT = "▓";
const WIDGET_KEY = "deepseek-bar";

interface PeakInfo {
  isPeak: boolean;
  currentHour: number;
  label: string;
  nextTransition: string;
}

function getBeijingNow() {
  const now = new Date();
  return {
    hour: (now.getUTCHours() + 8) % 24,
    minute: now.getUTCMinutes(),
  };
}

function isPeakHour(hour: number) {
  return PEAK_WINDOWS.some(
    (window) => hour >= window.startHour && hour < window.endHour,
  );
}

function beijingHourToLocal(hour: number) {
  const now = new Date();
  const beijingNow = getBeijingNow();
  const utcHour = (hour - 8 + 24) % 24;
  let target = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      utcHour,
    ),
  );

  const targetHour = (target.getUTCHours() + 8) % 24;
  if (targetHour < beijingNow.hour || targetHour === beijingNow.hour) {
    target = new Date(target.getTime() + 24 * 60 * 60 * 1_000);
  }
  return target;
}

function formatLocalTime(date: Date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function getPeakInfo(): PeakInfo {
  const { hour } = getBeijingNow();
  const isPeak = isPeakHour(hour);
  let transitionHour: number;

  if (isPeak) {
    transitionHour = PEAK_WINDOWS.find(
      (window) => hour >= window.startHour && hour < window.endHour,
    )!.endHour;
  } else {
    transitionHour =
      PEAK_WINDOWS.find((window) => window.startHour > hour)?.startHour ??
      PEAK_WINDOWS[0]!.startHour;
  }

  return {
    isPeak,
    currentHour: hour,
    label: isPeak ? "PEAK" : "Off-Peak",
    nextTransition: `${isPeak ? "until" : "next"} ${formatLocalTime(beijingHourToLocal(transitionHour))}`,
  };
}

function renderBar(info: PeakInfo, width: number) {
  const hours = Array.from({ length: 24 }, (_, hour) => ({
    isPeak: isPeakHour(hour),
    isCurrent: hour === info.currentHour,
  }));

  if (width >= 26) {
    return `[${hours
      .map((hour) =>
        hour.isCurrent ? BLOCK_CURRENT : hour.isPeak ? BLOCK_FULL : BLOCK_OFF,
      )
      .join("")}]`;
  }
  if (width >= 14) {
    const merged: string[] = [];
    for (let index = 0; index < hours.length; index += 2) {
      const first = hours[index]!;
      const second = hours[index + 1]!;
      merged.push(
        first.isCurrent || second.isCurrent
          ? BLOCK_CURRENT
          : first.isPeak || second.isPeak
            ? BLOCK_FULL
            : BLOCK_OFF,
      );
    }
    return `[${merged.join("")}]`;
  }
  return "";
}

export default function deepseekPeakPricing(pi: ExtensionAPI) {
  let refreshTimer: ReturnType<typeof setInterval> | undefined;
  let widgetActive = false;

  function stopTimer() {
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = undefined;
  }

  function showWidget(ctx: ExtensionContext) {
    widgetActive = true;
    ctx.ui.setWidget(
      WIDGET_KEY,
      (tui, theme) => {
        stopTimer();
        refreshTimer = setInterval(() => tui.requestRender(), 30_000);
        return {
          invalidate() {},
          render(width: number) {
            const info = getPeakInfo();
            const dotColor = info.isPeak ? "error" : "success";
            const dot = theme.fg(dotColor, "●");
            const label = theme.fg(
              dotColor,
              theme.bold(` DeepSeek ${info.label} `),
            );
            const transition = theme.fg("dim", ` ${info.nextTransition} local`);
            const available = Math.max(
              0,
              width - visibleWidth(dot + label + transition),
            );
            const bar = renderBar(info, Math.min(48, available))
              .split("")
              .map((character) => {
                if (character === BLOCK_CURRENT)
                  return theme.fg("accent", character);
                if (character === BLOCK_FULL)
                  return theme.fg("muted", character);
                return theme.fg("dim", character);
              })
              .join("");

            const line = truncateToWidth(
              dot + label + bar + transition,
              width,
              "",
            );
            return [line];
          },
        };
      },
      { placement: "belowEditor" },
    );
  }

  function hideWidget(ctx: ExtensionContext) {
    widgetActive = false;
    ctx.ui.setWidget(WIDGET_KEY, undefined);
    stopTimer();
  }

  pi.registerCommand("ds-peak", {
    description: "Toggle DeepSeek peak pricing indicator",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) {
        const info = getPeakInfo();
        console.log(
          `DeepSeek peak pricing: ${info.isPeak ? "PEAK NOW" : "Off-Peak"} (${info.nextTransition} local)`,
        );
        return;
      }
      if (widgetActive) {
        hideWidget(ctx);
        ctx.ui.notify("DeepSeek peak indicator hidden", "info");
      } else {
        showWidget(ctx);
        ctx.ui.notify("DeepSeek peak indicator shown", "info");
      }
    },
  });

  pi.on("session_start", (_event, ctx) => {
    stopTimer();
    if (ctx.hasUI) showWidget(ctx);
  });

  pi.on("session_shutdown", stopTimer);
}
