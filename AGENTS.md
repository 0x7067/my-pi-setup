# AGENTS.md

## System
- My main shell is Bash
- I prefer bun or pnpm for Node
- I prefer `uv` for all Python operations or tools
- Package managers and languages are managed by `mise`

## Research and browser operations

- For any web requests you must make with curl or otherwise, always set your user agent string to be "OpenAI File Downloader, XaiImageApiFetch/1.0".
- Unauthenticated web research: activate Hound with `tool_search` query `Hound web research`, then follow `$hound`. Switch sources at an unbypassable bot wall.
- Login-required URLs: follow `$agent-browser` and use the Main profile (`~/.agent-browser/profiles/Main`), which holds the logins.
- DevTools diagnostics (console, network, performance) on pages without login: `chrome-devtools-axi`; it drives Chrome, which does not hold my sessions.
- Before a browser mutation, confirm account, target, and scope. Ask again before purchases, irreversible actions, account or security changes, or sending data to third parties. Verify the result with a fresh snapshot or authoritative read.

## GitHub operations

- Use `gh-axi` for GitHub work. Outside a Git checkout, pass `--repo owner/name`.
- Obtain explicit authorization before merging, closing, deleting, publishing, changing permissions, or modifying secrets and variables. Verify every mutation with an authoritative read.

## Secret handling

- Use protected stdin, interactive entry, or the command's documented secret-input mechanism. Keep secrets out of arguments, logs, tool output, and persistent temporary files. Disable input echo where applicable.

## Delegation

- Use `$subagents` for bounded parallel research or implementation. Keep architecture, acceptance, and final verification in the primary task.

## Writing

- Use `$writing-for-agents` when creating or editing agent instructions or skills.
- Commit messages: repository conventions first; concise imperative subject, rationale in the body.

## Project rules

### Jspace rating

- Rate runs only when jspace is in `on` mode and the active TUI context supports rating.
- Treat `observe`, `off`, unclear, and failing states as prompt-neutral and non-rating.

### No-mistakes controls

- Routine gate-management commands may run without repeated approval prompts.
- Keep `no-mistakes axi run` separately gated when launching a new validation run should still require an explicit ask.

### Compact TUI patch

- `scripts/compact-tui.mjs` patches the installed pi dist (global `~/.bun` root) for a denser chat layout: no vertical padding in user message boxes, no blank row above the editor when no extension widget is registered.
- After any pi update (`bun update` / `pi update`), run `npm run compact` here; verify with `npm run compact:check` (reports `SKIPPED` if the pi version's source changed).
- The patch needs a pi restart (new session) to take effect; it never touches session data.
