import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from app.config import settings

SCHEMA = """
CREATE TABLE IF NOT EXISTS cases (
    case_id TEXT PRIMARY KEY,
    image_name TEXT NOT NULL,
    image_path TEXT NOT NULL,
    description TEXT,
    intended_use TEXT,
    upload_purpose TEXT,
    decision TEXT NOT NULL,
    category TEXT NOT NULL,
    explanation TEXT NOT NULL,
    evidence TEXT NOT NULL,
    uncertainty TEXT NOT NULL,
    confidence TEXT NOT NULL,
    human_review_status TEXT,
    human_review_notes TEXT,
    human_reviewer_decision TEXT,
    human_reviewer_name TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS decision_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    case_id TEXT NOT NULL,
    decision TEXT NOT NULL,
    category TEXT NOT NULL,
    explanation TEXT NOT NULL,
    confidence TEXT NOT NULL,
    source TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (case_id) REFERENCES cases(case_id)
);

CREATE TABLE IF NOT EXISTS appeal_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    case_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (case_id) REFERENCES cases(case_id)
);
"""


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


@contextmanager
def get_connection():
    conn = sqlite3.connect(settings.database_path)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db() -> None:
    with get_connection() as conn:
        conn.executescript(SCHEMA)


def create_case(
    case_id: str,
    image_name: str,
    image_path: str,
    description: Optional[str],
    intended_use: Optional[str],
    upload_purpose: Optional[str],
    result: dict[str, Any],
) -> None:
    now = _now()
    with get_connection() as conn:
        conn.execute(
            """INSERT INTO cases (
                case_id, image_name, image_path, description, intended_use, upload_purpose,
                decision, category, explanation, evidence, uncertainty, confidence,
                human_review_status, created_at
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (
                case_id, image_name, image_path, description, intended_use, upload_purpose,
                result["decision"], result["category"], result["explanation"],
                json.dumps(result["evidence"]), result["uncertainty"], result["confidence"],
                "pending" if result["decision"] == "HUMAN_REVIEW" else None,
                now,
            ),
        )
        conn.execute(
            """INSERT INTO decision_history (case_id, decision, category, explanation, confidence, source, created_at)
               VALUES (?,?,?,?,?,?,?)""",
            (case_id, result["decision"], result["category"], result["explanation"], result["confidence"], "initial", now),
        )


def get_case_row(case_id: str) -> Optional[sqlite3.Row]:
    with get_connection() as conn:
        row = conn.execute("SELECT * FROM cases WHERE case_id = ?", (case_id,)).fetchone()
        return row


def list_case_rows(
    query: Optional[str] = None,
    decision: Optional[str] = None,
    human_review_status: Optional[str] = None,
) -> list[sqlite3.Row]:
    sql = "SELECT * FROM cases WHERE 1=1"
    params: list[Any] = []
    if query:
        sql += " AND (image_name LIKE ? OR description LIKE ? OR case_id LIKE ?)"
        like = f"%{query}%"
        params += [like, like, like]
    if decision:
        sql += " AND decision = ?"
        params.append(decision)
    if human_review_status:
        sql += " AND human_review_status = ?"
        params.append(human_review_status)
    sql += " ORDER BY created_at DESC"
    with get_connection() as conn:
        return conn.execute(sql, params).fetchall()


def get_history(case_id: str) -> list[sqlite3.Row]:
    with get_connection() as conn:
        return conn.execute(
            "SELECT * FROM decision_history WHERE case_id = ? ORDER BY created_at ASC", (case_id,)
        ).fetchall()


def get_appeal_messages(case_id: str) -> list[sqlite3.Row]:
    with get_connection() as conn:
        return conn.execute(
            "SELECT * FROM appeal_messages WHERE case_id = ? ORDER BY created_at ASC", (case_id,)
        ).fetchall()


def add_appeal_message(case_id: str, role: str, content: str) -> None:
    with get_connection() as conn:
        conn.execute(
            "INSERT INTO appeal_messages (case_id, role, content, created_at) VALUES (?,?,?,?)",
            (case_id, role, content, _now()),
        )


def update_case_decision(case_id: str, result: dict[str, Any], source: str) -> None:
    now = _now()
    with get_connection() as conn:
        conn.execute(
            """UPDATE cases SET decision=?, category=?, explanation=?, evidence=?, uncertainty=?, confidence=?,
               human_review_status = CASE WHEN ? = 'HUMAN_REVIEW' THEN 'pending' ELSE NULL END
               WHERE case_id=?""",
            (
                result["decision"], result["category"], result["explanation"],
                json.dumps(result["evidence"]), result["uncertainty"], result["confidence"],
                result["decision"], case_id,
            ),
        )
        conn.execute(
            """INSERT INTO decision_history (case_id, decision, category, explanation, confidence, source, created_at)
               VALUES (?,?,?,?,?,?,?)""",
            (case_id, result["decision"], result["category"], result["explanation"], result["confidence"], source, now),
        )


def resolve_human_review(case_id: str, decision: str, notes: str, reviewer_name: str) -> None:
    now = _now()
    with get_connection() as conn:
        conn.execute(
            """UPDATE cases SET decision=?, human_review_status='resolved', human_review_notes=?,
               human_reviewer_decision=?, human_reviewer_name=? WHERE case_id=?""",
            (decision, notes, decision, reviewer_name, case_id),
        )
        conn.execute(
            """INSERT INTO decision_history (case_id, decision, category, explanation, confidence, source, created_at)
               VALUES (?,?,?,?,?,?,?)""",
            (case_id, decision, (conn.execute("SELECT category FROM cases WHERE case_id=?", (case_id,)).fetchone())["category"],
             f"Human reviewer decision: {notes}", "high", "human_review", now),
        )


def appeal_count(case_id: str) -> int:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT COUNT(*) as c FROM appeal_messages WHERE case_id = ? AND role = 'user'", (case_id,)
        ).fetchone()
        return row["c"]
