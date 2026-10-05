"""Render subject + text + HTML for each order event.

Kept deliberately simple and inline (no template engine). n8n can ignore these
and build its own emails from the structured `payload`; SMTP fallback uses them.
"""

import html as html_lib
import re
from decimal import Decimal

STATUS_MESSAGES = {
    "PENDING_PAYMENT": "We're waiting for your payment to confirm this order.",
    "PROCESSING": "We've received your order and are getting it ready.",
    "PAID": "Your payment was received — thank you!",
    "SHIPPED": "Good news! Your order is on its way.",
    "DELIVERED": "Your order has been delivered. We hope you love it!",
    "CANCELLED": "Your order has been cancelled.",
    "REFUNDED": "Your order has been refunded.",
    "PAYMENT_FAILED": "Your payment could not be processed.",
}


def _money(v, currency: str = "NPR") -> str:
    return f"{currency} {Decimal(str(v)):,.0f}"


def order_placed(data: dict) -> tuple[str, str, str]:
    n = data["order_number"]
    name = data.get("recipient") or "there"
    total = _money(data["total"], data["currency"])
    cur = data["currency"]
    lines = "\n".join(
        f"  - {i['product_name']} ({i['variant_name']}) x{i['quantity']}"
        f" — {_money(i['line_total'], cur)}"
        for i in data["items"]
    )
    subject = f"Order {n} confirmed — Beauty Commerce"
    text = (
        f"Hi {name},\n\nThanks for your order! We've received {n}.\n\n"
        f"{lines}\n\nTotal: {total}\nPayment: {data['payment_method']}\n\n"
        "We'll email you when it ships.\n\n— Beauty Commerce"
    )
    td = "padding:6px 0"
    rows = "".join(
        "<tr>"
        f"<td style='{td}'>{i['product_name']} · {i['variant_name']} × {i['quantity']}</td>"
        f"<td style='{td};text-align:right'>{_money(i['line_total'], cur)}</td>"
        "</tr>"
        for i in data["items"]
    )
    html = (
        f"<div style='font-family:sans-serif;max-width:520px'>"
        f"<h2>Order {n} confirmed</h2><p>Hi {name}, thanks for your order!</p>"
        f"<table style='width:100%;border-collapse:collapse'>{rows}"
        f"<tr><td style='padding-top:10px;font-weight:600'>Total</td>"
        f"<td style='padding-top:10px;text-align:right;font-weight:600'>{total}</td></tr></table>"
        f"<p>Payment: {data['payment_method']}</p><p>— Beauty Commerce</p></div>"
    )
    return subject, text, html


def order_status_changed(data: dict) -> tuple[str, str, str]:
    n = data["order_number"]
    status = data["status"]
    name = data.get("recipient") or "there"
    msg = STATUS_MESSAGES.get(status, f"Your order status is now {status}.")
    subject = f"Order {n}: {status.replace('_', ' ').title()} — Beauty Commerce"
    text = f"Hi {name},\n\n{msg}\n\nOrder: {n}\n\n— Beauty Commerce"
    html = (
        f"<div style='font-family:sans-serif;max-width:520px'>"
        f"<h2>Order {n}</h2><p>Hi {name},</p><p>{msg}</p><p>— Beauty Commerce</p></div>"
    )
    return subject, text, html


_PLACEHOLDER = re.compile(r"\{\{\s*(\w+)\s*\}\}")


def variables(event: str, data: dict) -> dict[str, str]:
    """Values an admin-edited template may use (see EMAIL_TEMPLATE_VARIABLES)."""
    cur = data.get("currency", "NPR")
    out = {
        "order_number": str(data.get("order_number", "")),
        "recipient": data.get("recipient") or "there",
        "total": _money(data["total"], cur) if "total" in data else "",
        "payment_method": str(data.get("payment_method", "")),
        "status": str(data.get("status", "")).replace("_", " ").title(),
        "status_message": STATUS_MESSAGES.get(data.get("status", ""), ""),
    }
    out["items"] = "\n".join(
        f"- {i['product_name']} ({i['variant_name']}) x{i['quantity']}"
        for i in data.get("items", [])
    )
    return out


def fill(template: str, values: dict[str, str], *, escape: bool = False) -> str:
    def sub(m: re.Match[str]) -> str:
        if m.group(1) not in values:
            return m.group(0)
        v = values[m.group(1)]
        return html_lib.escape(v) if escape else v

    return _PLACEHOLDER.sub(sub, template)


def render_override(event: str, data: dict, subject: str, body: str) -> tuple[str, str, str]:
    """Subject + text + HTML from an admin-edited template (plain text body;
    paragraphs become <p>, values are escaped in the HTML part)."""
    values = variables(event, data)
    text = fill(body, values)
    paragraphs = fill(html_lib.escape(body), values, escape=True).split("\n\n")
    html = (
        "<div style='font-family:sans-serif;max-width:520px'>"
        + "".join(f"<p>{p.replace(chr(10), '<br>')}</p>" for p in paragraphs)
        + "</div>"
    )
    return fill(subject, values), text, html


def render(event: str, data: dict) -> tuple[str, str, str]:
    if event == "order.placed":
        return order_placed(data)
    if event == "order.status_changed":
        return order_status_changed(data)
    return (f"Beauty Commerce: {event}", str(data), f"<pre>{data}</pre>")
