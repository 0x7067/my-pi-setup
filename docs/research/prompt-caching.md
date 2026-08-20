# Prompt caching in this Pi setup

Research and measurement pass on 2026-08-17 (Pi 0.84.2). Four read-only
audits ran in parallel: runtime cache mechanics, extension volatility, session
log measurement, and provider documentation. This page records what was found,
what was changed, and which levers stay opt-in.

## Result

The setup already reuses 89–99% of prompt tokens on every measured
provider. The remaining losses are provider-side (cache-node eviction on
Synthetic and Devin) or structural (compaction, model switches). Applied: scoped
long cache retention for OpenRouter and Anthropic, an xAI affinity header
(`extensions/prompt-cache/index.ts`), and OpenRouter session-affinity headers in
`models.json`. Levers left as-is are listed with their tradeoff.

## Measured baseline

Source: 79 session files, 3,697 assistant turns, 2026-07-31 to 2026-08-17.
Hit rate = `cacheRead / (input + cacheRead)`. No provider reports cache-write
tokens in these logs. `post-1 in` is the average uncached input per turn after
the first turn of a session, which is the best proxy for "re-billed prefix".

| provider/model             | turns | hit % | post-1 in | uncached in |   cacheRead | cost $ | loss channel                                |
| -------------------------- | ----: | ----: | --------: | ----------: | ----------: | -----: | ------------------------------------------- |
| synthetic/syn:large:text   |   930 |  95.1 |     4,680 |   4,886,514 |  93,915,904 |  21.84 | drip 2.5M, 5 breaks 411k                    |
| synthetic/syn:large:vision |   280 |  94.6 |     3,361 |   1,048,139 |  18,188,608 |  12.53 | 4 breaks 251k (1 compaction)                |
| openai-codex/gpt-5.6-sol   |    48 |  91.5 |     3,902 |     214,743 |   2,321,408 |   3.59 | 1 break 12k                                 |
| devin/swe-1-7-lightning    |    69 |  99.0 |         0 |      69,673 |   7,028,096 |   2.01 | none                                        |
| kimi-coding/k3             |    29 |  92.6 |     4,028 |     136,554 |   1,701,818 |   1.20 | drip 50k                                    |
| openai-codex/gpt-5.6-luna  |   265 |  89.3 |     4,239 |   1,314,524 |  10,938,368 |   1.12 | 3 breaks 78k (compaction 60k), drip 275k    |
| deepseek/deepseek-v4-flash | 1,001 |  99.2 |       748 |   1,472,010 | 178,648,064 |   0.89 | 1 break 214k (compaction)                   |
| synthetic/syn:small:text   |   141 |  93.9 |     2,047 |     410,538 |   6,371,520 |   0.18 | 1 break 21k, drip 85k                       |
| kimi-coding/k3-256k        |   167 |  96.9 |     2,010 |     429,551 |  13,526,016 |   0.00 | drip 134k                                   |
| devin/swe-1-7              |   756 |  97.7 |     1,782 |   1,564,529 |  66,781,056 |   0.00 | 9 breaks 878k (303k idle >5 min), drip 228k |

Total spend $43.41. Total re-billed prefix tokens: 1.9M from full breaks and
3.3M from partial drops ("drip"), most of it on flat-rate providers.

Where the losses come from:

- Every cold start is a session start or a mid-session model change. None
  are unexplained.
- 16 of 18 unexplained full breaks happen mid tool-loop on the same model,
  with no user turn, no session event, and an idle gap under 4 minutes.
  After the break, `cacheRead` resets to a small constant (64–704 tokens): the
  static system/tool prefix survives on a fresh backend node and the
  conversation-specific prefix is gone. This is provider-side eviction or
  routing, not a content change on our side.
- 99% of Synthetic drip loss happens after turn 6, and 61% of it comes from a
  handful of near-total evictions of large (100k+) contexts. The Synthetic
  web-search tool activation race (see below) is not visible in the data:
  turn-2 loss is 0.8%.
- DeepSeek, the default model, re-bills about 750 tokens per turn. That is
  the new turn content itself. There is nothing left to win there except
  compaction, which is a one-time break by design.

## How the setup keeps prefixes stable

The runtime (Pi 0.84.2) already does the right things; the audit confirmed
them rather than fixing them:

- The system prompt is built once per session from static parts: base
  instructions, tool descriptions, `AGENTS.md`, skills, then
  `Current working directory` last. No date, time, git status, or random ID
  is included (`pi-coding-agent/dist/core/system-prompt.js`).
- Steering and follow-up messages are appended to the end of the message
  list, never inserted earlier (`pi-agent-core/dist/agent-loop.js`).
- Tools activated mid-session are appended in registration order; the array
  is never re-sorted (`agent-session.js` `setActiveToolsByName`).
- Anthropic-format requests get three breakpoints: system, last tool, last
  user message. Kimi (`kimi-coding`) uses the same path.
- OpenAI Responses and Codex requests send `prompt_cache_key` = session ID,
  `store: false`, and `include: ["reasoning.encrypted_content"]`.
- `transport: "websocket-cached"` makes Codex requests send only the input
  delta with `previous_response_id`; it silently falls back to a full send if
  any prior message changed.
- DeepSeek requests always replay `reasoning_content` on assistant messages, so
  history is byte-identical between turns.

The extension audit found no extension that injects volatile text into the
system prompt or tools. Dynamic data (git status, cost, quota, clock) is
written only to TUI widgets. The remaining event-gated cache breaks are:

| source                                           | when it breaks                                    | verdict                                                   |
| ------------------------------------------------ | ------------------------------------------------- | --------------------------------------------------------- |
| `extensions/toolbox-lazy/index.ts` `tool_search` | once, when a catalog is loaded (tools appended)   | intended; keeps ~30 KB of tools out of the default prefix |
| `pi-lens` `context` hook guidance injection      | one turn's new content re-billed once             | negligible; history before the injection is untouched     |
| `@aliou/pi-synthetic` web-search entitlement     | turn 2 if the quota check resolves after turn 1   | not visible in the data; left enabled                     |
| `openai-server-compaction`                       | rewrites payload for `openai/*` (direct API) only | inert; no direct OpenAI key is configured                 |
| compaction                                       | once per compaction                               | structural; `keepRecentTokens` keeps the tail verbatim    |

The `stats` extension already warns when a stable payload falls below 80%
reuse (`/stats prompt`) and `/stats summary` reports reuse per model.

## Applied changes

- `extensions/prompt-cache/index.ts` overrides the OpenRouter and Anthropic
  providers' `streamSimple` to pass `cacheRetention: "long"` (unless a caller
  such as compaction passes `none`). Pi then emits `cache_control.ttl: "1h"`
  for Anthropic-format requests and `prompt_cache_key` plus
  `prompt_cache_retention: "24h"` for OpenAI-format requests, for those two
  providers only. This is the scoped form of `PI_CACHE_RETENTION=long`, which
  is process-global and would also reach DeepSeek, Kimi, and Synthetic; Pi's
  changelog (#7676) records providers rejecting `prompt_cache_retention`, and
  the Synthetic extension's model definitions override `models.json` compat,
  so the env var cannot be gated. The 1h Anthropic TTL costs 2× on cache
  writes instead of 1.25× and keeps the prefix alive across idle gaps under an
  hour; the OpenAI 24h retention has no extra cost. Verified against a local
  fake endpoint: OpenRouter `anthropic/*` requests carry
  `{"type":"ephemeral","ttl":"1h"}`, OpenRouter `openai/*` requests carry the
  key and retention, and DeepSeek requests carry none of these fields.
- The same extension sends xAI's `x-grok-conv-id` header (session ID) so
  Grok requests keep cache affinity, as xAI's caching guide recommends.
- `models.json` sets `providers.openrouter.compat.sendSessionAffinityHeaders:
true`. Pi then sends `x-session-id` (the session ID) with OpenRouter
  requests, so OpenRouter can pin the whole session to the same upstream
  endpoint instead of relying on its first-message hash. That file is
  machine-local (gitignored), so re-apply the setting on a new machine.

## Levers left as-is

- `webSearch` in `extensions/synthetic.json` stays enabled. Disabling it would
  remove the turn-2 activation race and one tool from the prefix, but the data
  shows turn-2 loss on Synthetic is 0.8% and the tool is in use.
- Compaction thresholds (`compaction.reserveTokens` 16384,
  `compaction.keepRecentTokens` 20000) stay at defaults. Lowering
  `reserveTokens` delays compaction; it does not remove the break.
- Kimi (`kimi-coding`, Anthropic-format) does not get the 1h TTL: Moonshot's
  caching is automatic and acceptance of `cache_control.ttl` is undocumented.
  Add `"kimi-coding": "anthropic-messages"` to `LONG_RETENTION_PROVIDERS`
  after confirming.

## Provider cheat sheet

Facts from official docs on 2026-08-17. Cache read price is relative to
uncached input.

| provider                                   | mechanism                                                                   | min size / granularity          | TTL                            |              read price | client controls                                                                               |
| ------------------------------------------ | --------------------------------------------------------------------------- | ------------------------------- | ------------------------------ | ----------------------: | --------------------------------------------------------------------------------------------- |
| DeepSeek                                   | automatic disk cache; prefix units at request boundaries; exact match       | 64 tokens (secondary sources)   | hours to days, best effort     |                   ~1/50 | none; keep prefix identical                                                                   |
| OpenAI (≤5.5)                              | automatic prefix reuse                                                      | 1,024–2,048 tokens / 128 blocks | 5–10 min in memory, 24h opt-in |                    0.1× | `prompt_cache_key`, `prompt_cache_retention`, `allowed_tools` instead of tool array changes   |
| OpenAI (5.6+)                              | exact-match at breakpoints; `prompt_cache_key` required                     | —                               | 30 min, refreshed              |      0.1× (write 1.25×) | `prompt_cache_breakpoint`, `prompt_cache_options`                                             |
| Anthropic                                  | `cache_control` breakpoints (≤4), hierarchy tools → system → messages       | 512–4,096 tokens per model      | 5 min or 1h (`ttl`)            | 0.1× (write 1.25× / 2×) | breakpoints, `ttl`, `max_tokens: 0` pre-warm; tool changes invalidate all; thinking see notes |
| Kimi (Moonshot)                            | automatic                                                                   | —                               | not published                  |                   ~0.1× | none                                                                                          |
| Z.ai GLM                                   | automatic; reported in `prompt_tokens_details.cached_tokens`                | —                               | not published                  |                   ~0.2× | none                                                                                          |
| xAI Grok                                   | automatic from start of messages                                            | —                               | not published                  |               0.1–0.25× | `x-grok-conv-id` header, `prompt_cache_key`                                                   |
| OpenRouter                                 | passes provider caching through; sticky routing per session                 | provider rules                  | sticky session 10 min idle     |                provider | `x-session-id`, `cache_control` for Anthropic; reports `cache_discount`                       |
| Synthetic / Devin                          | undocumented; caching observed in usage                                     | —                               | —                              |                       — | none known                                                                                    |
| vLLM / llama.cpp                           | automatic prefix caching (vLLM default on; llama.cpp `cache_prompt`, slots) | block size                      | until eviction                 |                       — | keep prefix identical; llama.cpp `--slot-save-path`                                           |
| Anthropic notes (docs re-read 2026-08-18): |

- Minimum cacheable prefix per model: 512 tokens (Opus 5, Fable 5,
  Mythos 5); 1,024 (Sonnet 5, Sonnet 4.6/4.5, Opus 4.8); 2,048 (Opus 4.7,
  Haiku 3.5); 4,096 (Opus 4.5/4.6, Haiku 4.5). Below the minimum the request
  is silently uncached. This setup's prefix (~4k tokens after the 2026-08-18
  diet) clears every tier.
- Tool definition changes invalidate tools, system, and messages. Thinking
  and `effort` changes always invalidate messages; whether they also
  invalidate tools/system is model-specific. Thinking blocks are cached inside
  prior assistant turns and survive a non-tool-result user turn on
  Opus 4.5+/Sonnet 4.6+, but are stripped on earlier Opus/Sonnet and all
  Haiku, which drops every later message out of the cache.
- Writes happen only at breakpoints, and a read looks back at most 20 content
  blocks for a prior write. With Pi's single trailing breakpoint, a turn that
  appends more than 20 blocks (a large parallel tool burst) can miss despite
  identical history. TTL counts from the start of the request, not the end of
  the response.

Sources: DeepSeek https://api-docs.deepseek.com/guides/kv_cache/ ·
OpenAI https://developers.openai.com/api/docs/guides/prompt-caching ·
Anthropic https://platform.claude.com/docs/en/build-with-claude/prompt-caching ·
Z.ai https://docs.z.ai/guides/capabilities/cache ·
xAI https://docs.x.ai/developers/advanced-api-usage/prompt-caching ·
OpenRouter https://openrouter.ai/docs/guides/best-practices/prompt-caching ·
Manus https://manus.im/blog/Context-Engineering-for-AI-Agents-Lessons-from-Building-Manus ·
Anthropic https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents

## Rules for extensions in this repository

Prompt caching depends on the byte-exact prefix of system prompt, tools, and
earlier messages. When you write or vendor an extension:

1. Do not put dates, times, git state, quotas, cost, or random IDs in
   `systemPrompt`, tool descriptions, or `promptGuidelines`. Write them to
   `ctx.ui` widgets instead.
2. Do not modify or reorder existing messages in a `context` or
   `before_provider_request` handler. Append only. `context` changes are not
   persisted, so a message you insert this request is missing next request.
3. Call `pi.setActiveTools` only with the current order plus appended names.
   Let newly registered tools auto-append.
4. Register tools at load time with static descriptions. If a tool must be
   optional, put it in the `extensions/toolbox-lazy/config.json` catalog so
   activation happens once and deliberately.
5. Do not toggle `PI_CACHE_RETENTION`, thinking level, or model inside a
   session unless the user asks; each change re-bills the prefix.
6. Check `/stats prompt` after a change. A stable payload with reuse under
   80% is a regression.
