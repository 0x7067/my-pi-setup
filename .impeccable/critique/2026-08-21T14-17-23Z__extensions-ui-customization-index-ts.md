---
target: main Pi TUI after hierarchy pass
total_score: 23
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
timestamp: 2026-08-21T14-17-23Z
slug: extensions-ui-customization-index-ts
---
## Design health score

| # | Heuristic | Score | Key issue |
|---|---|---:|---|
| 1 | Visibility of system status | 2 | Compact mode can hide context pressure when an extension status is active. |
| 2 | Match with the real world | 3 | Natural for a technical operator, though `ctx` and raw model identifiers remain terse. |
| 3 | User control and freedom | 3 | The passive surface does not trap users, but theme discovery remains hidden. |
| 4 | Consistency and standards | 2 | Theme roles now work, but Git metadata and breakpoint behavior remain inconsistent. |
| 5 | Error prevention | 2 | Complete semantic fields can truncate into ambiguous fragments. |
| 6 | Recognition rather than recall | 2 | Compact mode changes which facts exist, so users must remember hidden context. |
| 7 | Flexibility and efficiency | 3 | Responsive compression and PR hyperlinks help experts. |
| 8 | Aesthetic and minimalist design | 3 | The quiet footer is stronger; the wide masthead still consumes substantial space. |
| 9 | Error recovery | 2 | Fallback states name problems but do not offer recovery actions. |
| 10 | Help and documentation | 1 | No contextual explanation exists for `ctx`, thinking level, or hidden theme access. |
| **Total** |  | **23/40** | **Acceptable; responsive priority work remains** |

## Design specificity verdict

Specificity remains strong. The combination of Pi identity, working directory, model and thinking state, context pressure, extension activity, and Git metadata belongs to this setup.

Theme integration improved materially. The masthead now follows Oxocarbon, Deep Space, and the other checked-in themes through semantic roles. The deterministic detector returned zero findings, which is expected for an ANSI TUI rather than HTML or CSS.

The missed opportunity is now operational priority. The footer removes optional data by width, but it does not yet guarantee that the most urgent signal survives. The width breakpoints also change height and content too abruptly.

## Overall impression

The first pass fixed the visual split between masthead and footer and improved normal-width density. The interface now looks more coherent across themes.

The remaining problems appear at boundaries and under pressure. Resizing across 100 columns adds eight rows. A running extension can hide a dangerous context percentage at compact widths. Long branches and PRs truncate into fragments instead of disappearing as complete optional fields.

Cognitive load improved, but four of eight checks still fail: single focus, chunking, visual hierarchy, and working-memory demand.

## What is working

- The composition is still distinctly Pi and maps directly to the owner-operator workflow.
- The two-row footer remains stable during asynchronous updates.
- Theme-role integration now works across Oxocarbon and Deep Space.
- The new tests prove compact and wide masthead behavior, status ordering, warning color, and removal of raw truecolor ANSI.

## Priority issues

### P1: The 100-column breakpoint causes an eight-row editor jump

The header changes from one line at 99 columns to nine lines at 100. Resizing a split pane can therefore move the editor dramatically.

Keep the full logo decision stable for the session. Choose compact or full from the initial terminal width, then preserve that height. Another valid option is a startup-only logo that collapses once interaction begins.

Suggested command: `$impeccable adapt`

### P1: Compact mode can hide context danger

At 71 columns and below, any active extension status replaces context. A running subagent can therefore hide `ctx 92%`, even though context pressure is the higher-risk signal.

Reserve a compact context token at every width. Use an explicit urgency order such as context error, active process, branch, then optional telemetry.

Suggested commands: `$impeccable adapt`, `$impeccable clarify`

### P1: Truncation breaks semantic fields

The column helper truncates assembled strings, producing fragments such as `PR #4...`, `feature/su...`, or `4...`.

Budget complete semantic atoms. Preserve context percentage, active status, branch identity, and PR number. Drop cost, speed, file count, or provider as whole fields before truncating meaningful identifiers.

Suggested command: `$impeccable adapt`

### P2: Git metadata does not consistently use theme roles

Branch, PR, and changed-file text can inherit the terminal default rather than the muted metadata role. Deep Space makes dim separators especially weak.

Style Git metadata as muted text, keep separators dim, and reserve accent for the PR link.

Suggested commands: `$impeccable audit`, `$impeccable colorize`

### P2: Theme discovery still relies on delayed tree mutation

The extension removes `[Themes]` through repeated timer-based child-tree mutation. Startup content can shift after first render, and no replacement theme hint is shown.

Prevent the section before first render if Pi exposes a supported path. Otherwise add a stable `/theme` hint and remove the delayed mutation.

Suggested commands: `$impeccable layout`, `$impeccable clarify`

## Persona red flags

Alex still pays a nine-row viewport cost on wide terminals and cannot rely on urgency ordering when several extensions publish statuses.

Sam benefits from theme-role colors, but compact mode can remove the textual context warning entirely. The block logo may also produce noisy screen-reader output.

Riley can trigger discontinuities at 71/72 and 99/100 columns, plus incomplete branch and PR atoms with long values. Those boundaries are not covered by tests.

For the owner-operator, context pressure should outrank routine activity. A running-process glyph is useful, but it must not displace a context warning.

## Minor observations

- `$0.00` appears on every wide render and can be omitted until spend exists.
- Provider and thinking detail change abruptly with width.
- Tests cover 80 and 120 columns, but not the exact breakpoint boundaries.
- Footer status strings are split on newline but are not sanitized like the working-directory label.
- The flat theme accent is less distinctive than the original gradient, but it is far more consistent.

## Questions to consider

- Should a session that starts wide keep the full logo even after resizing, while a session that starts narrow remain compact?
- Is context danger always the highest-priority compact signal?
- Should long branch names truncate only after the full PR number and context percentage are secured?
