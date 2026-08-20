# My Pi setup

This setup is intentionally opinionated. It:

- uses the Oxocarbon theme (Deep Space and others are included)
- uses Hound for web search, fetching, crawling, and screenshots
- updates the bottom bar to have the info I prefer to see
- adds background terminals + ui to manage them
- adds subagents to pi
- adds workflows to pi
- adds an ask user tool, which lets the model ask multiple choice questions
- adds first-class `fd` (file discovery) and `rg` (content search) tools
- adds an authenticated relay for inspecting and controlling selected Chrome tabs
- adds `@53able/pi-agent-browser` for typed browser automation tools
- adds a private local dashboard for Pi usage, cost, models, projects, and cache reuse
- adds Pi Lens, ai-memory, run summaries, and Calm mode
- defaults to Claude Sonnet 5 through the vendored Devin provider
- vendors Codex-style OpenAI compaction with a Pi 0.84 compatibility patch
- vendors the Devin provider with conversation-scoped prompt-cache identity

Project-local extensions prompt for trust by default. Claude and Codex
subagents are autonomous processes with normal host permissions, so only launch
them in directories you trust.

![Pi setup interface](assets/pi-setup.jpeg)

## Repository map

- [`extensions/`](extensions/README.md) contains the extension entry points,
  their tests, and shared extension code.
- [`skills/`](skills/README.md) contains Pi skills and their supporting files.
- [`config/`](config/) contains checked-in defaults consumed by extensions.
- [`docs/research/`](docs/research/) records measured behavior and design
  rationale. [`docs/specs/`](docs/specs/) holds implementation plans and design
  work.
- [`scripts/`](scripts/) contains setup validation and private-state hardening.
- [`themes/`](themes/) contains the checked-in Pi themes.

Runtime state such as sessions, credentials, package checkouts, generated
workflows, and project memory lives beside this source tree but stays ignored
by Git.

Setup and privacy instructions are in [`SETUP.md`](SETUP.md). Start with the
[extension map](extensions/README.md) when adding or changing an extension.
