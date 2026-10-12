# IndiaMART AI Image Moderation (Prototype)

An AI-powered image moderation prototype for IndiaMART, built for a B2B marketplace where legitimate commercial
images (knives, chemicals, medical supplies, alcohol packaging, etc.) must not be confused with genuine policy
violations. Claude's vision model reviews each image together with user-supplied context, and decides to
**ALLOW**, **REJECT**, or send it to **HUMAN_REVIEW**. Rejected/escalated cases open an appeal chat where Claude
reassesses the image and the user's explanation without blindly agreeing or stubbornly defending itself; unresolved
disagreements go to a human reviewer.

## Stack

- **Frontend:** React 19 + Vite + TypeScript, plain CSS (no component libraries, no Tailwind).
- **Backend:** FastAPI + Pydantic v2, SQLite (stdlib `sqlite3`) for case storage, Pillow for image validation.
- **AI:** Official `anthropic` Python SDK, using a vision-capable Claude model (`ANTHROPIC_MODEL`, default
  `claude-sonnet-4-5-20250929`).

## Project layout

```
backend/
  app/
    main.py              FastAPI app, CORS, router wiring
    config.py             Settings loaded from .env
    models.py              Pydantic request/response schemas
    storage.py              SQLite persistence layer
    serializers.py           DB row -> API model conversion
    claude_client.py          Anthropic SDK calls + JSON parsing + fail-safe
    prompts/
      moderation_system_prompt.txt   Versioned initial-decision system prompt
      appeal_system_prompt.txt        Versioned appeal/reassessment system prompt
    routers/
      moderation.py    POST /api/moderate
      cases.py          GET /api/cases, GET /api/cases/{id}, GET /api/cases/{id}/image
      appeals.py         POST /api/cases/{id}/appeal
      human_review.py     POST /api/cases/{id}/human-review
      analytics.py          GET /api/analytics
  uploads/              Uploaded images (gitignored, created at runtime)
  data/                 SQLite database file (gitignored, created at runtime)
frontend/
  src/
    api.ts                  fetch wrappers for the backend API
    types/                   Shared TypeScript types
    components/              UploadPanel, CaseView (result + appeal chat + reviewer form),
                               CaseList (search/queue), AnalyticsView, DecisionBadge
    App.tsx                    Tab navigation: Upload, Human Review Queue, Case History, Analytics
docs/
  ARCHITECTURE.md
  INTERVIEW_NOTES.md
```

## Running locally

### Backend

```bash
cd backend
python -m venv .venv
.venv/Scripts/activate        # Windows; use `source .venv/bin/activate` on macOS/Linux
pip install -r requirements.txt
cp .env.example .env          # then put your real ANTHROPIC_API_KEY in .env
uvicorn app.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

The Vite dev server proxies `/api/*` to `http://127.0.0.1:8000`, so just open the printed `localhost:5173` URL.

## API summary

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/moderate` | Upload an image (+ optional name/description/intended_use/upload_purpose) and get an initial decision |
| GET | `/api/cases` | List/search cases (`q`, `decision`, `human_review_status` query params) |
| GET | `/api/cases/{id}` | Full case detail: decision, evidence, history, appeal thread |
| GET | `/api/cases/{id}/image` | Serves the stored image |
| POST | `/api/cases/{id}/appeal` | Send an appeal message; Claude reassesses and may revise or escalate |
| POST | `/api/cases/{id}/human-review` | A human reviewer records the final decision on an escalated case |
| GET | `/api/analytics` | Aggregate counts: decisions, categories, appeals, reversals, escalations |

Interactive OpenAPI docs are available at `http://127.0.0.1:8000/docs` once the backend is running.

## Policy categories (see `backend/app/prompts/moderation_system_prompt.txt` for the full wording)

1. Sexual or obscene content
2. Violence and weapons (real/illegal weapons only — ordinary commercial knives/tools are not flagged)
3. Graphic content and animal cruelty (commercial medical/food imagery is not flagged)
4. Drugs, alcohol, tobacco and gambling (unopened packaging/wholesale goods are not flagged)
5. Hate symbols
6. Off-platform redirection (QR codes/contact info meant to bypass the platform — not packaging QR codes)

The system prompt explicitly instructs Claude that this is a **B2B wholesale marketplace** and to default to
treating plausible commercial product photography as legitimate, escalating to `HUMAN_REVIEW` rather than
rejecting when unsure — see `docs/INTERVIEW_NOTES.md` for the reasoning behind this design choice.

## Safety behavior

- The backend **never auto-approves** an image if the Claude call fails, times out, or returns unparseable
  output — it always falls back to `HUMAN_REVIEW` with `confidence: "low"` (see `FAILSAFE_RESULT` in
  `claude_client.py`).
- Images are validated for content-type, that Pillow can open them, and a configurable max size
  (`MAX_IMAGE_SIZE_MB`, default 10MB) before being sent to Claude or written to disk.
- Confidence is surfaced only as `high`/`medium`/`low`, never as a numeric probability, and the system prompts
  explicitly forbid revealing hidden chain-of-thought.

## Deploying to Render

The repo includes a `render.yaml` Blueprint that deploys the backend as a web service and the frontend as a
static site. Two things make this different from local dev:

1. **The frontend needs to know the backend's URL.** Locally, Vite's dev proxy forwards `/api/*` to the backend,
   but in production they're on separate Render domains. `frontend/src/api.ts` reads `VITE_API_BASE_URL` at
   **build time** and prefixes every request with it — leave it unset for local dev, set it to the backend's
   Render URL for the deployed frontend.
2. **SQLite + uploaded images need a persistent disk**, or every redeploy (and every restart) wipes the
   database and all uploaded images. Render disks require a paid plan (Starter or above) — the `render.yaml`
   mounts one at `/var/data` and points `DATABASE_PATH`/`UPLOAD_DIR` at it.

### Steps

1. Push this repo to GitHub, then in the Render dashboard: **New > Blueprint**, point it at the repo. Render
   reads `render.yaml` and proposes both services.
2. Before the first deploy, fill in the env vars Render leaves blank (`sync: false` in the blueprint):
   - Backend: `ANTHROPIC_API_KEY` (your real key) and `CORS_ORIGINS` (the frontend's Render URL, e.g.
     `https://indiamart-moderation-frontend.onrender.com` — no trailing slash).
   - Frontend: `VITE_API_BASE_URL` (the backend's Render URL, e.g.
     `https://indiamart-moderation-backend.onrender.com`).
   - Since each service's URL isn't known until after it's first created, deploy once, copy the two URLs from
     the Render dashboard, paste them into the env vars above, then trigger a manual redeploy of both services
     so the build picks them up (the frontend var is baked in at build time, so just editing the env var isn't
     enough — it needs a new build).
3. Confirm the backend is healthy at `https://<backend>.onrender.com/api/health` and the docs at
   `https://<backend>.onrender.com/docs`, then open the frontend URL.

Without a Blueprint, you can create the same two services manually in the dashboard — a **Web Service** for
`backend/` (build: `pip install -r requirements.txt`, start:
`uvicorn app.main:app --host 0.0.0.0 --port $PORT`) and a **Static Site** for `frontend/` (build:
`npm install && npm run build`, publish directory: `dist`) — with the same env vars as above.

## What's not in this prototype

See the "Limitations" section of `docs/INTERVIEW_NOTES.md` — in particular: no authentication/authorization, no
rate limiting, SQLite instead of a production database, synchronous (not queued) Claude calls, and no automated
test suite.
