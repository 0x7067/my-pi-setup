# My Pi setup

This setup is intentionally opinionated. It:

- uses Rose Pine Moon as the theme
- adds firecrawl tools for searching and scraping
- updates the bottom bar to have the info I prefer to see
- adds background terminals + ui to manage them
- adds subagents to pi
- adds workflows to pi
- adds an ask user tool, which lets the model ask multiple choice questions
- adds first-class `fd` (file discovery) and `rg` (content search) tools
- adds Pi Lens, Hermes memory, run summaries, and Calm mode
- enables automatic compaction

Project-local extensions prompt for trust by default. Claude and Codex
subagents are autonomous processes with normal host permissions, so only launch
them in directories you trust.

![Pi setup interface](assets/pi-setup.jpeg)

Setup and privacy instructions are in [`SETUP.md`](SETUP.md).
