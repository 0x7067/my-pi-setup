# Browser Relay

This extension gives Pi an authenticated, loopback-only bridge to existing
Chrome tabs, including their signed-in state.

Run `/browser-relay setup`, load `chrome-extension/` as an unpacked Chrome
extension, and paste the displayed token into its options. The token lives in
`~/.pi/agent/browser-relay.key` with mode `0600`; it is ignored by Git.
Click the extension's toolbar icon on each tab you want to share; a `PI` badge
marks shared tabs. Click it again to revoke access.

The `browser-relay` tool can list tabs, capture accessibility snapshots,
navigate, click or type against snapshot node IDs, press keys, scroll, evaluate
JavaScript, return PNG screenshots, create/activate/close shared tabs, send
tab-scoped Chrome DevTools Protocol commands, and drain bounded debugger events.
The CDP and event operations support console, network, emulation, performance,
CPU/heap profiling, dialog, upload, hover, and drag workflows. Page-changing
calls require an exact tab ID and automatically return a new semantic snapshot.

`events` keeps at most 1,000 events and 4 MiB per tab, reports dropped events,
returns at most 200 events per call, and drains returned events by default.
Enable the corresponding CDP domain before collecting its events. Exact
Lighthouse scoring is not included; it is an analysis layer above CDP rather
than a browser-control capability.

The advanced CDP surface includes reviewed tab-scoped methods from
Accessibility, Audits, CSS, DOM, Emulation, Fetch, HeapProfiler, Input, Log,
Network, Overlay, Page, Performance, Profiler, and Runtime. Browser-wide
Browser, Target, Storage, Tracing, Extensions, cookie/cache management, crash,
raw navigation, download-policy, streamed-body, and heap-snapshot commands stay
blocked so CDP cannot bypass the per-tab sharing or bounded-output boundaries.
Use the validated `navigate` operation for HTTP(S) navigation.

The first Pi process starts the server on `127.0.0.1:9234`. Other Pi processes
reuse that server through its authenticated local HTTP API. Set
`PI_BROWSER_RELAY_PORT` to choose another port.

Security boundaries:

- The server binds only to IPv4 loopback.
- Chrome, Pi, and the server mutually authenticate with nonce-based HMAC proofs.
  The token never crosses a local connection.
- Only tabs explicitly shared with the toolbar icon are listed or attachable.
- A `newTab` tool call shares only the tab it creates; it does not expose other
  tabs.
- Chrome internal pages and extension pages are not exposed.
- Opening DevTools may detach a tab because Chrome permits one debugger owner.
- Any local process that obtains `browser-relay.key` can control attached tabs.
