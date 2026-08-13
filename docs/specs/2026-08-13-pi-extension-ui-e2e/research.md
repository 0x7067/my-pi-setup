# Research: end-to-end testing for Pi extension UI

Date: 2026-08-13

## Conclusion

Use two test layers backed by the same browser-terminal oracle. Keep focused component tests in-process and replay their ANSI writes into browser xterm.js. Add a small process-level suite that starts the installed `pi` CLI over child-process pipes, supplies the TTY properties Pi reads through a preload shim, feeds output into browser xterm.js, and drives commands and keys through stdin.

This is the smallest approach that covers both contracts:

- In-process tests cover component layout, input, resize, and seeded state matrices without starting the full CLI.
- Process tests prove that the packaged CLI selects interactive mode, loads the extension through `-e`, initializes the real TUI, receives terminal input, and exits cleanly.
- Playwright PNG comparisons make canonical composition and design-system consistency a required contract.

Reserve a real PTY suite for terminal-boundary defects or cross-platform certification. It is not required for the first useful harness.

Do not snapshot raw ANSI output as the default assertion surface. Inspect rendered cells for semantic contracts and compare canonical terminal PNGs for visual contracts. Assert raw writes only when escape-sequence order is the behavior under test.

## Scope and evidence standard

Verified facts below come from the installed workspace, the tagged Pi `v0.84.1` source, and first-party Node, xterm.js, and Microsoft sources. Recommendations are explicitly labeled as inferences.

## Verified facts

### The local project and installed Pi version

- This project pins `@earendil-works/pi-ai`, `@earendil-works/pi-coding-agent`, and `@earendil-works/pi-tui` to `0.84.1`. Its root test command already uses `node --test --experimental-strip-types`, then delegates to workspace tests. See [package.json](../../../package.json) and [package-lock.json](../../../package-lock.json).
- The installed coding-agent package identifies `pi` as `dist/cli.js`, requires Node `>=22.19.0`, runs upstream package tests with Vitest, and points to the official Pi repository. See [the installed package manifest](../../../node_modules/@earendil-works/pi-coding-agent/package.json) and the matching [tagged source manifest](https://github.com/earendil-works/pi/blob/v0.84.1/packages/coding-agent/package.json).
- The current local runtime is Node `v24.19.0`. The minimum supported Pi runtime is lower, so tests must avoid assuming a Node 24-only API unless CI explicitly pins Node 24.
- Neither browser xterm.js, Playwright, `@xterm/headless`, nor `node-pty` is currently installed in this workspace. Any selected renderer and runner would be new dev dependencies.

### Pi requires a TTY for the real interactive path

- Pi chooses print mode when either stdin or stdout is not a TTY. It chooses interactive mode only when both are TTYs and no explicit non-interactive mode wins. See [the installed mode selection](../../../node_modules/@earendil-works/pi-coding-agent/dist/main.js) and the matching [tagged source](https://github.com/earendil-works/pi/blob/v0.84.1/packages/coding-agent/src/main.ts).
- Once interactive mode is selected, Pi constructs `InteractiveMode` and runs its TUI. A normal `child_process.spawn()` call with piped stdio does not exercise this path because its streams are not terminal devices. This conclusion follows directly from the mode-selection code above.
- Pi documents `pi -e ./my-extension.ts` as the quick-test path. Extensions can register full TUI components with keyboard input through `ctx.ui.custom()`. Extensions execute with the user's full system permissions. See the [installed extension guide](../../../node_modules/@earendil-works/pi-coding-agent/docs/extensions.md) and the [tagged guide](https://github.com/earendil-works/pi/blob/v0.84.1/packages/coding-agent/docs/extensions.md).

### A local process spike reached interactive mode without a native PTY

- A disposable local spike launched the installed `dist/cli.js` with `child_process.spawn()` and piped stdio. A Node preload shim set `stdin.isTTY`, `stdout.isTTY`, `stdout.columns`, `stdout.rows`, and supplied `stdin.setRawMode()` before the CLI loaded.
- The spike loaded one disposable extension through `--no-extensions -e <path>`. Its `/e2e` command opened `ctx.ui.select()`. Scripted Down and Enter input selected `Beta`, the real TUI rendered `Picked: Beta`, and Ctrl+D shut down with exit code 0.
- The run used an isolated `PI_CODING_AGENT_DIR`, isolated session directory, `PI_OFFLINE=1`, and no provider or model call.
- This proves that Pi `0.84.1` does not require a kernel PTY for application-level interactive tests. A real PTY remains necessary only when the test target includes OS terminal plumbing, ioctl behavior, or platform-specific console behavior.

### Pi upstream's established terminal-test pattern

- Pi's TUI package runs TypeScript tests with Node's built-in runner. Its test-only terminal dependency is `@xterm/headless` `5.5.0`. See the [installed TUI manifest](../../../node_modules/@earendil-works/pi-tui/package.json) and [tagged manifest](https://github.com/earendil-works/pi/blob/v0.84.1/packages/tui/package.json).
- Upstream implements a `VirtualTerminal` on `@xterm/headless`. It fixes terminal dimensions, accepts simulated input, supports resize, flushes asynchronous writes, exposes the visible viewport, scrollback, and cursor position, and provides `waitForRender()` for Pi's throttled render pipeline. See [Pi's tagged `VirtualTerminal`](https://github.com/earendil-works/pi/blob/v0.84.1/packages/tui/test/virtual-terminal.ts).
- Upstream TUI tests assert rendered state through `VirtualTerminal.getViewport()`. When terminal protocol ordering matters, a `LoggingVirtualTerminal` also records raw `write()` calls. See [Pi's tagged TUI render tests](https://github.com/earendil-works/pi/blob/v0.84.1/packages/tui/test/tui-render.test.ts).
- Coding-agent tests reuse that same virtual terminal. For example, `interactive-tui.test.ts` records raw writes to detect alternate-screen entry and checks viewport text for copy confirmation. See [Pi's tagged interactive TUI test](https://github.com/earendil-works/pi/blob/v0.84.1/packages/coding-agent/test/interactive-tui.test.ts).
- Pi's extension tests usually stop below the process boundary. They create temporary extension resources, load them through the real discovery and runner code, then inspect or invoke registered commands and tools. See [extension discovery tests](https://github.com/earendil-works/pi/blob/v0.84.1/packages/coding-agent/test/extensions-discovery.test.ts) and [extension runner tests](https://github.com/earendil-works/pi/blob/v0.84.1/packages/coding-agent/test/extensions-runner.test.ts).
- Pi's source archive contains no `node-pty` use in its package tests. Its interactive-shell example suspends Pi's TUI and uses inherited stdio, leaving the user's existing terminal to host the child. That example is not an automated PTY harness. See [the interactive-shell example](https://github.com/earendil-works/pi/blob/v0.84.1/packages/coding-agent/examples/extensions/interactive-shell.ts).
- The published `@earendil-works/pi-tui` package excludes its `test/` directory. The upstream `VirtualTerminal` therefore cannot be imported from the installed package; a local harness must implement the small needed subset or the upstream helper must become a supported export.

### This repository's UI surfaces

The target extensions use several distinct Pi UI contracts, so a harness must cover components rather than only command registration:

- `ask-user` opens an interactive `ctx.ui.custom()` component with editor input. See [extensions/ask-user/index.ts](../../../extensions/ask-user/index.ts).
- `background-terminals` installs a live widget with `setWidget()` and opens full-size overlays for its dashboard and detail view. See [extensions/background-terminals/index.ts](../../../extensions/background-terminals/index.ts) and [extensions/background-terminals/src/ui/ps.ts](../../../extensions/background-terminals/src/ui/ps.ts).
- `workflows` opens a full-size overlay dashboard. See [extensions/workflows/dashboard.ts](../../../extensions/workflows/dashboard.ts).

Existing tests mostly exercise domain and registration behavior. There is no installed terminal-emulation or PTY dependency and no process-level TUI harness in the repository.

### Node test runner capabilities

- At Pi's minimum Node `22.19.0`, `node:test` supports TypeScript test discovery, isolation in child processes by default, configurable file concurrency, hooks, subtests, test-name filtering, per-test timeouts, mocks, mock timers, reporters, watch mode, and experimental coverage. See the [Node 22.19 test-runner documentation](https://nodejs.org/download/release/v22.19.0/docs/api/test.html).
- Native TypeScript execution strips types. It does not type-check, honor `tsconfig` path aliases, transform JSX, or support every TypeScript syntax without `--experimental-transform-types`. Explicit file extensions are required. See [Node 22.19's TypeScript documentation](https://nodejs.org/download/release/v22.19.0/docs/api/typescript.html).
- Node's runner supports managed snapshot files and the `--test-update-snapshots` flag. Snapshot APIs evolved during Node 22, so the test harness must target the exact minimum CI minor or use plain fixture files plus `node:assert`. See [Node's snapshot-testing documentation](https://nodejs.org/docs/latest-v22.x/api/test.html#snapshot-testing).
- A child process can outlive a failed assertion unless cleanup is registered. Node reports asynchronous activity that continues after a test completes, reinforcing the need for `afterEach`/test cleanup and hard deadlines. See [Node's section on extraneous asynchronous activity](https://nodejs.org/download/release/v22.19.0/docs/api/test.html#extraneous-asynchronous-activity).

### PTY and terminal capture libraries

- Microsoft's `node-pty` creates real pseudo-terminals and exposes terminal read, write, and resize operations. Its stated use cases include making programs believe they are attached to a terminal so they emit control sequences. It supports Linux, macOS, and Windows through ConPTY, but it is a native module with platform build prerequisites and is not worker-thread safe. See the [official `node-pty` README](https://github.com/microsoft/node-pty#readme).
- `@xterm/headless` tracks terminal state in Node without a browser DOM. The xterm.js project labels it experimental. It emulates output but does not launch a process or create a PTY. See the [official headless package README](https://github.com/xtermjs/xterm.js/blob/5.5.0/headless/README.md).
- `@xterm/addon-serialize` can serialize an xterm framebuffer to text or HTML, but it is also marked experimental. Pi upstream does not need it: its helper reads buffer lines directly. See the [official serialize-addon README](https://github.com/xtermjs/xterm.js/tree/master/addons/addon-serialize).

### Browser rendering and visual comparison

- Xterm.js provides a browser terminal component, theming, terminal application compatibility, Unicode support, and a DOM mount through `Terminal.open()`. The `5.5.0` browser package is `@xterm/xterm`. See the [official xterm.js `5.5.0` documentation](https://github.com/xtermjs/xterm.js/tree/5.5.0).
- Playwright Test creates and compares screenshot baselines with `toHaveScreenshot()`. It waits for two consecutive stable screenshots before comparison and retains expected, actual, and diff images on failure. See [Playwright visual comparisons](https://playwright.dev/docs/test-snapshots) and the [`toHaveScreenshot()` API](https://playwright.dev/docs/api/class-pageassertions#page-assertions-to-have-screenshot-1).
- Playwright explicitly warns that browser screenshots vary with operating system, browser version, settings, hardware, and other factors. Baselines must be generated and compared in the same environment. See [Playwright visual comparisons](https://playwright.dev/docs/test-snapshots).

## Recommendations

These are design recommendations inferred from the verified behavior above.

### 1. Build a two-layer harness

Layer A: in-process terminal integration tests.

- Create a small recording `Terminal` modeled on Pi `v0.84.1` and replay its ANSI writes into browser xterm.js.
- Instantiate the relevant Pi TUI renderer or component with fixed dimensions.
- Drive input through the terminal/component input handler.
- Assert semantic viewport lines, cell styles, focus, cursor position, overlay visibility, resize behavior, and canonical PNGs.
- Use this layer for the broad state matrix because it is fast and avoids process startup, configuration, and native PTY variability.

Layer B: a narrow installed-CLI process suite.

- Launch the installed `pi` CLI with `child_process.spawn()` and piped stdio.
- Load a small Node preload shim that supplies fixed TTY dimensions, `isTTY`, and `setRawMode()` before Pi starts.
- Load exactly one extension with `--no-extensions -e <absolute-extension-path>`.
- Use `--no-session --no-context-files --no-approve` and `PI_OFFLINE=1`.
- Point `PI_CODING_AGENT_DIR` and `PI_CODING_AGENT_SESSION_DIR` at per-test temporary directories.
- Exercise only UI paths that do not require an LLM or provider credential: startup, slash commands, keyboard navigation, overlay close, resize, and clean exit.
- Feed every stdout chunk into browser xterm.js. Wait for its write callback before reading the buffer or capturing a screenshot.
- Use an IPC channel to update the shim's dimensions and emit `resize` when a test exercises resizing.

Layer C, deferred: a real PTY contract smoke.

- Add `node-pty` only if a defect escapes the pipe-backed suite or the project requires cross-platform terminal certification.
- Keep this suite to startup, resize, and clean shutdown. The application behavior is already covered above.

Pi documents all listed isolation switches and environment variables in the [installed usage guide](../../../node_modules/@earendil-works/pi-coding-agent/docs/usage.md) and [environment-variable guide](../../../node_modules/@earendil-works/pi-coding-agent/docs/environment-variables.md). The corresponding tagged sources are [usage.md](https://github.com/earendil-works/pi/blob/v0.84.1/packages/coding-agent/docs/usage.md) and [environment-variables.md](https://github.com/earendil-works/pi/blob/v0.84.1/packages/coding-agent/docs/environment-variables.md).

### 2. Use observable readiness, deadlines, and guaranteed cleanup

- Implement `waitForViewport(predicate, timeout)` around terminal write completion and viewport reads.
- Send the next key only after the expected prompt, command result, or overlay is visible.
- Give each process test a hard timeout.
- Register cleanup immediately after spawn. Send the application's normal exit key first, then terminate the child if it misses a short grace period.
- Run process tests serially at first. Serial execution prevents shared terminal/config state from hiding isolation defects.

Avoid fixed sleeps as the primary synchronization mechanism. Pi's upstream 20 ms settle helper is appropriate for its in-memory render throttle. A process-level test must synchronize on visible state because startup time varies.

### 3. Snapshot the stable contract

Required assertion surfaces:

- rendered cell text, foreground, background, emphasis, and geometry at fixed width and height;
- cursor coordinates and a small semantic state object where relevant;
- named PNG baselines for canonical design-system patterns;
- one visual baseline after each meaningful stable state, not after every key.

Control known volatile fields with deterministic fixtures. Do not rewrite the ANSI stream. If a real-feature screenshot still contains unavoidable volatility, mask only the named cell coordinates for:

- absolute temporary paths;
- Pi/package version if the test is not specifically about version display;
- elapsed time, clock time, token/cost counters, and transient spinner frames;
- terminal title or OSC metadata unless that is the contract.

Canonical design-gallery images must not use masks.

Keep raw ANSI assertions narrow and explicit. They are appropriate for alternate-screen entry, cursor visibility, bracketed paste, or escape ordering. They are too implementation-sensitive for routine UI copy and layout.

Require semantic cell-role assertions alongside PNGs for selection, focus, cursor position, clipping, and resize. A screenshot detects drift; the cell contract explains which design role or geometry rule failed.

### 4. Keep the dependency set small

Add only:

- `@xterm/xterm@5.5.0` as a dev dependency, matching Pi `v0.84.1`;
- `@playwright/test` for browser lifecycle and screenshot comparison.

Do not add another terminal snapshot framework. Playwright, `child_process`, browser xterm.js, and a small local helper cover the required behavior. `@xterm/addon-serialize` is unnecessary unless direct buffer extraction proves insufficient.

If later evidence requires real terminal transport, add `node-pty` only for that narrow suite.

An OS wrapper such as `script` can avoid a native Node dependency on a tightly controlled Unix CI image. It is not a portable substitute: macOS and Linux variants differ, and it does not provide the same cross-platform API. Use it only if the project explicitly accepts a platform-limited suite.

### 5. Keep runner choice local

- Keep existing unit tests on their current Node or Vitest runners.
- Use Playwright Test only for the new functional E2E and visual suites.
- Do not migrate unrelated tests to standardize runners as part of this work.

### 6. Minimum acceptance matrix

Start with these cases:

1. The packaged CLI starts in interactive mode under the TTY shim and loads only the requested extension.
2. A slash command opens the expected extension overlay or custom UI.
3. Arrow keys or configured navigation change selection and keep the cursor/focus contract.
4. Enter confirms and Escape cancels or closes, with the expected result and restored base UI.
5. Resize produces a valid, unclipped viewport at one narrow and one normal width.
6. Regular and fullscreen TUI modes each get one smoke case if both modes are supported by the target extension.
7. The child exits and leaves no config, session, socket, timer, or subprocess outside the test's temporary directories.
8. Canonical surfaces match approved PNG baselines in the pinned visual environment.
9. Selected rows, action hints, borders, headings, and state colors resolve to the shared design roles.

Add raw escape-sequence cases only for behavior that cannot be stated through the viewport.

## Tradeoffs and open decisions

- **Terminal boundary:** the pipe-backed suite proves Pi's application-level TTY branch and real TUI behavior, but it does not prove OS PTY, ioctl, or ConPTY behavior. `node-pty` can add that boundary later at the cost of native installation and CI maintenance.
- **Renderer adapter:** the small recording-terminal and browser-xterm adapter creates a maintenance obligation. Pin it to xterm `5.5.0`, document Pi's upstream test helper as its origin, and review it when Pi upgrades.
- **Snapshot stability:** terminal snapshots are stable only when dimensions, locale, `TERM`, color capability, config, cwd, and data are controlled. Excessive normalization can hide regressions, so normalize an allowlist rather than stripping ANSI or arbitrary numbers globally.
- **Visual environment:** PNG comparison also requires a pinned browser, operating system, device scale, and font. Playwright documents that cross-environment rendering varies. Canonical baselines must therefore have one authoritative CI environment.
- **Project trust:** `--no-approve` prevents project-local resources from loading. The explicit CLI extension remains the intended quick-test path, but this interaction must be confirmed in the first process smoke test against the installed version.
- **CI scope:** run the pipe-backed process suite in one canonical environment first. Any later cross-platform terminal claim requires macOS, Linux, and Windows coverage because terminal and ConPTY behavior differ.

## What not to build yet

- No screenshot of a real terminal application window. Browser xterm.js provides a deterministic rendering of Pi's real ANSI stream without desktop-window variability.
- No generic terminal-driver framework.
- No full agent/provider conversation. The initial UI contract can be tested without API keys or nondeterministic model output.
- No broad golden recording of an entire Pi session. Small stable states produce more useful failures.
