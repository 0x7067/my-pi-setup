---
target: main Pi TUI after hardening
total_score: 26
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
timestamp: 2026-08-21T14-39-55Z
slug: extensions-ui-customization-index-ts
---
## Design health score

| # | Heuristic | Score | Key issue |
|---|---|---:|---|
| 1 | Visibility of system status | 3 | Updates work, but startup still says `model unavailable` without distinguishing loading from failure. |
| 2 | Match with the real world | 3 | Branches, PRs, context, cost, and model names fit the owner workflow; `ctx` and `tok/s` remain terse. |
| 3 | User control and freedom | 3 | The surface is passive and non-blocking, but density cannot be changed after initial render. |
| 4 | Consistency and standards | 3 | Theme roles, glyphs, and the two-row footer are coherent; width cliffs remain abrupt. |
| 5 | Error prevention | 3 | Sanitization and whole-field priority fitting prevent overflow and control-sequence leakage. |
| 6 | Recognition rather than recall | 2 | Compact mode hides provider, thinking state, and the names of multiple active operations. |
| 7 | Flexibility and efficiency | 3 | Width-aware density and PR hyperlinks help experts. |
| 8 | Aesthetic and minimalist design | 2 | The wide masthead still spends nine rows and repeats the path shown in the footer. |
| 9 | Error recovery | 2 | Context danger, model failure, and non-repository states do not explain the next action. |
| 10 | Help and documentation | 2 | Context thresholds, thinking levels, and status aggregation have no inline explanation. |
| **Total** |  | **26/40** | **Acceptable, with a solid authored foundation** |

## Design specificity verdict

Specificity remains high. The `pi` mark, repository identity, model/context/git telemetry, semantic theme roles, and activity glyphs clearly belong to this setup.

The deterministic detector returned zero findings. All five checked-in themes expose the semantic roles used by the renderer, and the focused test suite passes. Browser overlays remain inapplicable because this is a terminal-only target.

The remaining weakness is compositional restraint. The operational system is much stronger now, but the wide identity treatment and compact status aggregation still hide or displace useful information.

## Overall impression

The second pass solved the serious safety and consistency problems:

- Masthead height no longer changes during a session.
- Context survives beside activity at compact widths.
- PR numbers and other high-priority fields remain complete.
- Git metadata follows theme roles.
- Control sequences are stripped from status text.
- Native theme discovery is no longer removed through delayed mutation.

The remaining issues are product trade-offs rather than broken mechanics. The full mark is memorable but expensive. Compact aggregation is safe but vague. Warning and recovery copy is still terse.

## What is working

- The two-row footer remains stable during asynchronous updates.
- Priority fitting now drops optional fields as whole units.
- Theme portability and terminal safety are strong.
- Exact 71/72 and 99/100 boundary tests pass.
- Context danger uses text, punctuation, and semantic color rather than color alone.

## Priority issues

### P1: Responsive density still has cliffs

The masthead mode is locked from the first render, which preserves height but creates an asymmetric experience. A session opened wide keeps nine header rows after narrowing. A session opened narrow never reveals the full mark after widening.

Footer content also changes sharply at 71/72 and 99/100 columns.

Fix this by using smaller independent disclosure thresholds for model provider, thinking level, context window, cost, and speed. The masthead needs a product decision: keep the wide-first trade-off, use a two-row identity everywhere, or make the full mark startup-only.

Suggested command: `$impeccable adapt`

### P1: Compact mode hides active operation names

Multiple statuses become `2 active`. That preserves space but does not tell the owner whether subagents, summaries, or background terminals need attention.

Keep the highest-priority named status and append `+N`, such as `■ 1 running · +1`. Define urgency rather than sorting only by extension key.

Suggested command: `$impeccable clarify`

### P2: The wide masthead remains vertically expensive

At 100 columns and above, the header uses nine rows and repeats the working directory already shown in the footer. On a short terminal, the identity treatment can dominate the editor.

Compress the mark to one or two rows, gate it on vertical headroom, or show it only as an arrival moment.

Suggested command: `$impeccable distill`

### P2: Semantic and recovery states remain terse

A context value from 75 to 89 percent changes color but adds no warning word. Draft PRs render like ready PRs. `model unavailable` does not distinguish loading from failure.

Add explicit text such as `ctx 82% · nearing limit`, `PR #42 · draft`, and `loading model...` where the underlying state supports it.

Suggested command: `$impeccable clarify`

## Persona red flags

Alex still pays a large vertical cost when the session starts wide and cannot expand compact status details on demand.

Sam benefits from semantic theme roles and textual context warnings, but 75 to 89 percent context pressure still relies mostly on color. Dim session text remains deliberately faint.

Riley can expose abrupt content changes at threshold boundaries, unusually long statuses that disappear as whole fields, and unlabelled draft PR state.

For the owner-operator, `2 active` is safer than losing context but not specific enough to guide attention.

## Minor observations

- `not a repo` appears at 72 columns but disappears at 71.
- Positive cost renders while `$0.00` does not.
- Provider and thinking information change abruptly with width.
- Draft PR state is available in the domain model but unused.
- The full masthead remains the strongest visual element even though this is an Operate surface.

## Questions to consider

- Is the full nine-row mark worth retaining as a wide-first session trade-off?
- Which status type should win when several operations are active?
- Should context pressure from 75 to 89 percent say `nearing limit`, not merely change color?
