from __future__ import annotations

import base64
import json

import pytest

from app.config import Settings
from app.ocr_provider import (
    GoogleVisionProvider,
    OcrProviderProblem,
    parse_vision_response,
    validate_id_proof_content,
)

BASE = "/api/v1/workspaces/default/demo/id-proof/ocr"
PNG_BYTES = b"\x89PNG\r\n\x1a\n" + b"0" * 64
PDF_BYTES = b"%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF"

VISION_IMAGE_RESPONSE = {
    "responses": [
        {
            "fullTextAnnotation": {
                "text": "Name: Rowan Ellis\nDate of Birth: 01/01/1990",
                "pages": [
                    {
                        "blocks": [
                            {
                                "paragraphs": [
                                    {
                                        "words": [
                                            {"symbols": [{"text": "Name:"}], "confidence": 0.98},
                                            {"symbols": [{"text": "Rowan"}], "confidence": 0.95},
                                            {"symbols": [{"text": "Ellis"}], "confidence": 0.94},
                                            {"symbols": [{"text": "01/01/1990"}], "confidence": 0.92},
                                        ]
                                    }
                                ]
                            }
                        ]
                    }
                ],
            }
        }
    ]
}

VISION_FILE_RESPONSE = {
    "responses": [
        {
            "responses": [
                VISION_IMAGE_RESPONSE["responses"][0],
            ]
        }
    ]
}


def _configure(monkeypatch: pytest.MonkeyPatch, **values: object) -> Settings:
    settings = Settings(
        ocr_provider="google_vision",
        google_vision_api_key="test-vision-key",
        **values,
    )
    monkeypatch.setattr("app.ocr_api.get_settings", lambda: settings)
    return settings


def test_ocr_requires_provider_configuration(client) -> None:
    response = client.post(BASE, content=PNG_BYTES, headers={"content-type": "image/png"})
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "OCR_PROVIDER_NOT_CONFIGURED"


def test_ocr_rejects_unsupported_content_type(client, monkeypatch: pytest.MonkeyPatch) -> None:
    _configure(monkeypatch)
    response = client.post(BASE, content=b"hello", headers={"content-type": "text/plain"})
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "INVALID_TYPE"


def test_ocr_rejects_oversized_upload(client, monkeypatch: pytest.MonkeyPatch) -> None:
    _configure(monkeypatch, ocr_max_bytes=8)
    response = client.post(BASE, content=b"x" * 9, headers={"content-type": "image/png"})
    assert response.status_code == 413
    assert response.json()["error"]["code"] == "FILE_TOO_LARGE"


def test_ocr_returns_only_ocr_text_and_word_confidence(client, monkeypatch: pytest.MonkeyPatch) -> None:
    _configure(monkeypatch)
    monkeypatch.setattr(
        "app.ocr_provider.GoogleVisionProvider._post_json",
        lambda self, url, payload: VISION_IMAGE_RESPONSE,
    )
    response = client.post(
        BASE,
        content=PNG_BYTES,
        headers={"content-type": "image/png", "cache-control": "no-store"},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["text"] == "Name: Rowan Ellis\nDate of Birth: 01/01/1990"
    assert body["provider"] == "google_vision"
    assert body["method"] == "external_ocr"
    assert body["pages"] == 1
    assert len(body["words"]) == 4
    assert body["words"][1] == {"text": "Rowan", "confidence": 0.95}
    assert 0.94 <= body["confidence"] <= 0.96
    assert response.headers["cache-control"] == "no-store"
    assert "test-vision-key" not in response.text


def test_ocr_uses_the_files_endpoint_for_pdfs(client, monkeypatch: pytest.MonkeyPatch) -> None:
    _configure(monkeypatch)
    calls: list[tuple[str, dict]] = []

    def fake_post(self, url: str, payload: dict) -> dict:
        calls.append((url, payload))
        return VISION_FILE_RESPONSE

    monkeypatch.setattr("app.ocr_provider.GoogleVisionProvider._post_json", fake_post)
    response = client.post(BASE, content=PDF_BYTES, headers={"content-type": "application/pdf"})
    assert response.status_code == 200, response.text
    assert calls and calls[0][0].endswith("/files:annotate")
    assert calls[0][1]["requests"][0]["inputConfig"]["mimeType"] == "application/pdf"
    assert "content" in calls[0][1]["requests"][0]["inputConfig"]


def test_provider_error_is_safe(client, monkeypatch: pytest.MonkeyPatch) -> None:
    _configure(monkeypatch)

    def fail(self, url: str, payload: dict) -> dict:
        raise OcrProviderProblem(
            "OCR_PROVIDER_UNAVAILABLE",
            "The OCR provider is unavailable right now.",
            503,
        )

    monkeypatch.setattr("app.ocr_provider.GoogleVisionProvider._post_json", fail)
    response = client.post(BASE, content=PNG_BYTES, headers={"content-type": "image/png"})
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "OCR_PROVIDER_UNAVAILABLE"
    assert "PNG" not in response.text


def test_api_key_is_sent_in_a_header_not_the_url(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict[str, object] = {}

    class FakeResponse:
        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def read(self, size: int = -1) -> bytes:
            return json.dumps(VISION_IMAGE_RESPONSE).encode()

    def fake_urlopen(request, timeout=0):
        captured["url"] = request.full_url
        captured["headers"] = {key.lower(): value for key, value in request.header_items()}
        captured["data"] = request.data
        return FakeResponse()

    monkeypatch.setattr("app.ocr_provider.urllib.request.urlopen", fake_urlopen)
    provider = GoogleVisionProvider("secret-vision-key", 5.0, 1024)
    result = provider.recognize(PNG_BYTES, "image/png")

    assert result["provider"] == "google_vision"
    assert "secret-vision-key" not in str(captured["url"])
    assert captured["headers"]["x-goog-api-key"] == "secret-vision-key"
    payload = json.loads(captured["data"])
    assert payload["requests"][0]["image"]["content"] == base64.b64encode(PNG_BYTES).decode("ascii")


def test_parser_handles_image_and_file_response_shapes() -> None:
    image = parse_vision_response(VISION_IMAGE_RESPONSE)
    file_result = parse_vision_response(VISION_FILE_RESPONSE)
    assert image["text"] == file_result["text"]
    assert image["words"] == file_result["words"]
    assert image["pages"] == file_result["pages"] == 1


def test_parser_rejects_responses_without_text() -> None:
    with pytest.raises(OcrProviderProblem) as caught:
        parse_vision_response({"responses": [{"fullTextAnnotation": {"text": ""}}]})
    assert caught.value.code == "OCR_NO_TEXT"


def test_pdf_safety_validation() -> None:
    with pytest.raises(OcrProviderProblem) as caught:
        validate_id_proof_content(
            b"%PDF-1.4\n/JavaScript\n%%EOF",
            "application/pdf",
            1024,
        )
    assert caught.value.code == "UNSAFE_PDF"
