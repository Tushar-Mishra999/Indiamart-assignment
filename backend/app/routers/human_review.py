from fastapi import APIRouter, HTTPException

from app import serializers, storage
from app.models import CaseDetail, HumanReviewDecisionRequest

router = APIRouter(prefix="/api/cases", tags=["human_review"])


@router.post("/{case_id}/human-review", response_model=CaseDetail)
def resolve_human_review(case_id: str, payload: HumanReviewDecisionRequest) -> CaseDetail:
    row = storage.get_case_row(case_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Case not found.")

    storage.resolve_human_review(
        case_id=case_id,
        decision=payload.decision.value,
        notes=payload.notes,
        reviewer_name=payload.reviewer_name,
    )

    updated_row = storage.get_case_row(case_id)
    history = storage.get_history(case_id)
    appeals = storage.get_appeal_messages(case_id)
    return serializers.row_to_detail(updated_row, history, appeals, storage.appeal_count(case_id))
