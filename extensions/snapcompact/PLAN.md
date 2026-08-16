# Snapcompact for pi — plan (copy the idea, reuse the Rust renderer)

> ## ⛔ SHELVED — 2026-08-16 (decision after adversarial review)
>
> The implementation is **not** being built. This plan is retained for the
> record; the renderer dependency is now Node-loadable (`shared/native-node.ts`,
> used by omp-natives), but an independent review (Codex, gpt-5.6-sol) found the
> rest of the idea does not survive contact with upstream pi:
>
> 1. **OpenAI fidelity (HIGH, likely fatal).** omp's `ImageContent` supports
>    `detail: "original"`; pi's `@earendil-works/pi-ai` has no such field and its
>    OpenAI adapter hardcodes `detail: "auto"`. Downscaling destroys pixel-font
>    glyphs, so the idea only works for Anthropic/Google models at best.
> 2. **Token accounting bypass (HIGH).** Frames injected via the `context` event
>    are ephemeral request content, absent from `agent.state.messages` — pi's
>    compaction threshold never sees them. 80 frames ≈ 400k estimated visual
>    tokens, enough to silently overflow an ordinary context window.
> 3. **Plaintext loss on re-compaction (HIGH).** Pixels are not a recoverable
>    source transcript. The plan persisted frames only; a second compaction or a
>    vision→text model switch would permanently lose earlier history. Plaintext
>    must be persisted alongside frames.
> 4. **Persistence model was wrong.** `pi.appendEntry` persists JSON but does not
>    add it to LLM context; a module-level map does not survive `/resume` and
>    leaks stale frames across branches. The durable carrier is
>    `CompactionResult.details`, keyed to the active branch.
> 5. **"Literal discarded text" is false.** pi's `serializeConversation`
>    truncates tool results to 2,000 chars and drops images; frames preserve
>    pi's lossy serialization, not the original conversation.
> 6. **Strategy B is not implementable.** Extensions get a read-only session
>    manager; `{ cancel: true }` aborts compaction but cannot trim messages,
>    create a boundary, or trigger the overflow retry.
>
> **Reopen only if:** pi's OpenAI adapter grows an original-detail image mode
> **and** the injection path gains a token-accounted carrier (a real
> pre-provider message that compaction counts). Until then this stays shelved.

Status: **shelved** (was: design only). The implementation is intentionally not built yet.

## What snapcompact is (the idea worth copying)

From `@oh-my-pi/snapcompact`: instead of asking an LLM to summarize discarded
conversation history, **serialize the history to compact text and render it
into dense PNG frames of pixel-font glyphs that a vision-capable LLM reads
back directly.** The whole pass is local and deterministic — no summarize-LLM
call, no API key, no latency beyond rendering.

Why it's interesting for pi:

- Default compaction pays a model call to summarize, and summaries lose
  detail. Snapcompact preserves the *literal* discarded text (tool results,
  code, decisions) as images the model can re-read on demand.
- Vision models bill images cheaply per-frame relative to the tokens they
  replace, and the pixel-font density is tuned (per-provider) to maximize
  recall per billed image token.

## What we reuse vs. reimplement

| Piece | Source | Disposition |
| --- | --- | --- |
| Text → PNG pixel-font renderer | `renderSnapcompactPng` in `@oh-my-pi/pi-natives` (Rust) | **Reuse verbatim** — already installed, verified working. |
| Supported-char probe | `snapcompactSupportedChars` in `@oh-my-pi/pi-natives` | **Reuse.** |
| Frame shape selection by model | omp `snapcompact.ts` `SHAPE_VARIANTS` / `idealShapeVariant` / `resolveShape` | **Copy the idea** (small pure-TS table). The only hard part is omp's `idealShapeVariant` calls `parseAnthropicModel`/`isFableOrMythos` from `@oh-my-pi/pi-catalog/identity` — replace with a 10-line regex on the model id (Claude/Gemini/GPT families). |
| Per-provider image-count budget | omp `PROVIDER_IMAGE_BUDGETS` / `providerImageBudget` | **Copy** (tiny constant table). |
| Conversation serializer | omp `serializeConversation` | **Do NOT copy.** pi already exports `serializeConversation` + `convertToLlm` from `@earendil-works/pi-coding-agent` (see `examples/extensions/custom-compaction.ts`). Use pi's. |
| Message/Api types | omp imports `Api, ImageContent, Message, TextContent` from `@oh-my-pi/pi-ai` | **Use pi's own types** (`@earendil-works/pi-ai`) — same lineage, compatible shapes. |
| `INTENT_FIELD` | omp imports from `@oh-my-pi/pi-wire` | **Drop.** Not needed; pi's `serializeConversation` already handles intent/role. |

Net: the *only* Rust dependency is `@oh-my-pi/pi-natives` (already installed for
`omp-natives`). No `@oh-my-pi/pi-ai`, `pi-catalog`, or `pi-wire` needed — we
use pi's equivalents. The vendored TS is a few hundred lines (shape table +
budget table + orchestration).

## The key constraint: pi's compaction return is string-only

`SessionBeforeCompactResult` is `{ cancel?: boolean; compaction?: CompactionResult }`
and `CompactionResult.summary` is a **string**. There is no slot for image
content blocks in the compaction return. So frames cannot ride inside the
summary message the way they do in omp (omp attaches them to the summary
message's content and re-attaches on every context rebuild via `preserveData`).

This is the single biggest adaptation. Two viable strategies:

### Strategy A — re-inject via the `context` event (recommended)

1. On `session_before_compact`:
   - Take `preparation.messagesToSummarize` + `turnPrefixMessages`.
   - `serializeConversation(convertToLlm(messages))` → compact text (pi's fns).
   - Chunk, `renderSnapcompactPng(chunk, shape)` per frame (Rust).
   - Persist frames (base64 PNGs + shape) in **extension session state**
     (`pi.appendEntry` / a module-level map keyed by session file), keyed as
     the "snapcompact archive" for this session.
   - Return `{ compaction: { summary: "<snapcompact archive: N frames attached>", firstKeptEntryId, tokensBefore } }`
     so pi records a minimal textual summary and keeps recent messages.
2. On every `context` event (fires each turn, "can modify messages"):
   - If an archive exists for this session, **prepend an assistant/user message
     whose content is the frame `ImageContent` blocks** (base64 `data:` URL or
     raw base64 per pi's `ImageContent` shape) ahead of the kept messages.
   - This is the analog of omp's `preserveData` re-attachment: the frames live
     in extension state and are re-attached on every context rebuild so the
     vision model always sees them.

**Why A:** fits pi's extension model cleanly; `context` is the documented hook
for modifying the message array sent to the provider; no fork needed.

**Risk to validate:** does pi's `context` event permit *adding* messages with
`image` content, or only mutating existing text? Must confirm the
`ContextEvent` return shape allows appending synthetic messages with image
blocks before building. If it only allows text mutation, fall back to B.

### Strategy B — cancel compaction and self-manage (heavier)

1. On `session_before_compact`, return `{ cancel: true }` to suppress default
   compaction entirely.
2. Manually trim the in-memory message list to the kept window and inject the
   frames as image content via the `context` event.
3. Persist the trimmed state so `/resume` reconstructs the same window.

**Why B:** full control over message content. **Why not B:** reimplements
pi's compaction bookkeeping (`firstKeptEntryId`, token accounting, retry on
overflow) — significant surface area and brittle across pi versions. Prefer A
unless `context` proves unable to carry image blocks.

## Frame budgeting (copy from omp, simplified)

```
PROVIDER_IMAGE_BUDGET = { anthropic: 80, google: 80, openai: 5, default: 5 }
FRAME_SIZE            = 2576   # default 5x8-bw shape, px
FRAME_TOKEN_ESTIMATE  = 5024   # tokens represented per frame (not billed tokens)
MAX_FRAMES_DEFAULT    = 80
```

- Resolve shape from the active model id: Claude → `8on16-bw` (or `1932` for
  Opus 4.7+/Fable/Mythos high-res), Gemini → `8on22-bw`, GPT → `8on22-bw`,
  unknown → Anthropic shape. (omp's exact table; reimplement with regex.)
- Cap frame count at `min(providerImageBudget(model), MAX_FRAMES_DEFAULT)`.
- Drop the oldest frames first when over budget (FIFO), keeping the most
  recent history densest.

## Open questions to resolve before implementing

1. **`context` event image support.** Confirm pi's `ContextEvent` handler can
   return a message array containing synthetic messages with `image` content
   blocks. This determines A vs B. (Check `dist/core/extensions/types.d.ts`
   `ContextEvent` / `ContextResult`.)
2. **`ImageContent` shape in pi.** Does pi's `@earendil-works/pi-ai`
   `ImageContent` take `{ type: "image", source: { data: base64, mediaType } }`
   (Anthropic shape) or `{ type: "image_url", image_url: { url: "data:..." } }`
   (OpenAI shape)? `renderSnapcompactPng` returns base64; the block must match
   what pi's provider wire layer expects for the active model.
3. **Persistence across `/resume`.** Extension session state via
   `pi.appendEntry` survives restart; confirm frames re-attach after resume
   and after a *second* compaction (archive grows — decide: re-render the
   union of old archive + newly discarded messages each compaction, replacing
   the prior archive, so frame count stays bounded).
4. **Non-vision models.** If the active model has no image input, frames are
   useless. Fall back to pi's default compaction (return nothing from the
   handler) for non-vision models. Gate the whole extension on
   `model.input.includes("image")`.
5. **Overflow-retry correctness.** When `reason === "overflow"` and
   `willRetry`, the retried turn needs the frames in-context *immediately*.
   Confirm the `context` event fires before the retry turn so injection lands
   in time.

## Proposed file layout

```
~/.pi/agent/extensions/snapcompact/
├── package.json          # dep: @oh-my-pi/pi-natives
├── PLAN.md               # this file
└── index.ts              # WIP — see milestones below
```

## Milestones (when we build it)

1. **Shape + budget tables** (pure TS, ~60 lines). Copy omp's `SHAPE_VARIANTS`
   subset and `PROVIDER_IMAGE_BUDGETS`; regex-based `resolveShape(modelId)`.
2. **Render smoke.** `serializeConversation` on a fixture →
   `renderSnapcompactPng` → write PNGs to disk; confirm legibility by eye.
3. **`session_before_compact` handler.** Serialize, render, persist frames in
   extension state, return minimal string summary. No re-injection yet.
4. **`context` re-injection.** Prepend image-block message from persisted
   frames. Validate open question #1 and #2 here.
5. **Vision-model gating + non-vision fallback.**
6. **Budget enforcement + multi-compaction archive replacement.**
7. **`/resume` persistence validation.**

## What we are NOT doing

- Not vendoring `@oh-my-pi/snapcompact` wholesale. It drags `pi-ai`/`pi-catalog`/
  `pi-wire` types and omp-specific message shapes; pi has native equivalents.
- Not building a local GGUF summarizer. Snapcompact's whole point is to skip
  the summarize-LLM call.
- Not touching SIXEL here (that's a separate TUI-integration task; the
  `encodeSixel` native fn is available but inline image rendering in a TUI
  app needs redraw coordination).
