import io
import uuid
from typing import Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from PIL import Image

from app import claude_client, serializers, storage
from app.config import settings
from app.models import CaseDetail, UploadPurpose

router = APIRouter(prefix="/api", tags=["moderation"])

ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}


@router.post("/moderate", response_model=CaseDetail)
async def moderate_image(
    image: UploadFile = File(...),
    name: Optional[str] = Form(None),
    description: Optional[str] = Form(None),
    intended_use: Optional[str] = Form(None),
    upload_purpose: Optional[UploadPurpose] = Form(None),
) -> CaseDetail:
    if image.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(status_code=400, detail=f"Unsupported image type: {image.content_type}")

    raw = await image.read()
    if len(raw) == 0:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")
    if len(raw) > settings.max_image_size_bytes:
        raise HTTPException(
            status_code=400,
            detail=f"Image exceeds the {settings.max_image_size_mb}MB size limit.",
        )

    case_id = str(uuid.uuid4())
    suffix = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif"}[image.content_type]
    image_path = settings.upload_dir / f"{case_id}{suffix}"

    try:
        with Image.open(io.BytesIO(raw)) as img:
            img.verify()
    except Exception:
        raise HTTPException(status_code=400, detail="File could not be read as a valid image.")

    image_path.write_bytes(raw)

    display_name = name or image.filename or "untitled image"

    try:
        result = claude_client.moderate_image(
            image_path=image_path,
            image_name=display_name,
            description=description,
            intended_use=intended_use,
            upload_purpose=upload_purpose.value if upload_purpose else None,
        )
        storage.create_case(
            case_id=case_id,
            image_name=display_name,
            image_path=str(image_path),
            description=description,
            intended_use=intended_use,
            upload_purpose=upload_purpose.value if upload_purpose else None,
            result=result,
        )
    except Exception as exc:  # never silently approve on failure
        image_path.unlink(missing_ok=True)
        raise HTTPException(status_code=502, detail=f"Moderation analysis failed: {exc}") from exc

    row = storage.get_case_row(case_id)
    history = storage.get_history(case_id)
    appeals = storage.get_appeal_messages(case_id)
    return serializers.row_to_detail(row, history, appeals, storage.appeal_count(case_id))
