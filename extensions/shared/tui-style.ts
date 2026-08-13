import type { Theme } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

export interface ActionHint {
  key: string;
  label: string;
}

export function renderActionHints(
  theme: Theme,
  actions: readonly ActionHint[],
  prefix = "  ",
) {
  return (
    prefix +
    actions
      .map(
        ({ key, label }) =>
          theme.fg("accent", key) + theme.fg("dim", ` ${label}`),
      )
      .join(theme.fg("dim", " · "))
  );
}

export function highlightRow(
  theme: Theme,
  text: string,
  width: number,
  active: boolean,
) {
  const truncated = truncateToWidth(text, width);
  const row = `${truncated}${" ".repeat(Math.max(0, width - visibleWidth(truncated)))}`;
  return active ? theme.bg("selectedBg", row) : truncated;
}
