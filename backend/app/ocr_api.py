"""ID-proof OCR endpoint. The uploaded document is processed in memory and never persisted."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api import resolve_workspace
from app.config import get_settings
from app.db import get_db
from app.ocr_provider import OcrProviderProblem, build_ocr_provider

router = APIRouter(prefix="/api/v1", tags=["id-proof"])


class OcrWordResponse(BaseModel):
    text: str
    confidence: float


class OcrResponse(BaseModel):
    text: str
    confidence: float
    words: list[OcrWordResponse]
    method: str
    provider: str
    pages: int


async def _read_limited_body(request: Request, max_bytes: int) -> bytes:
    content = bytearray()
    async for chunk in request.stream():
        content.extend(chunk)
        if len(content) > max_bytes:
            raise OcrProviderProblem(
                "FILE_TOO_LARGE",
                "The uploaded file is larger than the allowed limit.",
                413,
            )
    return bytes(content)


@router.post(
    "/workspaces/{workspace_ref}/demo/id-proof/ocr",
    response_model=OcrResponse,
)
async def ocr_id_proof(
    workspace_ref: str,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
) -> OcrResponse:
    resolve_workspace(workspace_ref, db)
    settings = get_settings()
    provider = build_ocr_provider(settings)

    declared_length = request.headers.get("content-length")
    if declared_length:
        try:
            if int(declared_length) > settings.ocr_max_bytes:
                raise OcrProviderProblem(
                    "FILE_TOO_LARGE",
                    "The uploaded file is larger than the allowed limit.",
                    413,
                )
        except ValueError as exc:
            raise OcrProviderProblem(
                "MALFORMED_REQUEST",
                "The upload length is invalid.",
                422,
            ) from exc

    content_type = request.headers.get("content-type", "").split(";")[0].strip().lower()
    content = await _read_limited_body(request, settings.ocr_max_bytes)
    result = provider.recognize(content, content_type)

    response.headers["Cache-Control"] = "no-store"
    response.headers["Pragma"] = "no-cache"
    return OcrResponse(**result)
