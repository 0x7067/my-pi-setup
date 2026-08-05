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
