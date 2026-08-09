# Setup

Clone or copy this repository to `~/.pi/agent`, then install the root and
workspace dependencies from the committed lockfile:

```sh
cd ~/.pi/agent
npm ci
```

Run the setup checks after installation:

```sh
npm run doctor
npm run check
npm test
```

The package sources in `settings.json` are pinned. Run `pi install` with a new
explicit version or commit when intentionally upgrading one of them.

Remote OpenAI compaction is vendored under
`extensions/openai-server-compaction` from upstream commit
`8a3de2f3b0c178fdd6f73f2f94172dfc3943e466`. Its local compatibility patch
filters null provider-header values introduced by Pi 0.84 before making remote
requests. Update the vendored source and its recorded upstream commit together.

## Firecrawl

The search, scrape, and crawl tools require a Firecrawl API key. Follow [Firecrawl's Node.js getting-started guide](https://docs.firecrawl.dev/quickstarts/nodejs) to create one, then copy the example environment file:

```sh
install -m 600 ~/.pi/agent/.env.example ~/.pi/agent/.env
```

Replace the placeholder in `~/.pi/agent/.env` with your API key.

If Firecrawl is not wanted, remove the Firecrawl extension and its workspace
entry instead of leaving a nonfunctional tool installed.

## Private state

Harden existing credentials, sessions, and memory state after setup:

```sh
npm run privacy:harden
```

## fd and rg tools

The `file-search` extension registers `fd` and `rg` as model tools. No setup is normally needed: at startup it silently uses a system-installed `fd` (or `fdfind` on Debian/Ubuntu) and `rg` when available, or an existing fallback binary in `~/.pi/agent/bin/`. Only when neither exists does it download an official release binary (macOS/Linux, arm64/x64, over HTTPS) into `~/.pi/agent/bin/` and show a one-time notification. If your platform is unsupported, install `fd` and `rg` with your package manager and restart pi.

## Theme

The checked-in settings use the included Rose Pine Moon theme. To select it
manually while keeping your other settings:

```json
{
  "theme": "rose-pine-moon"
}
```

Pi will load the extensions, skills, and theme from their directories the next time it starts.

## Browser relay

Run `/browser-relay setup` inside Pi. In Chrome, open `chrome://extensions`,
enable Developer mode, choose **Load unpacked**, and select the directory Pi
shows. Paste the private relay token into the extension options. The toolbar
badge reads `on` when the loopback bridge is connected.

The token is stored at `~/.pi/agent/browser-relay.key` with private file
permissions and is ignored by Git. Do not share it: a process with the token can
control tabs attached by the Chrome extension.

## Stats

Run `/stats` to start the private, loopback-only usage dashboard or
`/stats summary` for an in-Pi rollup. The dashboard exists only while that Pi
session remains open and reads session JSONL files without modifying them.
