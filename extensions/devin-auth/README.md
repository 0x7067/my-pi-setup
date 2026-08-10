# Local Devin provider

This is `pi-devin-auth@0.1.2`, vendored from its published npm tarball. The
local patch scopes Cognition's session and cascade identifiers to Pi's stable
conversation ID. This prevents separate Pi conversations in the same process
from sharing cache identity and preserves identity across process restarts. It
also marks prompt content as unsafe for code telemetry in Cognition requests.
This remains disabled when Pi's global telemetry opt-out is enabled.

Cache accounting still comes from Cognition's response. Use
[Pi Stats](../stats/README.md) for aggregate cache reuse;
`showCacheMissNotices` in `settings.json` surfaces significant per-turn misses
after cache activity has been observed. Provider-side expiry, eviction, and
routing can still cause an isolated miss even when the client identity is
stable.
