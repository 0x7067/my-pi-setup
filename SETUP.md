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

The npm and git package sources in `settings.json` are pinned; `npm run doctor`
fails on an unpinned source. Run `pi install` with a new explicit version or
commit when intentionally upgrading a package.

Remote OpenAI compaction is vendored under
`extensions/openai-server-compaction` from upstream commit
`8a3de2f3b0c178fdd6f73f2f94172dfc3943e466`. Its local compatibility patch
filters null provider-header values introduced by Pi 0.84 before making remote
requests. Update the vendored source and its recorded upstream commit together.

The vendored Devin provider and its local cache-identity and privacy patches are
documented in [`extensions/devin-auth/README.md`](extensions/devin-auth/README.md).

## Prompt caching

Provider prompt caches depend on a byte-stable prefix (system prompt, tools,
earlier messages). The measured baseline, the runtime and extension invariants
that keep the prefix stable, and the applied levers (`extensions/prompt-cache.ts`
for scoped long retention and the xAI affinity header, `models.json` OpenRouter
session affinity) are documented in
[`docs/research/prompt-caching.md`](docs/research/prompt-caching.md). Check
`/stats prompt` after changing extensions or settings; a stable payload with
reuse under 80% is a regression.

## Web research

Hound provides the web search, fetch, crawl, and screenshot tools. Its skills
come from the pinned `git:github.com/dondai44423/master-fetch` package; its
extension is loaded on first use by `extensions/hound-lazy.ts` from that
package's checkout under `git/`, so the MCP process does not start until a
tool_search activates the `Hound web research` catalog.

## Private state

Harden existing credentials, sessions, and memory state after setup:

```sh
npm run privacy:harden
```

## fd and rg tools

The `file-search` extension registers `fd` and `rg` as model tools. No setup is normally needed: at startup it silently uses a system-installed `fd` (or `fdfind` on Debian/Ubuntu) and `rg` when available, or an existing fallback binary in `~/.pi/agent/bin/`. Only when neither exists does it download an official release binary (macOS/Linux, arm64/x64, over HTTPS) into `~/.pi/agent/bin/` and show a one-time notification. If your platform is unsupported, install `fd` and `rg` with your package manager and restart pi.

## Theme

The checked-in settings use the included Oxocarbon theme. To select it
manually while keeping your other settings:

```json
{
  "theme": "oxocarbon"
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

The pinned `@53able/pi-agent-browser` package in `settings.json` provides typed
tools for isolated browser sessions. Use the relay only when Pi needs a tab
from your existing signed-in Chrome profile.

## ai-memory

The generated `extensions/ai-memory.ts` bridge connects Pi to the local
ai-memory service at `127.0.0.1:49474`. Regenerate the bridge after an
ai-memory upgrade instead of editing it:

```sh
ai-memory install-hooks --apply --agent pi \
  --server-url http://127.0.0.1:49474 \
  --project-strategy repo-root \
  --config-file ~/.pi/agent/extensions/ai-memory.ts
```

## Stats

Run `/stats` to start the private, loopback-only usage dashboard or
`/stats summary` for an in-Pi rollup. The dashboard exists only while that Pi
session remains open and reads session JSONL files without modifying them.
