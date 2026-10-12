from fastapi import APIRouter

from app import storage
from app.models import AnalyticsResponse

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


@router.get("", response_model=AnalyticsResponse)
def get_analytics() -> AnalyticsResponse:
    rows = storage.list_case_rows()
    total = len(rows)

    decisions: dict[str, int] = {}
    categories: dict[str, int] = {}
    escalations = 0
    pending_human_review = 0

    for row in rows:
        decisions[row["decision"]] = decisions.get(row["decision"], 0) + 1
        categories[row["category"]] = categories.get(row["category"], 0) + 1
        if row["human_review_status"] is not None:
            escalations += 1
        if row["human_review_status"] == "pending":
            pending_human_review += 1

    appeals_total = 0
    appeals_leading_to_reversal = 0
    for row in rows:
        count = storage.appeal_count(row["case_id"])
        if count == 0:
            continue
        appeals_total += count
        history = storage.get_history(row["case_id"])
        appeal_sourced = [h for h in history if h["source"] in ("appeal", "human_review")]
        if appeal_sourced:
            initial_decision = history[0]["decision"]
            final_decision = history[-1]["decision"]
            if initial_decision != final_decision:
                appeals_leading_to_reversal += 1

    reversal_rate = (appeals_leading_to_reversal / appeals_total) if appeals_total else 0.0

    return AnalyticsResponse(
        total_cases=total,
        decisions=decisions,
        categories=categories,
        appeals_total=appeals_total,
        appeals_leading_to_reversal=appeals_leading_to_reversal,
        escalations_to_human_review=escalations,
        pending_human_review=pending_human_review,
        reversal_rate=round(reversal_rate, 3),
    )
