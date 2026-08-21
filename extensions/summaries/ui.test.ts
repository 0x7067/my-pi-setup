import assert from "node:assert/strict";
import test from "node:test";
import { initTheme, type Theme } from "@earendil-works/pi-coding-agent";
import { renderRecap } from "./src/ui.ts";

initTheme();

const theme = {
  bg: (_color: string, text: string) => text,
  bold: (text: string) => text,
  fg: (_color: string, text: string) => text,
} as unknown as Theme;

test("expanded recap keeps all information in a balanced seven-row card", () => {
  const card = renderRecap(
    {
      recap: "- First\n- Second\n- Third",
      next: "Continue",
      provider: "openai-codex",
      model: "gpt-5.6-luna",
      reasoning: "medium",
    },
    true,
    theme,
  );

  const lines = card.render(100);
  const rendered = lines.join("\n");

  assert.equal(lines.length, 7);
  assert.match(rendered, /Run recap · openai-codex\/gpt-5\.6-luna · medium/);
  assert.match(rendered, /First/);
  assert.match(rendered, /Next: Continue/);
});
