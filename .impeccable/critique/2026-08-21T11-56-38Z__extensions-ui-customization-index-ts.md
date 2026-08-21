---
target: main Pi TUI
total_score: 21
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
timestamp: 2026-08-21T11-56-38Z
slug: extensions-ui-customization-index-ts
---
## Design health score

| # | Heuristic | Score | Key issue |
|---|---|---:|---|
| 1 | Visibility of system status | 3 | Live model, git, and extension updates work, but unknown and stale states are vague. |
| 2 | Match with the real world | 2 | Paths and branches read naturally; `%/window`, `tok/s`, and thinking levels need interpretation. |
| 3 | User control and freedom | 2 | No compact mode or field visibility control; theme discovery is removed from startup. |
| 4 | Consistency and standards | 2 | The header uses fixed ANSI colors while the footer and neighboring UI use theme roles. |
| 5 | Error prevention | 3 | Sanitization, width truncation, capability checks, and fixed height protect the layout. |
| 6 | Recognition rather than recall | 2 | Several telemetry values depend on remembered abbreviations and conventions. |
| 7 | Flexibility and efficiency | 2 | The host is keyboard-driven, but this status surface is fixed and not configurable. |
| 8 | Aesthetic and minimalist design | 2 | It is coherent on Oxocarbon, but the permanent masthead and dense footer compete with the editor. |
| 9 | Error recovery | 2 | Safe placeholders exist, but they do not explain what failed or how to recover. |
| 10 | Help and documentation | 1 | The telemetry has no legend, and the native Themes section is hidden. |
| **Total** |  | **21/40** | **Acceptable; significant improvement needed** |

## Design specificity verdict

The interface feels authored for this Pi setup. The block-drawn `pi`, per-character gradient, directory masthead, carbon palette, and model/git telemetry are distinctive. An unrelated product could not reuse the composition unchanged.

The weak point is system integration. The masthead is effectively locked to Oxocarbon through fixed RGB constants in `extensions/ui-customization/index.ts`, while the footer follows Pi theme roles. In a Deep Space render, the header stayed magenta while the footer became gold. That creates two visual systems in one terminal and breaks the theme commitment in `PRODUCT.md` and `DESIGN.md`.

The deterministic detector ran once and returned zero findings. That result is expected because the target is an ANSI TUI extension, not HTML or CSS. No browser overlay exists. The independent visual review used the checked-in screenshot plus live default, 40-column, and Deep Space terminal renders.

## Overall impression

It is memorable and carefully made, but the identity treatment occupies too much permanent space and the footer behaves like a dashboard without a clear reading order. The main opportunity is to make the editor the visual center while keeping the “Signal Console” character.

Cognitive load is high at 6 failed checks out of 8. Grouping and choice count are good. Single focus, hierarchy, chunking, progressive disclosure, working-memory demand, and one-task-at-a-time behavior need work.

## What is working

- The masthead has real product character. The Pi mark and restrained gradient make the setup recognizable within seconds.
- The header and two-row footer have disciplined ownership. Async updates do not move the editor.
- The implementation handles terminal hazards well through sanitization, width-aware truncation, hyperlink checks, and render caching.

## Priority issues

### P1: The fixed palette breaks alternate themes

The raw Signal Magenta constants remain active when Pi switches themes. The header and footer then disagree about accent, text, and emphasis.

Fix this by deriving masthead colors from the active theme. If a true gradient cannot use theme roles, use a short sequence derived from the theme accent or fall back to one semantic accent.

Suggested command: `$impeccable colorize`

### P1: The permanent masthead consumes the working viewport

Six art rows plus blank rows appear on every session, including the 40-column render. The logo gets more visual weight than the prompt and violates the design rule that identity should establish itself, then get out of the way.

Keep the full masthead for startup or wide terminals. Collapse it to a one-line or two-row identity strip when width or height is constrained.

Suggested command: `$impeccable adapt`

### P1: The footer has no strict information hierarchy

Context occupancy, capacity, cost, speed, extension statuses, model, thinking level, branch, changed files, and PR state compete across two rows. Independent column truncation can silently remove important information.

Prioritize model and actionable risk first, then git state, then optional telemetry. Remove low-value fields before truncating. Label compact metrics or move the full set behind a `/status` detail view.

Suggested command: `$impeccable distill`

### P2: Theme discovery relies on fragile child-tree mutation

The extension recursively removes the native Themes section and retries on timers. That can flicker, race startup rendering, and hide the path to changing themes.

Use a supported configuration path if Pi exposes one. If the section must stay hidden, retain a visible `/theme` hint instead of silently removing discovery.

Suggested command: `$impeccable harden`

## Persona red flags

Alex, the power user, loses a fixed block of vertical space and cannot hide or reorder low-value telemetry. The interface becomes denser exactly when several extensions are active.

Sam, the accessibility-dependent user, cannot rely on alternate-theme contrast because the masthead bypasses theme roles. Unlabeled values such as `?`, `—`, and `tok/s` also rely on visual and domain interpretation.

Riley, the stress tester, can force silent information loss with long paths, branch names, PR metadata, or multiline extension statuses. Timer-based startup mutation adds another race-prone edge.

For the owner-operator workflow, status aggregation is valuable because subagents and background terminals run concurrently. The current footer lists activity; it should instead answer one question: “What needs my attention now?”

## Minor observations

- Named sessions may not appear in the masthead because the title is replaced with the formatted working directory.
- The footer shows provider and model ID but not the friendlier model name already present in state.
- Thinking level appears as a bare value.
- A non-repository state becomes blank rather than “not a repo” or “git unavailable.”
- The gradient code sits outside the shared TUI styling conventions.

## Questions to consider

- What if the full Pi mark appeared once, then collapsed so the prompt owned the viewport?
- Which three footer signals actually change your next action?
- Is Oxocarbon magenta a deliberate product lock, or should every checked-in theme feel native?
- When telemetry is unavailable, should recovery point to `/reload`, authentication, or provider status?
