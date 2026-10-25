"""External OCR provider adapter with in-memory processing and no document persistence."""

from __future__ import annotations

import base64
import json
import urllib.error
import urllib.request

from app.config import Settings

IMAGE_MIME_TYPES = {"image/jpeg", "image/png", "image/webp"}
PDF_MIME_TYPE = "application/pdf"
VISION_IMAGE_URL = "https://vision.googleapis.com/v1/images:annotate"
VISION_FILE_URL = "https://vision.googleapis.com/v1/files:annotate"
UNSAFE_PDF_MARKERS = (b"/JavaScript", b"/JS", b"/EmbeddedFile", b"/Launch", b"/OpenAction")
MAX_PROVIDER_RESPONSE_BYTES = 8 * 1024 * 1024


class OcrProviderProblem(Exception):
    def __init__(self, code: str, message: str, status_code: int = 503) -> None:
        self.code = code
        self.message = message
        self.status_code = status_code


def detect_content_type(content: bytes) -> str:
    if content.startswith(b"%PDF-"):
        return PDF_MIME_TYPE
    if content.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if content.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if content[:4] == b"RIFF" and content[8:12] == b"WEBP":
        return "image/webp"
    raise OcrProviderProblem(
        "INVALID_TYPE",
        "Only JPEG, PNG, WebP and PDF files can be read.",
        422,
    )


def validate_id_proof_content(content: bytes, declared_mime: str, max_bytes: int) -> str:
    if not content:
        raise OcrProviderProblem("MALFORMED_FILE", "The uploaded file is empty.", 422)
    if len(content) > max_bytes:
        raise OcrProviderProblem(
            "FILE_TOO_LARGE",
            "The uploaded file is larger than the allowed limit.",
            413,
        )
    declared = (declared_mime or "").split(";")[0].strip().lower()
    if declared and declared not in IMAGE_MIME_TYPES and declared != PDF_MIME_TYPE:
        raise OcrProviderProblem(
            "INVALID_TYPE",
            "Only JPEG, PNG, WebP and PDF files can be read.",
            422,
        )
    detected = detect_content_type(content)
    if declared == PDF_MIME_TYPE and detected != PDF_MIME_TYPE:
        raise OcrProviderProblem("MALFORMED_FILE", "The PDF file is malformed.", 422)
    if declared in IMAGE_MIME_TYPES and detected == PDF_MIME_TYPE:
        raise OcrProviderProblem("MALFORMED_FILE", "The image file is malformed.", 422)
    if detected == PDF_MIME_TYPE:
        if b"%%EOF" not in content:
            raise OcrProviderProblem(
                "MALFORMED_FILE",
                "The PDF file is incomplete or malformed.",
                422,
            )
        if any(marker in content for marker in UNSAFE_PDF_MARKERS):
            raise OcrProviderProblem(
                "UNSAFE_PDF",
                "This PDF contains active or embedded content and cannot be processed.",
                422,
            )
    return detected


def _word_text(word: dict) -> str:
    return "".join(
        str(symbol.get("text", ""))
        for symbol in (word.get("symbols") or [])
    )


def _clamp_confidence(value: object) -> float:
    try:
        numeric = float(value) if value is not None else 0.0
    except (TypeError, ValueError):
        numeric = 0.0
    return max(0.0, min(1.0, numeric))


def parse_vision_response(payload: dict) -> dict:
    annotations: list[dict] = []
    for outer in payload.get("responses") or []:
        if not isinstance(outer, dict):
            continue
        if outer.get("error"):
            raise OcrProviderProblem("OCR_PROVIDER_ERROR", "The OCR provider returned an error.", 502)
        if "fullTextAnnotation" in outer:
            annotations.append(outer["fullTextAnnotation"])
        for inner in outer.get("responses") or []:
            if not isinstance(inner, dict):
                continue
            if inner.get("error"):
                raise OcrProviderProblem("OCR_PROVIDER_ERROR", "The OCR provider returned an error.", 502)
            if "fullTextAnnotation" in inner:
                annotations.append(inner["fullTextAnnotation"])

    text_parts: list[str] = []
    words: list[dict] = []
    page_count = 0
    for annotation in annotations:
        text = str(annotation.get("text", "")).strip()
        if text:
            text_parts.append(text)
        for page in annotation.get("pages") or []:
            page_count += 1
            for block in page.get("blocks") or []:
                for paragraph in block.get("paragraphs") or []:
                    for word in paragraph.get("words") or []:
                        token = _word_text(word)
                        if not token:
                            continue
                        words.append({
                            "text": token,
                            "confidence": round(_clamp_confidence(word.get("confidence")), 4),
                        })

    if not text_parts:
        raise OcrProviderProblem(
            "OCR_NO_TEXT",
            "No readable text was found. Try a clearer image or a different document.",
            422,
        )

    confidence = (
        round(sum(word["confidence"] for word in words) / len(words), 4)
        if words
        else 0.0
    )
    return {
        "text": "\n".join(text_parts),
        "confidence": confidence,
        "words": words,
        "method": "external_ocr",
        "provider": "google_vision",
        "pages": page_count or 1,
    }


class GoogleVisionProvider:
    name = "google_vision"

    def __init__(self, api_key: str, timeout_seconds: float, max_bytes: int) -> None:
        self._api_key = api_key
        self._timeout_seconds = timeout_seconds
        self._max_bytes = max_bytes

    def recognize(self, content: bytes, declared_mime: str) -> dict:
        detected = validate_id_proof_content(content, declared_mime, self._max_bytes)
        encoded = base64.b64encode(content).decode("ascii")
        if detected == PDF_MIME_TYPE:
            payload = {
                "requests": [
                    {
                        "inputConfig": {"content": encoded, "mimeType": PDF_MIME_TYPE},
                        "features": [{"type": "DOCUMENT_TEXT_DETECTION"}],
                        "imageContext": {"languageHints": ["en"]},
                    }
                ]
            }
            response = self._post_json(VISION_FILE_URL, payload)
        else:
            payload = {
                "requests": [
                    {
                        "image": {"content": encoded},
                        "features": [{"type": "DOCUMENT_TEXT_DETECTION"}],
                        "imageContext": {"languageHints": ["en"]},
                    }
                ]
            }
            response = self._post_json(VISION_IMAGE_URL, payload)
        return parse_vision_response(response)

    def _post_json(self, url: str, payload: dict) -> dict:
        data = json.dumps(payload).encode("utf-8")
        request = urllib.request.Request(
            url,
            data=data,
            headers={
                "Content-Type": "application/json",
                "X-Goog-Api-Key": self._api_key,
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=self._timeout_seconds) as response:
                body = response.read(MAX_PROVIDER_RESPONSE_BYTES + 1)
        except urllib.error.HTTPError as exc:
            if exc.code == 429:
                raise OcrProviderProblem(
                    "OCR_PROVIDER_RATE_LIMITED",
                    "The OCR provider is rate-limiting requests. Try again shortly.",
                    503,
                ) from exc
            if exc.code in {400, 401, 403}:
                raise OcrProviderProblem(
                    "OCR_PROVIDER_REJECTED",
                    "The OCR provider rejected the request. Check the API key and Vision API enablement.",
                    502,
                ) from exc
            raise OcrProviderProblem(
                "OCR_PROVIDER_UNAVAILABLE",
                "The OCR provider is unavailable right now.",
                503,
            ) from exc
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            raise OcrProviderProblem(
                "OCR_PROVIDER_UNAVAILABLE",
                "The OCR service could not be reached.",
                503,
            ) from exc
        if len(body) > MAX_PROVIDER_RESPONSE_BYTES:
            raise OcrProviderProblem(
                "OCR_PROVIDER_RESPONSE_TOO_LARGE",
                "The OCR provider returned an unexpectedly large response.",
                502,
            )
        try:
            parsed = json.loads(body)
        except (TypeError, ValueError) as exc:
            raise OcrProviderProblem(
                "OCR_PROVIDER_INVALID_RESPONSE",
                "The OCR provider returned an invalid response.",
                502,
            ) from exc
        if not isinstance(parsed, dict):
            raise OcrProviderProblem(
                "OCR_PROVIDER_INVALID_RESPONSE",
                "The OCR provider returned an invalid response.",
                502,
            )
        if parsed.get("error"):
            raise OcrProviderProblem("OCR_PROVIDER_ERROR", "The OCR provider returned an error.", 502)
        return parsed


def build_ocr_provider(settings: Settings):
    provider = (settings.ocr_provider or "none").strip().lower()
    if provider in {"", "none", "disabled"}:
        raise OcrProviderProblem(
            "OCR_PROVIDER_NOT_CONFIGURED",
            "External OCR is not configured on this server.",
            503,
        )
    if provider != "google_vision":
        raise OcrProviderProblem(
            "OCR_PROVIDER_UNSUPPORTED",
            "The configured OCR provider is not supported.",
            503,
        )
    if not settings.google_vision_api_key:
        raise OcrProviderProblem(
            "OCR_PROVIDER_NOT_CONFIGURED",
            "The OCR provider API key is not configured on this server.",
            503,
        )
    return GoogleVisionProvider(
        settings.google_vision_api_key,
        settings.ocr_timeout_seconds,
        settings.ocr_max_bytes,
    )
