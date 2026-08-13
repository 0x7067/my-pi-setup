#!/usr/bin/env bash
set -euo pipefail

study_dir="agent/docs/specs/2026-08-12-deep-space-theme"
scratch="$study_dir/scratch"
context="$scratch/context.md"
model="claude-opus-4-8"

pen --out "$scratch/pen-v1.pen" \
  --prompt "Variation 1 only: create the canvas masthead and palette legend, then add Signal Deck exactly as briefed. It is the provisional recommendation, must include the dark board and bright-ambient accessibility companion, the Pi Stats loading geometry, and no-model state. Show all nine numbered representative views and put tradeoff/citations on canvas." \
  --prompt-file "$context" --model "$model" \
  --export "$scratch/pen-v1.png" --export-scale 2

pen --in "$scratch/pen-v1.pen" --out "$scratch/pen-v2.pen" \
  --prompt "Variation 2 only: add Observatory Rail beside existing work exactly as briefed. Preserve the masthead and Signal Deck. Show all nine numbered representative views, emphasize operations and workflows, include unavailable telemetry and killed/failed states, and add tradeoff/citations on canvas." \
  --prompt-file "$context" --model "$model"

pen --in "$scratch/pen-v2.pen" --out "$scratch/pen-v3.pen" \
  --prompt "Variation 3 only: add Black Box Transcript beside existing work exactly as briefed. Preserve all prior work. Show all nine numbered representative views, emphasize transcript and workflow continuity, include empty search/no subagents/collapsed-expanded states, and add tradeoff/citations on canvas." \
  --prompt-file "$context" --model "$model"

pen --in "$scratch/pen-v3.pen" --out "$scratch/pen-v4.pen" \
  --prompt "Variation 4 only: add Flight Director beside existing work exactly as briefed. Preserve all prior work. Show all nine numbered representative views, emphasize dense operations/workflow/diff/stats panes, include live-tail/paused, focus-switch, running/error and malformed states, and add tradeoff/citations on canvas." \
  --prompt-file "$context" --model "$model"

pen --in "$scratch/pen-v4.pen" --out "$study_dir/pi-deep-space-theme-variations.pen" \
  --prompt "Variation 5 only: add Event Horizon Focus beside existing work exactly as briefed. Preserve all prior work. Show all nine numbered representative views, emphasize Ask User and changed-files focus, include custom answer, destructive/error and static reduced-motion states, and add tradeoff/citations on canvas. Finish the whole-set feedback area without removing any variation." \
  --prompt-file "$context" --model "$model" \
  --export "$study_dir/pi-deep-space-theme-variations.png" --export-scale 2
