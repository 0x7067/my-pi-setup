# Pi Deep Space — five-direction theme study

## Deliverable

Create one wide `.pen` design canvas containing five drastically different, buildable theme directions for Pi. This is a theme-system study, not shipping code and not a redesign of Pi's workflows. Each direction must show the same finite representative set of real Pi views so the user can judge cross-view coherence. The user chooses the winner.

The design target is primarily a keyboard-first ANSI terminal UI. The Stats surface is the one intentional web view and must appear inside a browser frame. Terminal views must look like real monospace TUIs, not web cards placed in terminal-shaped boxes.

## Authority manifest (draw this on the canvas masthead)

- design doc: NONE; theme authority: `agent/themes/deep-space.json`
- active selection: `agent/settings.json` (`theme: deep-space`)
- supporting visual implementation: `agent/extensions/ui-customization/index.ts`
- domain glossary: no dedicated glossary; component/domain sources listed below
- grammar: real Pi view sources under `agent/extensions/`
- platform rules: `agent/AGENTS.md`; no navigation-specific rules found
- renderer: Pen CLI, authenticated with `PEN_CLI_KEY`
- patterns: WEB FALLBACK; Mobbin MCP available but paid-plan access denied
- pattern references actually opened: `coreyt/monospace-design-tui` and `flipt-io/flipt/cmd/flipt/DESIGN.md`
- critique: Impeccable skill with rendered-canvas review
- fallback defaults: no design colors invented; terminal font follows the user's terminal monospace

## Product truth and scope

Pi is a keyboard-first coding-agent environment. Its interface alternates between a persistent conversation shell and focused full-screen overlays. Theme quality is measured by calm long-session reading, instant focus recognition, dense operational scanning, legible code/diffs, and semantic feedback that never relies on color alone.

Preserve Pi's actual navigation and copy. Do not add imaginary product features. Do not turn the terminal into a sci-fi cockpit, put stars/planets in backgrounds, use glass, gradients, glows, rounded web cards, emoji icons, or decorative grid overlays. “Deep Space” is restrained near-black depth plus warm instrument light—not outer-space decoration.

## Exact palette and semantic contract

Use only these existing hex values. Do not introduce another hue.

- ground `#0f0f0f`
- raised/user/tool/success surface `#1a1a1a`
- selected surface `#222222`
- structural line/tool-error surface `#2d2d2d`
- inactive/quote border/scrollbar `#414141`
- faint/comment/low-priority `#575757`
- muted URL/metadata `#7c7c7c`
- middle quote/list/operator `#8a8a8a`
- neutral success/string/number `#a5a5a5`
- soft type/variable/diff-added `#c0c0c0`
- body text `#dcdcdc`
- strong heading/tool title/keyword `#f0f0f0`
- maximum emphasis `#ffffff`
- action/focus/warning `#d8a766`
- hover/highlight `#e8c092`
- error/destructive `#e2574c`
- warm information surface `#231e18`

Important semantic constraints:

- Accent gold means action, focus, or warning—not decoration.
- Success is intentionally neutral gray; always pair it with a word or glyph.
- Error is red, but diff removal is near-white, not red.
- `#575757` is decorative-only text because its contrast is too low.
- `#7c7c7c` may be body-sized only on the page ground; use `#a5a5a5` for small text on raised/info surfaces.
- Selected fill is subtle and must be reinforced by accent text, a marker, or border.
- The recommended direction must include a primary dark set plus a bright-ambient accessibility twin. The twin may only remap existing neutral values: ground `#f8f8f8`, panel `#f0f0f0`, ink `#0f0f0f`, secondary `#575757`, lines `#c0c0c0`, and the same gold/red with dark text where needed. Label it a proposed companion, not part of the current theme JSON.

## Shared terminal grammar

- Monospace typography throughout terminal views; numerals align tabularly.
- Keyboard-first focus is explicit. Footer command bars name the available keys.
- Full-screen overlay navigation follows list → detail → transcript/output, with `Esc` returning upward.
- Prefer one boundary per region, light dividers, and whitespace. No nested boxes.
- Narrow-terminal behavior truncates secondary metadata before primary labels/actions.
- Status is conveyed with word + compact glyph + semantic color.
- Every terminal frame needs a realistic title, content body, and footer command line.
- The Stats view alone uses a browser frame and adapts Deep Space tokens to the existing information architecture.

## Representative view matrix (every variation must show all nine)

Render these as a coherent contact sheet within each direction. A direction may give one hero view more space, but cannot omit any numbered view.

1. **Pi conversation shell** — source `agent/extensions/ui-customization/index.ts`. Show the real six-line `PI` block title, a transcript turn, one tool result, the input/editor edge, and two-line footer telemetry: cwd, provider/model/thinking, context, cost/tok-s, branch, changed-file count, PR, extension status. Include a narrow-terminal crop.
2. **Ask User** — source `agent/extensions/ask-user/index.ts`. Title `Question`, wrapped prompt, numbered options with descriptions, `Write my own answer…`, explicit selected row, and a small custom-editor state. Keys: arrows or 1–N, Enter, Esc.
3. **Model/Thinking picker** — sources `agent/extensions/handoff/index.ts`, `agent/extensions/summaries/src/ui.ts`, `agent/extensions/generative-status/index.ts`. Show model label, provider, mutable thinking level, selected row, no-model/cancel state. Keys: h/l, j/k, Enter, Esc.
4. **Operations list + detail** — representative source `agent/extensions/background-terminals/src/ui/ps.ts`, with sibling grammar from subagents. Title `Background terminals`; count; rows with selected marker, named status, title/id, pid, elapsed/exit; x kill and Enter inspect. Detail shows metadata and stdout/stderr with live-tail/scroll state. Include running, done, failed, killed.
5. **Workflow dashboard** — source `agent/extensions/workflows/dashboard.ts` and workflow transcript card. Show `workflow <name>`, phase list, agents, `Total`, `Error`, `result`; running/complete/error; one expanded transcript preview; inspect/navigate/cancel/close commands.
6. **Changed-files diff inspector** — source `agent/extensions/git-info/src/changed-files-view.ts`. Title `local changes · N files · FILES|DIFF`; bordered split view with file list, +/− stats and paths, selected pane, syntax-colored unified diff, scroll position. Include binary/empty micro-state. Keys j/k, Enter/Space/l, ctrl-d/u, g/G, Esc/h.
7. **Pi Stats browser view** — source `agent/extensions/stats/src/dashboard.ts`. Keep the real IA: `Pi Stats`, `Local agent ledger`, updated stamp, theme/refresh actions, Requests/Cost/Tokens/Cache reuse/Errors, Daily cost bars, Models/Projects tables, read-only loopback footer. Include loading and error/malformed states. Do not make it look like a phone screen.
8. **Transcript result-card family** — representative sources file-search, subagents, workflows, summaries, custom OCR. Show collapsed and expanded `Search Content` plus `✦ Run recap`, with arguments, `Searching…`, result count, truncated marker, `Next:`, source metadata, and error state. Outer frame belongs to Pi; title strong, primary text accent, metadata dim.
9. **Transient feedback** — notifications and persistent status. Show `No subagents`, running/wait counter, recap progress/failure, plus one working indicator vocabulary (Choreography / Coalesce / Signal / Orbit / Static). Include info, warning, and error without relying on color alone.

## Pattern basis

The opened Monospace Design TUI reference identifies shared keyboard conventions, clear focus/state/feedback, footer command bars, focused surfaces, master-detail, expand-to-focus, object-local actions, selection grammar, and live drill-down as reusable modern TUI patterns. The opened Flipt TUI system stresses hierarchy through spacing and restrained badges, related grouping, narrow-terminal adaptation, reuse across commands, immediate feedback, and light rather than heavy borders. Cite these only as `ref: Monospace Design TUI · Flipt CLI TUI`; cite Pi component paths as the primary basis.

## Ordered variation briefs

### 1 — Signal Deck (provisional recommendation)

IA/theme paradigm: typography- and selection-first. Almost borderless ground; warm accent appears only at the active cursor, actionable key, focused pane title, and warnings. Raised surfaces distinguish transcript/tool regions. One clear hero is the conversation shell, followed by a disciplined 3×3 view matrix. This direction should feel calm for an eight-hour session and closest to a minimal, realistic Pi implementation.

State slot: show the full dark direction plus its bright-ambient accessibility twin. Include a loading skeleton geometry for Pi Stats and the disabled/no-model picker twin.

Tradeoff: maximum legibility and coherence, less dramatic separation in very dense dashboards.

### 2 — Observatory Rail

IA/theme paradigm: persistent left rail or top coordinate strip names the current mode and provides location within overlays; content remains flat, with single-pixel lines and measured gutters. This is not a new navigation feature—the rail is a visual treatment of existing titles, breadcrumbs, and key hints. Give operations list/detail and workflow dashboard prominence.

State slot: permission/degraded analog is `no models` plus unavailable telemetry shown without collapse. Include killed/failed operation states.

Tradeoff: superb wayfinding across complex overlays, consumes scarce columns in narrow terminals.

### 3 — Black Box Transcript

IA/theme paradigm: conversation-first event stream. Every action, tool result, notification, and workflow event shares a strict vertical time/log rhythm; overlays feel like zoomed events rather than separate applications. Boundaries are indentation and blank rows, not boxes. Give transcript cards and workflow events prominence.

State slot: empty search, no subagents, and collapsed/expanded tool twins.

Tradeoff: preserves narrative continuity and scan speed, weaker side-by-side comparison for files and metrics.

### 4 — Flight Director

IA/theme paradigm: dense split panes with aligned columns, fixed metadata gutters, and a persistent command bar. Strongest for expert monitoring: operations, workflows, diffs, and stats all use one common information-density grammar. Accent is a moving focus instrument, not an ambient color.

State slot: live-tail vs paused detail, diff focus switch, workflow running/error, Stats malformed warning.

Tradeoff: exceptional throughput for expert users, steepest learning curve and visually busiest.

### 5 — Event Horizon Focus

IA/theme paradigm: progressive focus. The background shell recedes to faint and raised values while the active question, picker, diff pane, or tool expansion occupies a bright centered working band. No translucent blur—only existing solid values and contrast. Show Ask User and changed-files as heroes.

State slot: custom-answer editor, destructive kill confirmation/error, and reduced-motion/static working indicator.

Tradeoff: clearest moment-to-moment focus and strongest personality, hides more surrounding context during modal work.

## Canvas and annotation contract

- First create a masthead frame with title `Pi Deep Space — theme across every view`, authority manifest, and feedback placeholder.
- Add a compact palette/semantic legend using exact values.
- Each variation is a labeled board placed beside the prior board, not on top of it.
- Each variation label includes: number, title, paradigm, one-sentence benefit, one-sentence tradeoff, `ref: Pi source paths · Monospace Design TUI · Flipt CLI TUI`.
- Mark only Signal Deck with a provisional `Recommended` chip. Recommendation may move after critique.
- Signal Deck must show both primary dark and bright-ambient companion boards.
- All five variations remain visible in the final `.pen`; do not hide or delete alternates.
- Use synthetic but plausible local-only values and label the overall board `illustrative data`.

## Whole-set feedback placeholder

Reserve a short masthead paragraph. Initial hypothesis: Signal Deck best balances Pi's long-session reading, exact current semantics, and cross-view consistency; Flight Director is strongest for dense overlays; Event Horizon has the sharpest modal focus; Observatory Rail improves wayfinding; Black Box best preserves conversation continuity. Replace or refine this after rendered critique.

## Independent critique corrections — final pass

Apply these changes to the completed five-direction canvas without deleting, hiding, or materially redesigning any board:

1. Keep Signal Deck as the sole recommendation. The independent critique confirmed it has the clearest hierarchy, lowest sustained cognitive load, most authentic keyboard-first footer grammar, strongest cross-view consistency, and best adherence to exact palette semantics.
2. Event Horizon Focus: functional context in every receded region must not use `#575757`. Use `#7c7c7c` for body-sized receded context and `#a5a5a5` for small metadata on raised surfaces. Reserve `#575757` for rules, separators, and ghost geometry. Preserve the contrast-based focus idea without making context unreadable.
3. Add a compact aligned whole-set comparison strip below the masthead/palette and above the full boards. Columns are the five directions; rows are: paradigm, main benefit, main tradeoff, best-fit views, special state slot, and narrow-terminal cost. Use concise text and existing palette values. If necessary, increase the masthead region and shift every full board downward by the same amount; retain all full-size boards.
4. Black Box Transcript: raise load-bearing timestamps and event metadata from `#575757` to `#7c7c7c`; keep indentation/blank rows as the structural distinction.
5. Add a compact numbered source key to the masthead with exact local source paths for the nine views and stable external repository URLs: `https://github.com/coreyt/monospace-design-tui` and `https://github.com/flipt-io/flipt/blob/v2/cmd/flipt/DESIGN.md`. Existing compressed `ref:` blocks may point to the numbered key.
6. Observatory Rail and Flight Director: keep only two or three current actions in narrow footer/rail key legends, then show `? help` for the secondary shortcut list. Do not remove the full command grammar from normal-width views.
7. Rename the masthead title to `Pi Deep Space — across nine representative views` so scope is precise. Update the feedback label to `WHOLE-SET READ · independent critique complete`, and remove provisional wording from the recommendation chip while leaving Signal Deck recommended.
8. Re-run an exact-palette sweep and clipping check after edits. No invented hex values, no overlap, and no hidden boards.

## Independent critique corrections — second and final batch

Only two partial findings remain. Apply these without changing the comparison strip, recommendation, source key, or any already-resolved region:

1. Event Horizon Focus: remove or substantially reduce parent-frame opacity on every receded region that contains functional text. Functional context must render at its assigned semantic token's real effective contrast: `#7c7c7c` on ground and `#a5a5a5` for small metadata on raised surfaces. Preserve progressive focus using surface elevation, accent boundary, active-band brightness, and `#575757` rules/ghost geometry—not by dimming the entire functional subtree. No functional text may inherit opacity below 0.85.
2. Observatory Rail narrow treatment only: replace tiny stacked shortcut lists with at most two current actions plus `? help`. Keep the location/breadcrumb treatment and normal-width rail grammar unchanged.
3. Re-run the exact-palette, effective-opacity, overlap, and clipping checks. Preserve all five boards and Signal Deck as the sole recommendation.
