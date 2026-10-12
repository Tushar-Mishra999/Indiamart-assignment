import json
import sqlite3

from app.models import CaseDetail, CaseSummary, DecisionHistoryEntry, AppealMessage


def row_to_summary(row: sqlite3.Row) -> CaseSummary:
    with_appeals = row.keys()
    return CaseSummary(
        case_id=row["case_id"],
        image_name=row["image_name"],
        created_at=row["created_at"],
        decision=row["decision"],
        category=row["category"],
        confidence=row["confidence"],
        appeal_count=row["appeal_count"] if "appeal_count" in with_appeals else 0,
        human_review_status=row["human_review_status"],
    )


def row_to_detail(row: sqlite3.Row, history_rows, appeal_rows, appeal_count: int) -> CaseDetail:
    return CaseDetail(
        case_id=row["case_id"],
        image_name=row["image_name"],
        created_at=row["created_at"],
        decision=row["decision"],
        category=row["category"],
        confidence=row["confidence"],
        appeal_count=appeal_count,
        human_review_status=row["human_review_status"],
        description=row["description"],
        intended_use=row["intended_use"],
        upload_purpose=row["upload_purpose"],
        explanation=row["explanation"],
        evidence=json.loads(row["evidence"]),
        uncertainty=row["uncertainty"],
        image_url=f"/api/cases/{row['case_id']}/image",
        history=[
            DecisionHistoryEntry(
                decision=h["decision"],
                category=h["category"],
                explanation=h["explanation"],
                confidence=h["confidence"],
                source=h["source"],
                created_at=h["created_at"],
            )
            for h in history_rows
        ],
        appeal_messages=[
            AppealMessage(role=a["role"], content=a["content"], created_at=a["created_at"])
            for a in appeal_rows
        ],
        human_review_notes=row["human_review_notes"],
        human_reviewer_decision=row["human_reviewer_decision"],
    )
