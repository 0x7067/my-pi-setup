---
name: subagents
description: Delegate bounded work to Pi, Claude Code, or Codex subagents. Use when the user asks for subagents or parallel agent work.
---

# Subagents

Each subagent is headless, has its own context, cannot ask the user, and cannot spawn another subagent. Give it a self-contained prompt with absolute paths, constraints, evidence to return, and a checkable completion criterion.

## Choose the harness

- Use `pi` by default. Omit model and reasoning settings to inherit the parent. Do not select an Anthropic-provider model for the Pi harness.
- Use `claude` when the user requests Claude Code. Default to the latest Fable model with high reasoning unless the user names another model.
- Use `codex` when the user requests Codex. Default to `gpt-5.6-sol` with high reasoning; use another model only when the user requests it.

Inspect `pi --list-models` when an exact Pi model identifier is needed. The installed harness is the source of truth for available models and reasoning levels.

## Spawn and manage

1. Split only independent tasks with distinct outputs. Keep architecture, acceptance decisions, and final verification in the primary task.
2. Call `subagent_spawn` with a complete `prompt`, short `name`, chosen `harness`, and optional `working_dir`, `model`, and `reasoning_effort`. Run at most four subagents concurrently.
3. Continue useful primary work while children run.
4. Use `subagent_check` for a non-blocking inspection, `subagent_list` for the inventory, `subagent_wait` only when results are required, and `subagent_cancel` to stop a run while preserving its transcript.
5. Reconcile every returned result against the assigned completion criterion. Verify material code or configuration changes in the primary task.

Delegation is complete when every child has returned or been intentionally cancelled, each result has been reconciled, and the primary task has performed final verification.

The user can inspect or take over a run with `/subagents`.
