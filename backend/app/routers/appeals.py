from pathlib import Path

from fastapi import APIRouter, HTTPException

from app import claude_client, serializers, storage
from app.models import AppealRequest, AppealResponse

router = APIRouter(prefix="/api/cases", tags=["appeals"])


@router.post("/{case_id}/appeal", response_model=AppealResponse)
def appeal_case(case_id: str, payload: AppealRequest) -> AppealResponse:
    row = storage.get_case_row(case_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Case not found.")
    if row["human_review_status"] == "resolved":
        raise HTTPException(status_code=400, detail="This case was already resolved by a human reviewer and is closed to further appeals.")

    image_path = Path(row["image_path"])
    original_result = {
        "decision": row["decision"],
        "category": row["category"],
        "explanation": row["explanation"],
        "evidence": [],
        "confidence": row["confidence"],
    }

    prior_messages = storage.get_appeal_messages(case_id)
    conversation = [{"role": m["role"], "content": m["content"]} for m in prior_messages]

    storage.add_appeal_message(case_id, "user", payload.message)

    outcome = claude_client.reassess_appeal(
        image_path=image_path,
        image_name=row["image_name"],
        original_result=original_result,
        conversation=conversation,
        latest_message=payload.message,
        requested_human_review=payload.request_human_review,
    )

    storage.add_appeal_message(case_id, "assistant", outcome.get("message", ""))

    action = outcome.get("action", "ESCALATE")
    if action in ("REVISE_DECISION", "ESCALATE"):
        result = {
            "decision": outcome.get("decision") or "HUMAN_REVIEW",
            "category": outcome.get("category") or row["category"],
            "explanation": outcome.get("explanation") or outcome.get("message", ""),
            "evidence": outcome.get("evidence") or [],
            "uncertainty": outcome.get("uncertainty") or "",
            "confidence": outcome.get("confidence") or "low",
        }
        storage.update_case_decision(case_id, result, source="appeal")

    updated_row = storage.get_case_row(case_id)
    history = storage.get_history(case_id)
    appeals = storage.get_appeal_messages(case_id)
    case_detail = serializers.row_to_detail(updated_row, history, appeals, storage.appeal_count(case_id))

    return AppealResponse(action=action, message=outcome.get("message", ""), case=case_detail)
