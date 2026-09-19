"""Notification template + signing tests (no DB, no network)."""

from app.integrations.notifications import sign
from app.modules.notifications.templates import render


def _order_data() -> dict:
    return {
        "order_number": "BC-2026-00042",
        "status": "PROCESSING",
        "payment_method": "COD",
        "recipient": "Asha",
        "total": "2400",
        "currency": "NPR",
        "items": [
            {
                "product_name": "Oud Nocturne",
                "variant_name": "50 ml",
                "quantity": 1,
                "line_total": "2400",
            },
        ],
    }


def test_order_placed_template_has_number_and_total() -> None:
    subject, text, html = render("order.placed", _order_data())
    assert "BC-2026-00042" in subject
    assert "Oud Nocturne" in text
    assert "NPR 2,400" in html


def test_status_changed_template_uses_friendly_message() -> None:
    subject, text, html = render("order.status_changed", _order_data())
    assert "Processing" in subject
    assert "getting it ready" in text


def test_unknown_event_still_renders() -> None:
    subject, _, _ = render("something.else", {"x": 1})
    assert "something.else" in subject


def test_signature_is_deterministic_hmac() -> None:
    body = b'{"event":"order.placed"}'
    s1 = sign(body)
    s2 = sign(body)
    assert s1 == s2 and len(s1) == 64  # sha256 hex
