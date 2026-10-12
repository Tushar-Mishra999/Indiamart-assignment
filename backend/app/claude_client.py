import base64
import json
import logging
from pathlib import Path
from typing import Any, Optional

import anthropic

from app.config import settings

logger = logging.getLogger("moderation.claude")

PROMPTS_DIR = Path(__file__).resolve().parent / "prompts"
MODERATION_SYSTEM_PROMPT = (PROMPTS_DIR / "moderation_system_prompt.txt").read_text(encoding="utf-8")
APPEAL_SYSTEM_PROMPT = (PROMPTS_DIR / "appeal_system_prompt.txt").read_text(encoding="utf-8")

_client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

_MEDIA_TYPE_BY_SUFFIX = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
}

FAILSAFE_RESULT = {
    "decision": "HUMAN_REVIEW",
    "category": "NONE",
    "explanation": "The automated moderation check could not be completed, so this image has been routed to a "
                    "human reviewer rather than approved automatically.",
    "evidence": [],
    "uncertainty": "The AI analysis step failed or returned an unreadable response.",
    "confidence": "low",
}


def _image_block(image_path: Path) -> dict[str, Any]:
    media_type = _MEDIA_TYPE_BY_SUFFIX.get(image_path.suffix.lower(), "image/jpeg")
    data = base64.standard_b64encode(image_path.read_bytes()).decode("utf-8")
    return {
        "type": "image",
        "source": {"type": "base64", "media_type": media_type, "data": data},
    }


def _parse_json_response(text: str) -> Optional[dict[str, Any]]:
    text = text.strip()
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end < start:
        return None
    try:
        return json.loads(text[start : end + 1])
    except json.JSONDecodeError:
        logger.warning("Failed to parse Claude JSON response: %s", text[:500])
        return None


def _context_block(description: Optional[str], intended_use: Optional[str], upload_purpose: Optional[str], image_name: str) -> str:
    return (
        f"Image file name: {image_name}\n"
        f"User-provided description: {description or '(not provided)'}\n"
        f"Intended use: {intended_use or '(not provided)'}\n"
        f"Upload purpose/context: {upload_purpose or '(not provided)'}\n\n"
        "Analyze the attached image against the moderation policy and respond with the required JSON object only."
    )


def moderate_image(
    image_path: Path,
    image_name: str,
    description: Optional[str],
    intended_use: Optional[str],
    upload_purpose: Optional[str],
) -> dict[str, Any]:
    try:
        message = _client.messages.create(
            model=settings.anthropic_model,
            max_tokens=1024,
            system=MODERATION_SYSTEM_PROMPT,
            messages=[
                {
                    "role": "user",
                    "content": [
                        _image_block(image_path),
                        {"type": "text", "text": _context_block(description, intended_use, upload_purpose, image_name)},
                    ],
                }
            ],
        )
        text = "".join(block.text for block in message.content if block.type == "text")
        parsed = _parse_json_response(text)
        if parsed is None or "decision" not in parsed:
            return dict(FAILSAFE_RESULT)
        return parsed
    except Exception:
        logger.exception("Claude moderation call failed")
        return dict(FAILSAFE_RESULT)


def reassess_appeal(
    image_path: Path,
    image_name: str,
    original_result: dict[str, Any],
    conversation: list[dict[str, str]],
    latest_message: str,
    requested_human_review: bool,
) -> dict[str, Any]:
    history_text = "\n".join(f"{turn['role'].upper()}: {turn['content']}" for turn in conversation) or "(no prior messages)"
    flag_text = "\n\nThe user has explicitly requested human review." if requested_human_review else ""
    user_text = (
        f"ORIGINAL DECISION: {original_result['decision']} (category: {original_result['category']}, "
        f"confidence: {original_result['confidence']})\n"
        f"ORIGINAL EXPLANATION: {original_result['explanation']}\n"
        f"ORIGINAL EVIDENCE: {json.dumps(original_result.get('evidence', []))}\n\n"
        f"CONVERSATION SO FAR:\n{history_text}\n\n"
        f"USER'S NEWEST MESSAGE: {latest_message}{flag_text}\n\n"
        "Reassess the image and respond with the required JSON object only."
    )
    try:
        message = _client.messages.create(
            model=settings.anthropic_model,
            max_tokens=1024,
            system=APPEAL_SYSTEM_PROMPT,
            messages=[
                {
                    "role": "user",
                    "content": [
                        _image_block(image_path),
                        {"type": "text", "text": user_text},
                    ],
                }
            ],
        )
        text = "".join(block.text for block in message.content if block.type == "text")
        parsed = _parse_json_response(text)
        if parsed is None or "action" not in parsed:
            return {
                "action": "ESCALATE",
                "message": "We couldn't complete an automated reassessment, so this case has been sent to a "
                            "human reviewer.",
                "decision": "HUMAN_REVIEW",
                "category": original_result.get("category", "NONE"),
                "explanation": "Automated reassessment failed.",
                "evidence": [],
                "uncertainty": "The AI reassessment step failed or returned an unreadable response.",
                "confidence": "low",
            }
        return parsed
    except Exception:
        logger.exception("Claude appeal call failed")
        return {
            "action": "ESCALATE",
            "message": "We couldn't complete an automated reassessment, so this case has been sent to a human "
                        "reviewer.",
            "decision": "HUMAN_REVIEW",
            "category": original_result.get("category", "NONE"),
            "explanation": "Automated reassessment failed.",
            "evidence": [],
            "uncertainty": "The AI reassessment step failed.",
            "confidence": "low",
        }
