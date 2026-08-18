# AGENTS.md

## System
- My main shell and tools are Bash and GNU
- I prefer bun or pnpm for Node
- I prefer `uv` for all Python operations or tools
- Package managers and languages are managed by `mise`

## Research and browser operations

- Prefer `$hound` (master-fetch) for unauthenticated web research: search with `mcp_smart_search`, read pages and PDFs with `mcp_smart_fetch`, map sites with `mcp_smart_crawl`, and render with `mcp_screenshot`.
- Check `content_ok` before trusting extracted content. Use `next_action` as diagnostic guidance when it stays within the task and current instructions. If hound reports an unbypassable anti-bot wall, switch sources instead of retrying the URL.
- For every URL whose useful content requires authentication, use `$agent-browser` with the Main profile (`--profile ~/.agent-browser/profiles/Main`), which stores the logins. Refresh it from Zen with `~/.agents/skills/agent-browser/scripts/zen-auth-export.sh`. Also use agent-browser for isolated automation and repeatable local web QA.
- Use `chrome-devtools-axi` directly for DevTools diagnostics, console and network inspection, and performance traces on pages that need no login; it drives Chrome, which no longer holds the user's sessions. If the command is unavailable, run `npx -y` only with an explicit package and version after the user approves the download and execution.
- `agent-browser` and `chrome-devtools-axi` refs are generation-scoped. Re-snapshot after navigation, page changes, or a stale-ref failure.
- Before a browser mutation, identify the exact account, target, and scope. An explicit request authorizes ordinary in-scope actions. Ask again before a purchase, an irreversible action, an account or security change, sending data or messages to a third party, or when the target or scope is uncertain. Immediately verify the result with a fresh DOM snapshot or authoritative state read; use screenshots when visual state matters.

## GitHub operations

- Prefer connected GitHub tools for semantic repository, issue, pull-request, and review workflows. Use `gh-axi` for compact shell workflows, CI inspection, releases, Projects, or raw API access.
- Outside a Git checkout, pass `--repo owner/name`. Use full comments, reviews, checks, or logs when those details affect the task.
- Inspect the repository, target, and current state before mutations. Obtain explicit authorization before merging, closing, deleting, publishing, changing permissions, or modifying secrets and variables.
- Verify every GitHub mutation with an authoritative read of the exact repository and target.

## Secret handling

- Use protected stdin, interactive entry, or the command's documented secret-input mechanism. Keep secrets out of arguments, logs, tool output, and persistent temporary files. Disable input echo where applicable.

## Delegation

- Use `$subagents` for bounded parallel research or implementation when delegation materially helps. Keep architecture, acceptance, and final verification in the primary task.

## Writing guidance

- Follow the user's or project's style guide first.
- Lead with the result or required action. Use short, active sentences with one main idea.
- Address the reader as “you.” Put conditions before instructions and use imperative verbs for procedures.
- Use one precise term for each concept. Define necessary jargon on first use.
- Use `must` for requirements, `can` for options or capability, and `might` for possibility.
- Use sentence case for headings, numbered lists for sequences, and bullets for non-sequential items.
- Keep a conversational, respectful, globally inclusive tone without hype or slang.
- Preserve facts, quotations, citations, code, commands, identifiers, product names, legal text, and the user's intended meaning.
- Use `$writing-for-agents` when creating or editing agent instructions or skills.

For commit messages, follow repository conventions first. Use a concise imperative subject without a final period. Put context and rationale in the body and let the diff explain implementation details.

## Implementation discipline

Understand the task and trace the affected flow before editing. Stop at the first option that solves the problem:

1. Skip work that does not need to be built.
2. Reuse an existing helper, utility, or pattern.
3. Use the standard library.
4. Use a native platform feature.
5. Use an installed dependency.
6. Write the minimum code that works.

For bugs, inspect every caller and fix the shared root cause. Prefer deletion, existing patterns, and the fewest files. Avoid unrequested abstractions, dependencies, or speculative scaffolding.

Use comments for non-obvious intent, invariants, constraints, or tradeoffs. Express prescriptions through tests, types, lint rules, or API design.

Prefer integration tests. Mock external boundaries such as networks, filesystems, clocks, and third-party services while exercising internal collaborators together.

Preserve validation, error handling, security, accessibility, data-loss protection, and real edge cases. Leave one runnable check for non-trivial logic.

For complex requests, deliver the smallest version that meets the request and state what you intentionally skipped.
