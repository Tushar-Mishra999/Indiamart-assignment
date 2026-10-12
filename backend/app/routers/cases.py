from typing import Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from app import serializers, storage
from app.models import CaseDetail, CaseSummary

router = APIRouter(prefix="/api/cases", tags=["cases"])


@router.get("", response_model=list[CaseSummary])
def list_cases(
    q: Optional[str] = None,
    decision: Optional[str] = None,
    human_review_status: Optional[str] = None,
) -> list[CaseSummary]:
    rows = storage.list_case_rows(query=q, decision=decision, human_review_status=human_review_status)
    return [
        CaseSummary(
            case_id=row["case_id"],
            image_name=row["image_name"],
            created_at=row["created_at"],
            decision=row["decision"],
            category=row["category"],
            confidence=row["confidence"],
            appeal_count=storage.appeal_count(row["case_id"]),
            human_review_status=row["human_review_status"],
        )
        for row in rows
    ]


@router.get("/{case_id}", response_model=CaseDetail)
def get_case(case_id: str) -> CaseDetail:
    row = storage.get_case_row(case_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Case not found.")
    history = storage.get_history(case_id)
    appeals = storage.get_appeal_messages(case_id)
    return serializers.row_to_detail(row, history, appeals, storage.appeal_count(case_id))


@router.get("/{case_id}/image")
def get_case_image(case_id: str) -> FileResponse:
    row = storage.get_case_row(case_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Case not found.")
    return FileResponse(row["image_path"])
