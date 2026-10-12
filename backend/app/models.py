from datetime import datetime
from enum import Enum
from typing import Literal, Optional

from pydantic import BaseModel, Field


class Decision(str, Enum):
    ALLOW = "ALLOW"
    REJECT = "REJECT"
    HUMAN_REVIEW = "HUMAN_REVIEW"


class Category(str, Enum):
    SEXUAL_OBSCENE = "SEXUAL_OBSCENE"
    VIOLENCE_WEAPONS = "VIOLENCE_WEAPONS"
    GRAPHIC_CONTENT_ANIMAL_CRUELTY = "GRAPHIC_CONTENT_ANIMAL_CRUELTY"
    DRUGS_ALCOHOL_TOBACCO_GAMBLING = "DRUGS_ALCOHOL_TOBACCO_GAMBLING"
    HATE_SYMBOLS = "HATE_SYMBOLS"
    OFF_PLATFORM_REDIRECTION = "OFF_PLATFORM_REDIRECTION"
    NONE = "NONE"


class Confidence(str, Enum):
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class UploadPurpose(str, Enum):
    PRODUCT_LISTING = "product_listing"
    SUPPLIER_PROFILE = "supplier_profile"
    BUYER_ENQUIRY = "buyer_enquiry"
    REVIEW = "review"
    CHAT = "chat"
    OTHER = "other"


class ModerationResult(BaseModel):
    decision: Decision
    category: Category
    explanation: str
    evidence: list[str] = Field(default_factory=list)
    uncertainty: str
    confidence: Confidence


class CaseSummary(BaseModel):
    case_id: str
    image_name: str
    created_at: datetime
    decision: Decision
    category: Category
    confidence: Confidence
    appeal_count: int
    human_review_status: Optional[str] = None


class CaseDetail(CaseSummary):
    description: Optional[str] = None
    intended_use: Optional[str] = None
    upload_purpose: Optional[UploadPurpose] = None
    explanation: str
    evidence: list[str]
    uncertainty: str
    image_url: str
    history: list["DecisionHistoryEntry"] = Field(default_factory=list)
    appeal_messages: list["AppealMessage"] = Field(default_factory=list)
    human_review_notes: Optional[str] = None
    human_reviewer_decision: Optional[Decision] = None


class DecisionHistoryEntry(BaseModel):
    decision: Decision
    category: Category
    explanation: str
    confidence: Confidence
    source: Literal["initial", "appeal", "human_review"]
    created_at: datetime


class AppealMessage(BaseModel):
    role: Literal["user", "assistant", "system"]
    content: str
    created_at: datetime


class AppealRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    request_human_review: bool = False


class AppealResponse(BaseModel):
    action: Literal["REPLY", "REVISE_DECISION", "ESCALATE"]
    message: str
    case: CaseDetail


class HumanReviewDecisionRequest(BaseModel):
    decision: Decision
    notes: str = Field(min_length=1, max_length=2000)
    reviewer_name: str = Field(min_length=1, max_length=120)


class AnalyticsResponse(BaseModel):
    total_cases: int
    decisions: dict[str, int]
    categories: dict[str, int]
    appeals_total: int
    appeals_leading_to_reversal: int
    escalations_to_human_review: int
    pending_human_review: int
    reversal_rate: float
