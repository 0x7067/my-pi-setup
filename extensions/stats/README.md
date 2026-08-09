# Pi Stats

Pi Stats reads `~/.pi/agent/sessions/**/*.jsonl` and provides a local dashboard
plus a `pi-stats` tool. It records nothing and never modifies session files.

- `/stats` or `/stats dashboard` starts the token-protected dashboard.
- `/stats summary` shows the rollup inside Pi.
- `pi-stats` gives the active model aggregate usage when asked.

Metrics include requests, errors, tokens, cache reuse, recorded provider cost,
and breakdowns by model, provider, project folder name, and day. Forked session
entries are deduplicated by stable entry ID. Malformed or crash-truncated JSONL
lines are counted and skipped.

The server binds only to `127.0.0.1`, defaults to port `3847`, and falls back to
an ephemeral port when that port is busy. Its per-process token is included in
the URL shown by `/stats`; keep that URL private. Use `PI_STATS_PORT` or
`PI_STATS_SESSIONS_DIR` to override the defaults.

This implementation intentionally skips OMP's SQLite history database, React
client, latency/TTFT metrics, and cross-run persistence. The source Pi logs do
not currently contain latency fields, and scanning the local session set is
cheap.
