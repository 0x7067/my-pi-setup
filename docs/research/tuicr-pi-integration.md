# tuicr integration with this Pi setup

## Decision

Yes. Use tuicr as a separate interactive review terminal and use its persisted-review
CLI as the Pi-facing interface. The lowest-risk integration is to install the upstream
`tuicr` skill at a pinned release under `~/.pi/agent/skills/tuicr/`, then let the
agent call `tuicr review` to discover and read review sessions. Do not try to embed
tuicr inside Pi's TUI, add it to Pi's npm `packages`, or launch it through the
read-only background-terminal extension.

No production code or settings were changed by this research.

## Local compatibility

This repository is the Pi global agent directory (`~/.pi/agent`). Pi is pinned to
`@earendil-works/pi-coding-agent` `0.84.1`, and its existing configuration loads
only Pi packages; tuicr is not present there. Pi discovers skills directly from
`~/.pi/agent/skills/`, so a directory at `agent/skills/tuicr/` needs no
`settings.json` entry. [Local package manifest, lines 4–8](../../package.json#L4-L8),
[current Pi settings, lines 12–17](../../settings.json#L12-L17), and [installed Pi
skill-discovery docs, lines 14–33](../../node_modules/@earendil-works/pi-coding-agent/docs/skills.md#L14-L33).

Read-only checks on 2026-08-13 found:

| Requirement              | Result                                                                   |
| ------------------------ | ------------------------------------------------------------------------ |
| tuicr binary             | Installed: `tuicr 0.21.0`                                                |
| Multiplexers             | `tmux`, Zellij, and Herdr are installed                                  |
| Herdr wrapper dependency | `jq` is installed                                                        |
| Forge helpers            | `gh` and `glab` are installed; `bkt` and `az` are not                    |
| tuicr configuration      | No `~/.config/tuicr/config.toml` was present, so upstream defaults apply |
| Current inspection shell | No `TMUX`, `ZELLIJ`, `HERDR_ENV`, or `CMUX_SOCKET_PATH` was set          |

The final row describes the inspection shell, not necessarily every Pi launch. Check
the environment in the actual Pi session before attempting automatic pane creation.
With no active multiplexer, a user can still start tuicr in another terminal and Pi
can attach with `tuicr review`; only automatic split-pane launching is unavailable.

## What tuicr exposes

tuicr is a standalone Rust terminal application, not a Pi extension or Node package.
Its own source uses an interactive terminal UI over its internal VCS and forge
backends. Its public extension surface for an external process is the persisted-review
CLI, plus a Rust `ReviewStore` API for native Rust callers. A TypeScript Pi extension
would need a native bridge to use the latter, so the JSON CLI is the appropriate
boundary. [Cargo manifest](https://github.com/agavra/tuicr/blob/v0.21.0/Cargo.toml),
[application startup](https://github.com/agavra/tuicr/blob/v0.21.0/src/main.rs),
[public Rust API](https://github.com/agavra/tuicr/blob/v0.21.0/src/lib.rs), and
[review store](https://github.com/agavra/tuicr/blob/v0.21.0/src/review_store.rs).

Useful invocations include:

```sh
tuicr -w                         # review working-tree changes
tuicr -r main..HEAD              # review a revision range
tuicr pr 125                     # review a GitHub or Bitbucket PR
tuicr mr 125                     # review a GitLab MR
tuicr review list --repo /path/to/repo
tuicr review comments --repo /path/to/repo --session <slug>
tuicr review add --repo /path/to/repo --session <slug> --input -
```

`list`, `comments`, and `add` use JSON, and `add --input -` accepts structured JSON
on stdin. The `--username` option makes agent-authored comments distinguishable from
user comments. [CLI source](https://github.com/agavra/tuicr/blob/v0.21.0/src/cli.rs),
[review CLI reference](https://github.com/agavra/tuicr/blob/v0.21.0/docs/REVIEW_CLI.md),
and [upstream agent skill](https://github.com/agavra/tuicr/blob/v0.21.0/skills/tuicr/SKILL.md).

`--stdout` exports markdown, but does not make the interactive program headless: the
application still uses `/dev/tty` for the TUI. It is useful for a wrapper that waits
for the review to finish, not for embedding a visual review into tool output.
[Startup and stdout handling](https://github.com/agavra/tuicr/blob/v0.21.0/src/main.rs).

## Review lifecycle

1. A user starts an interactive tuicr review against a supported target.
2. When the target becomes active, tuicr creates a persisted session and announces a
   slug. It records open sessions in `active_sessions.json`.
3. Pi runs `tuicr review list --repo <repo>` and selects the unambiguous
   `"active": true` session. If more than one session is plausible, Pi must ask the
   user which slug to use.
4. Pi reads feedback with `tuicr review comments`. The command returns JSON comments
   with IDs, locations, types, lifecycle state, and content.
5. During a user-led review, Pi only reads the user's comments. During an explicitly
   authorized agent-led review, Pi can add a distinct comment with `review add` and
   `--username`.
6. There is no push stream to Pi. Poll the same `comments` command only while the
   user explicitly asks Pi to wait, or read it after they say the review is ready.
7. On TUI exit, an automatically created session with no comments or reviewed files
   is removed; meaningful session state persists.

This is upstream's intended agent workflow. It avoids screen scraping and clipboard
parsing, while keeping the human in control of the interactive UI. [Session CLI
lifecycle](https://github.com/agavra/tuicr/blob/v0.21.0/docs/REVIEW_CLI.md),
[upstream agent workflow](https://github.com/agavra/tuicr/blob/v0.21.0/skills/tuicr/SKILL.md),
and [session persistence source](https://github.com/agavra/tuicr/blob/v0.21.0/src/persistence/storage.rs).

## Pi-specific constraints

- Pi can register slash commands, model tools, lifecycle handlers, and custom UI.
  It can therefore orchestrate tuicr, but its custom UI API replaces Pi components;
  it does not turn a separate terminal program into an embedded terminal emulator.
  [Pi extension API, lines 8–18](../../node_modules/@earendil-works/pi-coding-agent/docs/extensions.md#L8-L18)
  and [custom UI API, lines 2468–2727](../../node_modules/@earendil-works/pi-coding-agent/docs/extensions.md#L2468-L2727).

- Do not use `bg_start` for tuicr. The local background-terminal implementation gives
  child processes no stdin and exposes only captured output. It also stops managed
  processes during Pi session shutdown. That is correct for servers and watchers, but
  cannot host a human-operated TUI. [Background-terminal contract, lines 1–18](../../extensions/background-terminals/index.ts#L1-L18)
  and [stdin/process lifecycle, lines 1–15](../../extensions/background-terminals/src/domain.ts#L1-L15).

- The existing local multiplexer helper can create and send commands to Herdr, tmux,
  and cmux panes. It does not support Zellij and derives a pane's working directory
  from `process.cwd()`. An integration for arbitrary Pi project directories must use
  `ctx.cwd` and either add Zellij deliberately or invoke upstream's Zellij wrapper.
  [Local multiplexer detection, lines 1–59](../../extensions/shared/multiplexer.ts#L1-L59)
  and [operations, lines 212–236](../../extensions/shared/multiplexer.ts#L212-L236),
  [upstream tmux/Zellij/Herdr wrappers](https://github.com/agavra/tuicr/tree/v0.21.0/skills/tuicr).

- tuicr's TOML configuration is separate from Pi's JSON configuration:
  `$XDG_CONFIG_HOME/tuicr/config.toml` (normally `~/.config/tuicr/config.toml`) and
  optional local themes live under tuicr's config directory. Sharing Pi's Deep Space
  palette would require a separate tuicr theme; it is cosmetic, not an integration
  prerequisite. [tuicr configuration](https://github.com/agavra/tuicr/blob/v0.21.0/docs/CONFIG.md).

- `:submit` can post a review to a forge. Treat that as a separate, explicitly
  authorized external action. The session CLI is safe for local review state, but
  it must not be wired to automatic submission. [Submission prerequisites](https://github.com/agavra/tuicr/blob/v0.21.0/README.md#export-your-review).

## Plausible integration paths

| Path                                    | How it works                                                                                                                                                                                                                                             | Benefits                                                                                                                 | Tradeoffs                                                                                                                                                                                             |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1. Pin upstream skill (recommended)** | Copy the complete upstream `skills/tuicr/` directory from a reviewed `v0.21.0` source snapshot into `agent/skills/tuicr/`. Restart Pi so it discovers the skill. The skill supplies behavior guidance and the tmux, Zellij, and Herdr launch wrappers.   | Smallest durable change. No custom protocol. It uses tuicr's intended agent interface and preserves its lifecycle rules. | The user must review and pin the imported skill. It still needs an active multiplexer for automatic pane creation.                                                                                    |
| **2. Manual TUI plus CLI attachment**   | The user runs `tuicr -w` or another target in a normal terminal. Pi uses `review list` and `review comments` after the user says the session is ready.                                                                                                   | Zero Pi code or settings changes. Works now even without a multiplexer.                                                  | The user switches terminals manually and must start the TUI.                                                                                                                                          |
| **3. Small Pi extension**               | Add a human-invoked `/tuicr` command to launch the proper upstream wrapper, plus narrow model tools for `list` and `comments`. Add a write tool only with explicit confirmation. Track launched panes/processes and clean them up on `session_shutdown`. | One Pi-native entry point, structured results, and explicit safety gates.                                                | More code to maintain: multiplexer detection, Zellij parity, process/pane teardown, JSON validation, and command-name conflicts. Use `execFile`/argument arrays rather than interpolated shell input. |
| **4. Rust bridge to `ReviewStore`**     | Build a native helper or N-API/IPC bridge from the TypeScript extension to tuicr's Rust library.                                                                                                                                                         | Could eliminate child-process parsing.                                                                                   | Not justified: the official JSON CLI already provides the needed operations. It adds a Rust toolchain, ABI/version coupling, and failure modes.                                                       |

## Recommended rollout

1. Use path 2 immediately for one review: start tuicr separately, then have Pi attach
   with `review list` and read `review comments`.
2. If the workflow is useful, adopt path 1 at a fixed `v0.21.0` revision. Keep the
   upstream skill unchanged initially so its wrappers and lifecycle assumptions remain
   auditable.
3. Restart Pi inside tmux, Zellij, or Herdr when automatic pane creation matters. The
   upstream skill handles all three and falls back to asking the user to launch tuicr
   when none is active.
4. Build path 3 only after repeated use demonstrates that the manual launch step is
   the actual pain point. Keep launch human-invoked and keep remote `:submit` outside
   the extension's automatic flow.

## Source note

All external sources above are first-party tuicr repository documentation or source
at `v0.21.0`. Local citations point to the installed Pi `0.84.1` documentation and
this repository's source/configuration. The local `node_modules` links are generated
by `npm ci` from the pinned dependency in `package.json`.
