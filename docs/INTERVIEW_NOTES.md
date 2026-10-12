# Interview Notes: design choices, limitations, scalability

## Policy design

The brief's starting policy was kept largely intact, but reorganized into six named categories
(`SEXUAL_OBSCENE`, `VIOLENCE_WEAPONS`, `GRAPHIC_CONTENT_ANIMAL_CRUELTY`, `DRUGS_ALCOHOL_TOBACCO_GAMBLING`,
`HATE_SYMBOLS`, `OFF_PLATFORM_REDIRECTION`) instead of free text, because:

- A fixed enum is what lets the analytics dashboard aggregate "what kind of thing gets rejected" rather than
  just "how many things get rejected."
- Each category's prompt text pairs the **violation** definition with an explicit **not-a-violation** carve-out
  for the B2B lookalikes named in the brief (kitchen knives vs. weapons, blood bags vs. gore, product packaging
  QR codes vs. off-platform redirection, bulk alcohol/tobacco packaging vs. promotion of consumption). This is
  the single biggest lever for the "don't wrongfully reject legitimate sellers" requirement — it's cheaper and
  more reliable to teach the model what a false positive looks like than to tune thresholds after the fact.
- The opening paragraph of the moderation system prompt states the marketplace context ("this is a B2B
  WHOLESALE marketplace... your default assumption... is that it is a legitimate listing") before any policy
  text, because framing drives which borderline cases the model treats as the default class.
- I added one thing not explicitly in the brief: text visible *inside* the image (phone numbers, handles,
  emails) is folded into `OFF_PLATFORM_REDIRECTION` rather than being its own category, since the brief itself
  suggested treating it as "also consider," and it shares the same underlying concern (bypassing the platform).

## Why escalate instead of reject when uncertain

The brief's core tension — "minimizing wrongful rejection of legitimate users" vs. "identify prohibited
content" — is resolved by making `HUMAN_REVIEW` the default for uncertainty, not `REJECT`. The decision rules
section of the prompt says this explicitly: *"When genuinely unsure, prefer HUMAN_REVIEW over REJECT... but
never ALLOW something you are unsure is safe."* A false `REJECT` on a real seller's listing is a direct,
immediate business cost (a blocked sale, a frustrated supplier); a `HUMAN_REVIEW` costs a few minutes of a
moderator's time. The asymmetry is deliberate.

## Appeals: why the model is told not to auto-agree or over-defend

Two failure modes were explicitly designed against in `appeal_system_prompt.txt`:

1. A model that treats the user's explanation as ground truth would make the appeal flow trivially gameable —
   anyone rejected for an actual violation could just claim innocent context and get waved through.
2. A model that anchors on its first answer and rationalizes it regardless of new evidence defeats the point of
   having an appeal at all.

The prompt instead asks Claude to re-examine the actual image evidence on every appeal turn (the image is
re-attached, not just described) and weigh the user's claim against it, with three explicit exits: keep the
decision and reply/ask a clarifying question (`REPLY`), change the decision (`REVISE_DECISION`), or hand it to a
person (`ESCALATE`) — including whenever the user explicitly asks for a human, which is wired up as its own UI
button rather than requiring the user to phrase a request correctly.

## Confidence and explainability

The brief asked for the decision not to be presented as a calibrated probability and for no hidden
chain-of-thought to be revealed. Both system prompts constrain `confidence` to an enum (`high`/`medium`/`low`)
and instruct the model to put nothing outside the required JSON object — there is no "reasoning" field the UI
could accidentally leak, and the frontend only ever renders `explanation`, `evidence`, and `uncertainty`, all of
which are meant to be shown.

## Fail-safe behavior over availability

`claude_client.py` wraps every Anthropic call in a broad `except Exception`, and every failure path — API error,
timeout, malformed/unparseable JSON — returns the same hardcoded `FAILSAFE_RESULT`: `HUMAN_REVIEW`, `confidence:
low`, with a message saying automated analysis failed. This directly satisfies "never automatically approve an
image when the AI fails." The tradeoff is explicit: if Claude's API is down, every single upload piles into the
human review queue rather than being silently approved — availability is sacrificed for safety, which is the
right default for a moderation system.

## Limitations of this prototype

- **No authentication/authorization.** Anyone who can reach the API can upload images, appeal, or resolve human
  review cases. A real deployment needs auth for all three — especially restricting who can act as a "human
  reviewer."
- **No rate limiting or abuse protection** on the upload or appeal endpoints — easy to add at the FastAPI layer
  or a reverse proxy, not implemented here.
- **Synchronous Claude calls.** Each upload/appeal blocks the request on the Anthropic API round-trip (typically
  a few seconds). Fine for a demo; at real traffic this needs a queue (see below).
- **SQLite + local disk.** Fine for a single-process prototype; not safe for multiple backend instances writing
  concurrently, and images on local disk don't survive a container redeploy.
- **No automated test suite.** The flows were verified by hand (unit-level smoke test of the FastAPI app import,
  then live curl calls through `/api/moderate` → `/api/cases/{id}/appeal` → `/api/cases/{id}/human-review` →
  `/api/analytics`, and the same flow driven through the actual React UI). A production version needs unit
  tests for the JSON-parsing fallback paths in `claude_client.py` in particular, since that's the safety-critical
  code.
- **Single Claude call per decision, no ensembling/retries.** A transient API error goes straight to
  `HUMAN_REVIEW` rather than retrying once. That's a reasonable prototype default (simplicity, and it still
  satisfies "never auto-approve on failure") but a production system would likely retry with backoff before
  giving up to human review, to avoid flooding the queue during a brief outage.
- **Appeal "reversal rate" in analytics is a simple history-based heuristic** (first decision vs. last decision
  differ, for cases with any appeal activity) — it does not distinguish "Claude revised its own mind" from
  "a human reviewer overruled Claude," which would be worth splitting out in a real dashboard.

## Scalability path

1. **Move Claude calls off the request path.** Accept the upload, persist it with `decision: PENDING`, enqueue a
   job (SQS/Redis/Celery/etc.), and have a worker pool call Claude and write the result back; the frontend polls
   or uses a websocket/SSE for the result. This is the single highest-value change for throughput and lets you
   retry/backoff on transient Anthropic errors without blocking a user's upload request.
2. **Move storage to Postgres + object storage (S3/GCS).** The SQLite schema in `storage.py` maps almost
   directly to Postgres tables; swap local `uploads/` for signed-URL object storage so multiple backend
   instances can run behind a load balancer.
3. **Cache/batch where it's safe.** Identical or near-duplicate images (common for templated product photos)
   could be hashed and short-circuited to a cached decision, cutting both cost and latency — with a periodic
   re-check, since policy or context can change.
4. **Separate the human-review queue into its own service/permissions boundary** once there's real auth, with
   audit logging on every human decision (who, when, what changed) beyond the current `human_review_notes`
   free-text field.
5. **Add observability**: structured logs per decision (already logged via Python `logging`), plus metrics on
   Claude latency/error rate and queue depth, since those directly predict how fast the human review queue grows.
