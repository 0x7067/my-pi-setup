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
JavaScript, and return PNG screenshots. Page-changing calls require an exact
tab ID and automatically return a new semantic snapshot.

The first Pi process starts the server on `127.0.0.1:9234`. Other Pi processes
reuse that server through its authenticated local HTTP API. Set
`PI_BROWSER_RELAY_PORT` to choose another port.

Security boundaries:

- The server binds only to IPv4 loopback.
- Chrome, Pi, and the server mutually authenticate with nonce-based HMAC proofs.
  The token never crosses a local connection.
- Only tabs explicitly shared with the toolbar icon are listed or attachable.
- Chrome internal pages and extension pages are not exposed.
- Opening DevTools may detach a tab because Chrome permits one debugger owner.
- Any local process that obtains `browser-relay.key` can control attached tabs.
