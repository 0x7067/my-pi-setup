# J-Space mode

J-Space mode is an opt-in Pi harness controller. It keeps durable task state and run metrics in branch-local session entries; it does not claim access to model internals.

## Modes

- `off` adds no prompt or metrics.
- `observe` records latency, turns, tools, errors, and token usage without changing the prompt.
- `on` records the same metrics, adds a compact operating policy, and enables `jspace_checkpoint`.

Use `/jspace off|observe|on|status|reset`. `--jspace off|observe|on` selects the initial mode for a CLI run. Session entries survive reload, resume, fork, tree navigation, and compaction; no project files are written.

New sessions read their fallback mode from `config/jspace`. This setup selects `observe`; an explicit CLI flag or branch-local mode entry takes precedence.

The design is informed by [J-Space Cognition Suite](https://github.com/Tiger3807861189/J-Space-Cognition-Suite-V3.6) at commit `bd319d8a86d176ee12adb7bba5c3dae716a768a0`. This extension independently implements only observable harness controls: state, checkpoints, recovery, and measurement.
