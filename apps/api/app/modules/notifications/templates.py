"""Render subject + text + HTML for each order event.

Kept deliberately simple and inline (no template engine). n8n can ignore these
and build its own emails from the structured `payload`; SMTP fallback uses them.
"""

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


def render(event: str, data: dict) -> tuple[str, str, str]:
    if event == "order.placed":
        return order_placed(data)
    if event == "order.status_changed":
        return order_status_changed(data)
    return (f"Beauty Commerce: {event}", str(data), f"<pre>{data}</pre>")
