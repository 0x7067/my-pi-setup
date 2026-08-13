# Working agreements

## Tool routing

- Research: use Hound for unauthenticated web work. Search with `web_search`, read pages and PDFs with `web_fetch`, map sites with `web_crawl`, and use `web_screenshot` when rendering matters. Trust fetched content only when `content_ok` is true; follow `next_action`, and switch sources when an anti-bot wall is unbypassable.
- Browser automation: for rendered or authenticated pages, screenshots, and local web QA, read the bundled `agent-browser` skill before using the typed `agent_browser_*` tools. Serve local fixtures through the project dev server or `127.0.0.1` HTTP.
- Code intelligence: use Pi Lens (`ast_grep_search`, `lsp_navigation`, and `symbol_search`) for definitions, references, and structural searches.
- Agent-facing documents: read `writing-for-agents` before editing a skill, `AGENTS.md`, or `CLAUDE.md`.

## Implementation

Understand the real flow before editing. Trace the code end to end and inspect every caller of the shared function you might change.

Use the first rung that holds:

1. Skip work the outcome does not require.
2. Reuse an existing project pattern or helper.
3. Use the standard library.
4. Use a native platform feature.
5. Use an installed dependency.
6. Write the minimum new code.

Fix bugs at the shared root cause so sibling callers receive the same correction. Choose the smallest edge-case-correct solution.

- Keep abstractions, dependencies, scaffolding, and touched files to the requested minimum.
- Prefer deletion and boring code over cleverness.
- Preserve validation, error handling, security, accessibility, and data-loss protection.
- Let TypeScript infer types. Add explicit return types only when they clarify or enforce a contract. Use `as any` only after safer narrowing or typing options are exhausted.
- Leave one runnable check for non-trivial logic. A trivial one-line change needs no dedicated test.
- For a complex request, deliver the smallest version that satisfies it and state what remains outside scope. Expand it when the user asks.

## Verification

Run the project's relevant checks, formatter, linter, and tests after a change. If a command does not exist or cannot run, state that in the handoff. Completion means every relevant available check passes and every skipped check is named.

## User-facing writing

Follow the user's or project's style guide first. Otherwise:

- Lead with the result or required action.
- Use short, active sentences with one main idea. Address the reader as “you.”
- Put conditions before instructions. Use one action per numbered step and include the expected result when it helps verification.
- Use one familiar, precise term per concept. Define necessary jargon once and keep noun strings short.
- Disclose information gradually. Keep paragraphs focused; use sentence-case headings, numbered sequences, and bullets for peer items.
- Use `must` for requirements, `can` for options or capability, and `might` for possibility.
- Keep the tone conversational and respectful. Avoid slang, hype, culture-specific jokes, and claims that work is “easy,” “simple,” or “quick.”
- Write for a global audience. Preserve facts, quotations, citations, code, commands, identifiers, product names, legal text, and the user's intended meaning.
- Claim strict ASD-STE100 conformance only after checking the current specification and controlled dictionary.

## Commit messages

Follow repository conventions first. Otherwise:

- Write an imperative, capitalized subject of about 50 characters without a final period.
- Separate the subject and body with a blank line; wrap prose near 72 characters when the repository expects plain text.
- Use the body for context and rationale: prior behavior, problem, new behavior, and important side effects. Let the diff explain implementation details.
- Put issue or ticket references where the repository expects them.
