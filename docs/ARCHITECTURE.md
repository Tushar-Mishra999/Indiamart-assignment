# Architecture

## Overview

```
┌──────────────┐        multipart/form-data         ┌───────────────────┐
│  React / Vite │ ───────────────────────────────▶  │  FastAPI backend   │
│  frontend     │ ◀─────────────────────────────── │  (uvicorn)          │
└──────────────┘          JSON responses            └─────────┬──────────┘
                                                                │
                                   ┌────────────────────────────┼─────────────────────┐
                                   │                             │                     │
                             SQLite (cases,             Local filesystem        Anthropic Claude
                             decision_history,           (uploads/*.jpg…)        Messages API
                             appeal_messages)                                    (vision + text)
```

The backend is a single FastAPI process. There is no message queue or background worker: a moderation or appeal
request blocks on the Claude API call and returns the result synchronously. That's a deliberate simplification
for a prototype (see Limitations in `INTERVIEW_NOTES.md`) — swapping to a queue is the first scaling change.

## Request flow: initial moderation (`POST /api/moderate`)

1. `routers/moderation.py` validates the upload's content-type, size (`MAX_IMAGE_SIZE_MB`), and that Pillow can
   actually decode it as an image.
2. The raw bytes are written to `backend/uploads/{case_id}.{ext}` — a UUID, not the original filename, to avoid
   path traversal and collisions.
3. `claude_client.moderate_image()` base64-encodes the image, attaches it as an `image` content block alongside a
   text block containing the user-supplied name/description/intended_use/upload_purpose, and calls
   `messages.create()` with the **moderation system prompt** (`prompts/moderation_system_prompt.txt`).
4. Claude is instructed to respond with a single JSON object only (decision/category/explanation/evidence/
   uncertainty/confidence). The response is parsed by locating the outermost `{...}` and running `json.loads`;
   if parsing fails, or the Anthropic call raises at all (auth error, network error, rate limit, timeout), the
   function returns a hardcoded `FAILSAFE_RESULT` of `HUMAN_REVIEW` / `confidence: low` — **the code path that
   would auto-approve on failure does not exist**.
5. The result is persisted via `storage.create_case()`, which writes one row to `cases` and one row to
   `decision_history` (`source="initial"`). The API returns the full `CaseDetail`.

## Request flow: appeal (`POST /api/cases/{id}/appeal`)

1. The case must not already be `human_review_status = "resolved"` — closed cases can't be appealed further.
2. The user's message is stored first (`appeal_messages`, `role="user"`), then
   `claude_client.reassess_appeal()` is called with: the image (re-sent — Claude does not have persistent memory
   of the earlier call), the original decision/explanation, the full prior conversation, and the new message. It
   uses the **appeal system prompt** (`prompts/appeal_system_prompt.txt`), which explicitly instructs Claude to
   neither auto-accept the user's claim nor defend the earlier decision, and to respond with one of three
   actions: `REPLY` (keep the decision, maybe ask a clarifying question), `REVISE_DECISION` (change to ALLOW or
   REJECT), or `ESCALATE` (route to human review — including whenever the user explicitly asks for a human).
3. Claude's reply text is stored (`appeal_messages`, `role="assistant"`). If the action revised or escalated the
   decision, `storage.update_case_decision()` appends a new `decision_history` row (`source="appeal"`) and, for
   an escalation, sets `human_review_status = "pending"`.
4. If the Claude call itself fails, the code does the safe thing: it escalates to human review rather than
   silently keeping (or worse, revising to allow) the previous decision.

## Request flow: human review resolution (`POST /api/cases/{id}/human-review`)

A human reviewer submits a final `decision` (`ALLOW`/`REJECT`), free-text `notes`, and their name.
`storage.resolve_human_review()` updates the case row (`human_review_status = "resolved"`), appends a
`decision_history` row with `source="human_review"`, and the case is now closed to further appeals (enforced in
the appeals router).

## Why SQLite + the filesystem instead of S3/Postgres

This is a prototype meant to run with zero external infrastructure. SQLite gives real persistence (restart-safe,
queryable, supports the search/filter/analytics endpoints) without a database server; the schema
(`storage.py::SCHEMA`) is intentionally simple — three tables, no ORM — so it is easy to read end-to-end and to
port to Postgres later (the SQL is close to standard). Images are stored on local disk under a UUID filename;
`/api/cases/{id}/image` streams them back via `FileResponse`. See `INTERVIEW_NOTES.md` for what changes at scale.

## Frontend structure

- `api.ts` is the only module that calls `fetch` — all network/error handling (status checks,
  `{detail: ...}` error unwrapping) is centralized there.
- `App.tsx` holds a single piece of "current tab" and "current open case" state and renders one of four views;
  there's no router library since four tabs don't need deep-linking for this prototype.
- `CaseView.tsx` is shared by the Upload, Review Queue, and Case History tabs — it renders the decision, the
  decision history, the appeal chat (if the case isn't a clean initial ALLOW with no appeal), and, when
  `allowHumanReviewAction` is passed and the case is `human_review_status === "pending"`, the reviewer's
  decision form.
- Every component owns its own small `.css` file next to it (plain CSS, no CSS-in-JS, no Tailwind), with shared
  primitives (`.card`, `.btn`, `.error-banner`, `.muted`) in `index.css`.

## Data model (SQLite)

- **cases** — one row per uploaded image: metadata, current decision/category/explanation/evidence/
  uncertainty/confidence, and human-review status/notes/reviewer.
- **decision_history** — append-only log of every decision a case has ever had, tagged with its `source`
  (`initial` / `appeal` / `human_review`) — this is what powers both the case detail's history list and the
  analytics "reversal rate" calculation (comparing the first and last entries for cases with appeal activity).
- **appeal_messages** — the appeal chat transcript, `role` of `user`/`assistant`.
