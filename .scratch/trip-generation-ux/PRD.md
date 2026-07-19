Status: ready-for-agent

# PRD: Trip generation wait experience (local-first validation + staged progress)

## Problem Statement

When a user pastes a Chinese trip description on the app home page and starts **Trip generation**, they face a long, opaque wait. The overlay shows a single static message ("about 10–30 seconds") while the backend may run multiple LLM rounds (generate, validate, repair, repeat). Users cannot tell whether the system is working, stuck, or how far along it is. For many trips that are already structurally sound, this extra latency is unnecessary because local structure checks could approve the result without additional model calls.

## Solution

Improve **Trip generation** in two phases:

1. **Backend (first):** Apply **local-first validation** so structurally valid trips take the **fast path** (typically one LLM call). Only fall back to LLM validate/repair when local checks fail. Extend the generate API response with **generation stages** and a **generation profile** for tests and developer observability (not shown to end users).
2. **Frontend (second):** Replace the static overlay with a **fixed-timeline generation stage** list (four user-visible steps) that advances on a time schedule while the request is in flight, then completes when the response returns.

Users still land on the **Trip** page with **generation notes** when review is needed; product semantics for `needsReview` / best-effort generation are unchanged.

## User Stories

1. As a traveler creating a new Trip, I want generation to finish sooner when my text is already well-formed, so that I spend less time staring at a loading screen.
2. As a traveler, I want to see clear progress steps during generation, so that I know the app is working and not frozen.
3. As a traveler, I want progress steps to advance at predictable intervals, so that I have a sense of how long I might still wait.
4. As a traveler, I want the loading UI to complete smoothly when generation finishes early, so that I am not left on a stale step.
5. As a traveler, I want the loading UI to keep reassuring me if generation takes longer than expected, so that I do not assume the app crashed.
6. As a traveler, I want to still receive a usable Trip when automatic repair cannot fully validate my text, so that I can edit manually rather than getting a hard failure.
7. As a traveler, I want **generation notes** on the Trip page to tell me when to double-check dates or prices, so that I know whether the output is trustworthy.
8. As a traveler, I do not want to see internal debug metrics (LLM call counts, fast-path labels), so that the experience stays simple.
9. As a developer, I want generation responses to include a **generation profile**, so that I can verify fast path vs repair path in tests and logs.
10. As a developer, I want generation responses to include **generation stages** with done/skipped status, so that the frontend can align post-hoc and future real streaming can reuse the same shape.
11. As a developer, I want **generation cases** with mocked LLM fixtures, so that CI can regression-test generation without live Azure OpenAI calls.
12. As a developer, I want fast-path behavior locked by tests, so that optimizing latency does not silently reduce output quality.
13. As a developer, I want repair fallback still covered by tests, so that messy inputs remain handled.
14. As a maintainer, I want an ADR documenting local-first validation, so that future contributors understand why validate/repair is conditional.
15. As a maintainer, I want deployment gates (`npm test`) to include generation cases, so that generation changes cannot ship broken.
16. As a traveler using the home page example text, I want generation to feel responsive, so that the demo path reflects the improved workflow.
17. As a traveler with a complex multi-destination itinerary, I want the system to still attempt repair when local checks fail, so that destination grouping and checklist extraction remain accurate.
18. As a traveler, I want rate limiting on generation unchanged, so that abuse protections remain in place.
19. As a developer integrating the home page, I want the generate API contract backward-compatible for `tripId` and `trip`, so that existing clients keep working while new fields are additive.
20. As a developer, I want stage labels aligned with domain language (**generation stage**), so that UI copy matches CONTEXT.md vocabulary.

## Implementation Decisions

### Prerequisite: ADR

- Record the architectural decision in `docs/adr/0001-local-first-trip-generation.md` (**accepted** before implementation). This captures the trade-off between latency and quality.

### Phase 1 — Local-first validation (ship first)

**Pipeline change** inside trip generation orchestration:

```
initial LLM parse
  → normalize structure (existing normalization)
  → deterministic local issues check
  → if clean: fast path return (skip LLM validate/repair)
  → else: existing validate/repair loop (max 3 attempts) as fallback
  → attach generation notes (existing behavior; best-effort flag unchanged)
```

**Generation profile** (response metadata, developer-only — not rendered in UI):

```json
{
  "path": "fast" | "repaired" | "best-effort",
  "llmCalls": 1
}
```

- `fast`: local checks passed; no validate/repair loop.
- `repaired`: validate/repair loop ran and succeeded.
- `best-effort`: repair exhausted or validation unavailable; trip still returned with generation notes `needsReview`.

**Generation stages** (response metadata):

```json
[
  { "id": "parse", "label": "解析行程文本", "status": "done" | "skipped" },
  { "id": "extract", "label": "提取航班与住宿", "status": "done" | "skipped" },
  { "id": "organize", "label": "整理目的地与清单", "status": "done" | "skipped" },
  { "id": "review", "label": "复核结构", "status": "done" | "skipped" }
]
```

Map stage status to pipeline reality:

- Fast path: `parse`, `extract`, `organize` → `done`; `review` → `skipped` (local check substituted).
- Repair path: all four → `done` when repair runs.
- Best-effort: `review` → `done` even if validation imperfect.

**API contract:** `POST /api/trips/generate` remains `200` with `{ tripId, trip }`; add optional top-level `stages` and `generationProfile`. Keep these at the response top level (not only inside trip meta) so the home overlay can use them before navigation.

**Dependency injection for tests:** Expose generation orchestration through `__test` with injectable LLM dependencies, mirroring chat-cases passing mock LLM output into `buildChatResponse`. Prefer one orchestration entry (e.g. `generateValidatedTrip(text, deps?)`) over testing private helpers in isolation.

**Out of scope for Phase 1:** SSE streaming, async job queue, changing Table storage or trip JSON size limits.

### Phase 2 — Home page staged progress UI

**Overlay behavior:**

- Show four **generation stages** in a fixed timeline while `generateTrip` fetch is pending.
- Advance highlights at **0s → 5s → 12s → 20s** (configurable constants).
- After **30s**, show a secondary "still working…" message.
- On response: align steps with returned `stages`, then navigate to the Trip page.
- Do **not** display **generation profile** to users.

**Local dev proxy:** Return the same `stages` / `generationProfile` shape from the temporary local dev server when it calls test exports.

### Vocabulary

Use CONTEXT.md terms: **Trip**, **Trip generation**, **generation stage**, **local-first validation**, **fast path**, **generation notes**, **generation case**, **generation profile**.

## Testing Decisions

### What makes a good test

- Assert **observable outcomes**: response shape, `generationProfile.path`, `generationProfile.llmCalls`, stage statuses, and whether validate/repair mocks were invoked.
- Use **in-memory fixtures**; no live Azure OpenAI, no Table Storage, no HTTP for generation cases.
- Prefer the **highest seam**: mocked-deps generation orchestration via `__test`, matching chat-cases.

### Proposed test seams

| Seam | What it verifies | Priority |
|------|------------------|----------|
| `__test.generateValidatedTrip(text, deps)` | Fast path skips validate/repair; repair path invokes mocks; profile + stages | **Primary** |
| Local issue / normalization helpers | Edge cases only where orchestration tests are insufficient | Secondary |
| `POST /api/trips/generate` HTTP integration | Rate limit + persistence | Out of scope for generation-cases |
| Pure timeline helper for overlay (if extracted) | Step index at 0/5/12/20s | Optional |

**Prior art:** `api/test/chat-cases/` — table-driven cases, mock LLM, `node:test`, `npm test` gate in deploy skill.

### Minimum generation cases

1. Fast path: valid fixture → `path: fast`, `llmCalls: 1`, validate/repair not called, `review` stage `skipped`.
2. Local failure → repair success → `path: repaired`, `llmCalls` > 1.
3. Best-effort: validate/repair failure → trip returned, `path: best-effort`, generation notes `needsReview`.
4. All cases assert four stage ids with valid `done`/`skipped` status.

## Out of Scope

- SSE / WebSocket streaming progress.
- Async job polling (`jobId`).
- User-visible **generation profile**.
- Chat assistant workflow changes.
- Yunnan legacy APIs.
- Photos table split (TODO backlog).
- Live LLM tests in CI.

## Further Notes

### Delivery order

1. ADR (`docs/adr/0001-local-first-trip-generation.md`) — prerequisite
2. Phase 1 backend + generation-cases
3. Phase 2 frontend overlay
4. Manual smoke on home page example text

### Risks

- False fast path if local checks are too weak — mitigated by repair fallback and generation notes.
- Time-based UI is perceived progress until response returns — acceptable for Phase 2.

### Tracker

- PRD: `.scratch/trip-generation-ux/PRD.md`
- Status: `ready-for-agent`
