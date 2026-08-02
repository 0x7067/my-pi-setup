# A2A Room

This global Pi extension turns the current Pi session into the operator-facing
A2A room. Pi handles normal prompts; explicit `@claude`, `@codex`, and
`@cursor` mentions are routed through a local headless sidecar. Peer replies
return to the Pi transcript with compact native rendering.

The extension also provides the `delegate_to_agent` tool, peer completion,
room status, and the `/room-*` operator commands.

## Runtime requirement

Build and install the `a2a` binary from `/Users/pedro/Development/a2a`:

```sh
go install ./cmd/a2a
```

Run Pi from a trusted project. The extension is auto-discovered from this
directory and starts the sidecar on `session_start`. The room remains
localhost-only and unauthenticated.

## Source

The canonical package source lives in
`/Users/pedro/Development/a2a/pi-extension`. Keep `index.ts` synchronized with
that package when the room extension changes.
