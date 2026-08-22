# Extensions

Pi discovers global extensions one level below this directory. A loadable entry
is either a top-level `.ts` or `.js` file, or an immediate child directory with
an `index.ts` or `index.js` file. Keep feature directories flat. Category
subdirectories would prevent Pi from finding their entry points.

## Extension map

| Area                   | Extensions                                                                                                                             |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Agent operations       | `background-terminals`, `handoff`, `subagents`, `workflows`                                                                            |
| Tools and integrations | `ask-user`, `atuin`, `browser-relay`, `copy-all`, `custom-ocr`, `file-search`, `hound-lazy`, `toolbox-lazy`                            |
| Interface and status   | `calm`, `deepseek-peak-pricing`, `generative-status`, `git-info`, `jspace`, `model-info`, `stats`, `terminal-status-title`, `ui-customization` |
| Models and runtime     | `devin-auth`, `omp-natives`, `openai-server-compaction`, `prompt-cache`, `spark-strict-tools`, `summaries`, `zz-codex-cache-keepalive` |

`shared` contains code used by several extensions and has no entry point of its
own. `synthetic.json` configures the installed Synthetic package.

`zz-codex-cache-keepalive` runs last so it captures the final provider payload.
Its `config.json` enables two bounded Codex OAuth cache reads for large,
text-only TUI contexts during the first six idle minutes. Disable it there to
avoid the extra quota use.

`ai-memory.ts` and `herdr-agent-state.ts` remain top-level files because their
installers manage those paths. Regenerate or reinstall them instead of moving
or editing them by hand.

## Layout rules

- Put repository-owned extensions in `extensions/<name>/index.ts` or
  `index.js`.
- Keep an extension's tests, package manifest, configuration, and private
  helpers in the same directory.
- Add a `package.json` only when the extension needs dependencies or its own
  workspace scripts. The root workspace installs every matching package.
- Put code shared by unrelated extensions in `shared`. Keep feature-specific
  code with its feature.
- Store machine-local credentials and runtime configuration only in ignored
  files. Update `.gitignore` before introducing a new private-state path.

Run `npm run doctor`, `npm run check`, and `npm test` after changing the layout.
Pi picks up extension changes after `/reload` or a restart.
