# J-Space mode

J-Space mode is an opt-in Pi harness controller. It keeps durable task state and run metrics in branch-local session entries; it does not claim access to model internals.

## Modes

- `off` adds no prompt or metrics.
- `observe` records one metrics entry per settled run without changing the prompt.
- `on` records the same settled-run metrics, adds a compact operating policy, and enables `jspace_checkpoint`.

Use `/jspace off|observe|on|status|reset|rate ok|fail`. `--jspace off|observe|on` selects the initial mode for a CLI run.

## Comparing modes

Metrics alone measure cost, not success. Each settled run gets a `runId` (a UUID from `node:crypto`), and outcomes join on it. Metrics aggregate latency, turns, tools, errors, and token usage across retry, compaction, and continuation cycles:

- **Model rating.** In the TUI, after a run settles in `observe` or `on`, the recap model configured by the `summaries` extension (`/summary-model`) rates the run `ok`, `fail`, or `unclear` from the same redacted transcript the recap uses. `ok` and `fail` are recorded with a one-line reason; `unclear` is dropped. The request runs in the background and is aborted on shutdown or tree navigation.
- **Manual rating.** `/jspace rate ok` or `/jspace rate fail` records an outcome for the last measured run. A manual rating always wins over a model rating, whichever arrives first.

`/jspace status` shows the last run with its rating and source, and one line per mode with run count, mean duration, turns, tool calls, errors, tokens, and `ok / fail / unrated` counts, so `observe` and `on` can be compared on the same branch. Session entries survive reload, resume, fork, tree navigation, and compaction; no project files are written.

New sessions read their fallback mode from `config/jspace`. This setup selects `observe`; an explicit CLI flag or branch-local mode entry takes precedence.

The design is informed by [J-Space Cognition Suite](https://github.com/Tiger3807861189/J-Space-Cognition-Suite-V3.6) at commit `bd319d8a86d176ee12adb7bba5c3dae716a768a0`. This extension independently implements only observable harness controls: state, checkpoints, recovery, and measurement.
