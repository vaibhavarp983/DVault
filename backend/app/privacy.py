"""Shared masking helpers for synthetic contact handling."""

from __future__ import annotations

import re

EMAIL_PATTERN = re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b")
PHONE_PATTERN = re.compile(r"(?<!\d)(?:\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}(?!\d)")


def normalized_email(value: str) -> str | None:
    value = value.strip().lower()
    return value if EMAIL_PATTERN.fullmatch(value) else None


def normalized_phone(value: str) -> str | None:
    digits = re.sub(r"\D", "", value)
    if len(digits) == 10 and digits[0] in "6789":
        return f"+91{digits}"
    if len(digits) == 12 and digits.startswith("91") and digits[2] in "6789":
        return f"+{digits}"
    return None


def mask_value(value: str, classification: str) -> str:
    if classification == "DIRECT_IDENTIFIER":
        email = normalized_email(value)
        if email:
            local, domain = email.split("@", 1)
            return f"{local[:1]}***@{domain}"
        phone = normalized_phone(value)
        if phone:
            return f"******{phone[-4:]}"
        return "[redacted identifier]"
    if classification in {"PERSON_NAME", "ADDRESS", "DATE_OF_BIRTH"}:
        return "[redacted personal field]"
    if classification == "COMMUNICATION_CONTENT":
        return "[redacted content]"
    return "[available in source]"
