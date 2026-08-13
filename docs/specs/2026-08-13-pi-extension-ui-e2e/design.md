# Design: Pi extension and UI E2E harness

Date: 2026-08-13

Status: proposed and feasibility-tested

## Decision

Build one small, reusable test harness around the installed Pi CLI.

The harness will:

1. Start Pi in a child process with isolated configuration.
2. Use a preload shim to make the piped streams present the TTY properties Pi reads.
3. Load the extension under test with `--no-extensions -e`.
4. Send real slash commands and terminal key sequences through stdin.
5. Apply Pi's ANSI output to browser xterm.js in Playwright.
6. Assert the visible terminal viewport, cells, cursor, process result, and side effects.
7. Compare named terminal screenshots with committed visual baselines.

Visual checks are required, not optional failure artifacts. Keep focused in-process tests for state-heavy custom components. Do not add `node-pty` initially.

```text
Playwright Test
   │
   ├── keys and commands ───────────────┐
   │                                    ▼
   ├── spawn Node + TTY preload ──> installed Pi CLI ──> real extension
   │                                    │
   │                                    ▼
   └── cells + PNG baselines <── browser xterm.js <── ANSI stdout
```

This is application-level E2E. It crosses the process boundary and exercises Pi's CLI parsing, interactive-mode selection, extension loading, UI glue, renderer, input handling, and shutdown. It does not certify the operating system's PTY implementation.

## Why this design

Pi makes its terminal boundary unusually testable:

- The CLI selects interactive mode from `stdin.isTTY` and `stdout.isTTY`.
- The TUI reads dimensions from `stdout.columns` and `stdout.rows`.
- Raw-mode setup is reached through `stdin.setRawMode()`.
- Pi exposes deterministic extension loading through `--no-extensions -e <path>`.
- Pi upstream already uses xterm's headless renderer at `5.5.0` to inspect rendered terminal state. The browser package from the same release adds the DOM renderer needed for screenshots.

A local spike proved these seams are sufficient in Pi `0.84.1`. It exercised a real extension selector from the installed CLI and observed the confirmed result with exit code 0.

The design therefore stops before a native PTY dependency. Add one only if pipe-backed tests miss a real terminal defect.

Screenshots do not replace structural checks. A PNG detects visual change; cell-role assertions explain whether the change broke the design system.

## Test boundaries

### Process E2E

Use the process harness for behavior that must prove Pi integration:

- the extension loads from its shipped entry point;
- slash commands are registered and routed;
- `session_start` installs headers, footers, widgets, or status;
- `ctx.ui.select()`, `input()`, `confirm()`, and `custom()` receive keys;
- overlays capture and restore focus;
- notifications and results reach the viewport;
- regular and fullscreen renderers start and stop cleanly;
- extension shutdown handlers run;
- resize reaches the active renderer.

### In-process terminal integration

Use a recording `Terminal` plus the browser-terminal page for broad matrices that would make process tests slow or hard to seed:

- dashboard rows for many workflow, terminal, or subagent states;
- scrolling, clipping, selection retention, and narrow widths;
- live read-model updates;
- cursor position and input editing;
- unusual Unicode and ANSI content;
- component-level resize combinations.

These tests must instantiate the real component and real Pi TUI renderer. They may supply a deterministic read model.

### Existing unit tests

Keep parsers, reducers, managers, formatting, and process wrappers in current unit tests. The E2E harness must not duplicate those matrices.

### Visual design-system contract

Create one short `docs/ui-design-system.md` contract, then use this authority order:

1. `docs/ui-design-system.md` owns the intent and rules for hierarchy, density, spacing, borders, selection, action hints, overlays, and UI states.
2. `themes/deep-space.json` owns the color roles.
3. `extensions/shared/tui-style.ts` owns the reusable implementation of selected rows and action hints.
4. Approved visual baselines are canonical examples of those rules, not an undocumented substitute for them.

Every canonical surface must pass two checks:

1. A cell-level contract verifies design roles such as accent, dim text, selected background, border color, and full-row highlighting.
2. A PNG comparison verifies the composed result.

This prevents two weak outcomes: accepting a visually similar surface that bypasses shared roles, or accepting correct tokens in an inconsistent composition.

## Proposed files

```text
test/e2e/
  harness/
    fake-tty.mjs          # preload; no TypeScript loader dependency
    pi-process.ts         # lifecycle, input, readiness, cleanup
    terminal-page.ts      # browser xterm.js writes, cells, and screenshots
    design-contract.ts    # role and geometry assertions
  fixtures/
    ui-probe.ts           # exercises each Pi extension UI primitive
  pi-extension-ui.test.ts # Pi glue contract
  extensions.test.ts      # representative real-extension paths
test/visual/
  terminal.html           # fixed xterm host, font, background, and dimensions
  terminal.css
  design-system.test.ts   # canonical visual gallery
  snapshots/              # reviewed PNG baselines
docs/
  ui-design-system.md     # concise rules enforced by cells and PNGs
```

Add these development dependencies:

- `@xterm/xterm@5.5.0`, matching Pi `0.84.1` upstream;
- `@playwright/test`, which owns browser lifecycle and PNG comparison.

Vendor one OFL-licensed monospace font and its license under `test/visual/assets/`. Pi cannot control a user's terminal font, but the visual checker must control its font to produce meaningful pixel diffs.

Do not add another snapshot framework or a generic terminal DSL. Playwright is the single E2E and visual runner.

Add focused root scripts and include both check scripts in the existing `test` chain:

```json
{
  "scripts": {
    "test:e2e": "playwright test test/e2e",
    "test:visual": "playwright test test/visual",
    "test:visual:update": "playwright test test/visual --update-snapshots"
  }
}
```

Keep both check commands directly runnable. The root `test` script must call `test:e2e` and `test:visual` so neither suite can silently disappear from CI.

## Harness API

Keep the public test API small:

```ts
const app = await launchPi({
  extension: "extensions/generative-status/index.ts",
  columns: 90,
  rows: 28,
  tuiMode: "regular",
});

await app.waitForText("Assembling…");
await app.command("/loader");
await app.waitForText("Generative loader");
await app.expectScreenshot("loader-selector.png");
await app.press("down");
await app.press("enter");
await app.waitForText("Loader:");

assert.match(app.screenText(), /Loader:/);
await app.exit();
```

Required operations:

- `launchPi(options)`
- `write(text)`
- `command(text)`
- `press(key)` for named stable key sequences
- `resize(columns, rows)`
- `waitForText(text, options?)`
- `waitForScreen(predicate, options?)`
- `screenLines()` and `screenText()`
- `screenCells()` for foreground, background, emphasis, and geometry contracts
- `cursor()`
- `expectScreenshot(name)`
- `exit()`

Do not expose the child process or xterm instance until a test needs a lower-level contract.

## Child-process contract

Start the installed CLI through the current Node executable:

```text
node --import test/e2e/harness/fake-tty.mjs \
  node_modules/@earendil-works/pi-coding-agent/dist/cli.js \
  --offline \
  --no-extensions \
  -e <absolute extension path> \
  --no-session \
  --no-context-files \
  --no-skills \
  --no-prompt-templates \
  --no-themes \
  --no-builtin-tools \
  --no-approve \
  --tui-mode <regular|fullscreen>
```

Use a per-test temporary directory for:

- `cwd`;
- `PI_CODING_AGENT_DIR`;
- `PI_CODING_AGENT_SESSION_DIR`;
- TUI write logs when a failing test requests them.

Set deterministic environment values:

```text
CI=1
FORCE_COLOR=3
TERM=xterm-256color
LANG=C.UTF-8
PI_OFFLINE=1
PI_TELEMETRY=0
PI_SKIP_VERSION_CHECK=1
PI_REDUCED_MOTION=1
```

The isolated `settings.json` must set `quietStartup: true`. Tests that exercise the project's theme can copy only that theme and opt into it explicitly.

Build the child environment from a small allowlist such as `PATH`, `HOME`, `TMPDIR`, `SHELL`, and locale variables, then add the deterministic values above. UI tests do not need provider credentials. Inherited credentials create nondeterministic model availability and risk accidental calls.

## TTY preload

`fake-tty.mjs` runs before Pi. It must:

- set `process.stdin.isTTY = true`;
- provide `process.stdin.setRawMode(raw)` and track `isRaw`;
- set `process.stdout.isTTY = true`;
- expose writable `columns` and `rows` values from initial environment variables;
- listen for resize messages on the child IPC channel;
- update dimensions and emit `resize` on stdout;
- leave normal pipe reads and writes intact.

The shim must not patch timers, filesystem calls, networking, or Pi modules.

Pi's keyboard-protocol queries may appear in stdout. Browser xterm.js will consume them as terminal output. Tests do not need to reply unless the behavior under test specifically depends on Kitty keyboard negotiation.

## Browser terminal and assertions

Mount `@xterm/xterm` in one fixed Playwright page. Required features are:

- fixed initial dimensions;
- ANSI writes into browser xterm.js;
- asynchronous write flushing;
- visible viewport extraction;
- full scroll-buffer extraction for diagnostics;
- cell foreground, background, and style extraction;
- cursor position;
- resize;
- optional raw-write recording.

Do not strip ANSI with a regular expression for final-state assertions. A regex loses cursor movement, clearing, overlays, and differential rendering. Let xterm apply the stream, then inspect its buffer.

Use semantic assertions by default:

- the screen contains a heading or notification;
- one row is selected;
- the cursor is within an input field;
- a closed overlay no longer appears;
- all visible lines fit the configured width;
- the base editor regains focus after closing custom UI.

Use screenshots for the canonical design gallery and a few high-value interaction states. Make the gallery deterministic with fixed fixtures, paths, dimensions, state, and reduced motion.

Do not rewrite the ANSI stream. Changing text length can corrupt cursor movement and differential rendering. If a real-feature screenshot still contains unavoidable volatile values, mask only named cell coordinates for:

- temporary paths;
- elapsed time;
- token and cost counters;
- package version when version is outside the test contract;
- animation frames when reduced motion cannot freeze them.

Never mask layout, color, selection, borders, action hints, truncation, or empty space. Those are the visual contract.

Canonical design-gallery images must not use masks. Build those states from deterministic probe data so every design role remains visible.

## Screenshot contract

Capture only the terminal container, not an arbitrary browser viewport. The container must have:

- exact terminal columns and rows;
- the Deep Space background;
- the pinned test font at a fixed size and line height;
- device scale factor 1;
- cursor blink disabled;
- transitions and motion disabled;
- no browser chrome, padding, or shadows outside the terminal surface.

Use Playwright's `toHaveScreenshot()` for baseline creation and comparison. It waits for two consecutive stable screenshots before comparing. Browser rendering can vary across operating systems and hardware, so generate and compare the authoritative baselines in one pinned Linux Chromium environment. Local macOS screenshots are useful for inspection but must not update the canonical baselines.

Start with exact comparison in the canonical environment. If the pinned environment still produces a verified antialiasing-only drift, allow the smallest measured `maxDiffPixels` value and document the reason. Do not set a percentage threshold that can hide a displaced row or wrong background.

On a mismatch, retain Playwright's expected, actual, and diff images. The test failure must also print the semantic cell-role failure when one exists.

Baseline updates are an explicit review action:

1. Run `npm run test:visual:update` in the canonical visual environment.
2. Review expected, actual, and diff images together.
3. Commit the changed baseline with the UI source change.
4. State which design-system rule changed, or confirm the change preserves the existing rule.

Never auto-approve new baselines in CI.

On failure, print:

- the current viewport with row numbers;
- the last 100 input and output events;
- child stderr;
- exit code and signal;
- temporary artifact path when retention is enabled.

## Synchronization

Never sequence process input with fixed sleeps alone.

Each action must wait for a visible state:

1. Wait for the base editor or extension startup marker.
2. Send a command.
3. Wait for its selector, overlay, or notification.
4. Send the next key.
5. Wait for the resulting stable state.

`waitForScreen()` must subscribe to completed xterm writes and evaluate immediately after each flush. Use a short polling fallback only for state changes that request a Pi render without producing an immediate output chunk.

Default deadlines:

- 5 seconds for startup;
- 2 seconds for an ordinary UI transition;
- 10 seconds for the whole test;
- 500 milliseconds for graceful exit before termination.

## Cleanup and safety

Register cleanup immediately after spawn.

Normal cleanup:

1. Send Escape until no extension overlay is active when the test knows one is open.
2. Send Ctrl+D on an empty editor.
3. Wait for exit.
4. Send `SIGTERM` after the grace period.
5. Fail if the child still survives or created files outside its temporary roots.

Run process E2E files serially at first. This makes leaked process, socket, and global configuration failures obvious.

Never load all user extensions during a test. Always combine `--no-extensions` with one or more explicit `-e` arguments.

## Initial acceptance suite

### One UI-probe contract test

Load an E2E-only fixture extension that exposes commands for:

- notification;
- select and cancel;
- input and confirm;
- widget placement;
- header and footer installation;
- custom overlay focus and close;
- shutdown marker.

This single fixture proves Pi's UI bridge without depending on an extension's domain state.

### Representative real-extension tests

Start with four paths:

1. `ui-customization`: startup renders the custom header and footer at 90 columns.
2. `generative-status`: `/loader` opens the real selector and confirms a choice.
3. `workflows`: seed one workflow artifact, open `/workflows`, navigate, and close the overlay.
4. `background-terminals`: `/ps` with no processes renders its real empty-state notification.

Add component-level terminal tests for the populated background-terminal and subagent dashboards. Their live managers are not worth driving through an LLM or test-only production hooks.

### Canonical visual gallery

Commit one named baseline for each design-system pattern, using realistic content:

1. Base shell: custom header, empty editor, status row, and custom footer.
2. Choice: loader selector with one selected and one unselected row.
3. Full overlay: populated workflow overview with sidebar, panel, borders, and action hints.
4. Inspector: populated background-terminal detail with long output and truncation.
5. Input: ask-user or subagent takeover with focus and a visible cursor.
6. States: empty, loading, success, warning, and error treatments in one probe surface.

Each gallery test must assert the relevant roles before taking its screenshot. Examples:

- selected rows use `selectedBg` across the available row width;
- action keys use `accent`, labels use `dim`, and separators are consistent;
- primary borders use `border`, active borders use `borderAccent`;
- status colors come from `success`, `warning`, and `error` roles;
- headings, body text, and secondary metadata use their documented hierarchy;
- content never crosses a border or terminal edge.

The gallery is the reviewable design-system reference. Feature tests may add a screenshot only when they introduce a distinct pattern. Do not create a golden image for every branch of application logic.

### Layout matrix

Run only the highest-value combinations:

- regular mode at 90×28;
- fullscreen mode at 90×28;
- one narrow resize to 50×18 for a full-size custom overlay.

Do not multiply every extension by every size and renderer.

## CI plan

Phase 1:

- Run in the existing root `npm test` flow.
- Keep process and visual E2E serial.
- Pin Linux, Chromium, Node, locale, device scale, terminal dimensions, and the visual font.
- Compare committed canonical PNGs on every pull request.
- Upload expected, actual, diff, viewport, cell-role, and raw-write diagnostics on failure.

Phase 2, only if needed:

- Add one `node-pty` smoke on each supported OS.
- Verify true PTY startup, resize, and clean terminal restoration.
- Keep application behavior assertions in the pipe-backed suite.

## Rollout

1. Write the concise UI design-system contract from the existing theme and shared patterns.
2. Add `@xterm/xterm@5.5.0`, Playwright, the harness, and both test scripts.
3. Pin the canonical visual environment and font.
4. Add both suites to the root `test` chain.
5. Land the UI-probe contract and canonical gallery.
6. Add the four representative real-extension tests.
7. Add component terminal tests when a UI regression requires broader state coverage.
8. Review escaped terminal defects after several releases. Add `node-pty` only with evidence that it closes a real gap.

## Success criteria

The harness is successful when it catches these failures without an API key:

- an extension no longer loads from its entry point;
- a slash command stops opening its UI;
- selection or input keys reach the wrong component;
- a widget, header, footer, or overlay disappears;
- resize clips or corrupts the terminal screen;
- closing custom UI fails to restore the editor;
- a canonical surface drifts in palette, spacing, density, hierarchy, borders, selection treatment, or state treatment;
- a surface looks unchanged but stops using the shared design roles;
- Pi or an extension leaves the child alive after exit.

Both suites must remain small enough to run on every change. Target under 15 seconds for functional E2E and under 30 seconds for the canonical visual gallery after implementation proves actual timings.

## Deferred work

- Real PTY and ConPTY certification.
- Model-driven conversations.
- Golden recordings of full sessions.
- A general-purpose terminal automation framework.
- Test-only hooks in production extensions solely to seed UI state.

The research and primary-source evidence behind this decision are in [research.md](research.md).
