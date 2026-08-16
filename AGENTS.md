# AGENTS.md

## Research and browser operations

- Prefer `$hound` (master-fetch) for unauthenticated web research. Use its search, fetch, crawl, and screenshot tools; check `content_ok`, follow a bounded `next_action`, and switch sources at an unbypassable bot wall.
- For every URL whose useful content requires authentication, use `$agent-browser` with the Main Chrome profile (`--profile Default`). Also use it for isolated automation and repeatable local web QA. Use `chrome-devtools-axi` for DevTools diagnostics.
- When the installed `agent-browser` syntax or workflow is unclear, run `agent-browser skills get core`; the version-matched guide is authoritative. If the client exposes agent-browser through MCP, pass `extraArgs: ["--profile", "Default"]` on the opening call (or the typed profile field) and reuse the resulting session.
- Re-snapshot after navigation, page changes, or stale references.
- Before consequential browser actions, confirm the account, target, scope, and authorization. Verify the result with a fresh state read or screenshot.
- The Main Chrome profile holds your signed-in sessions: ask before purchases, irreversible actions, account or security changes, or sending data or messages to a third party, and whenever the account, target, or scope is uncertain.

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
