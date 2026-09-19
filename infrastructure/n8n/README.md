# n8n — automation layer

Per the project plan, **FastAPI emits signed events; n8n delivers them** (email,
SMS, FCM, CRM…). Core authorization, pricing, inventory and order transactions
never move into n8n.

## How events flow

```text
FastAPI  ──POST (HMAC-signed)──►  n8n Webhook  ──►  Verify  ──►  Route  ──►  Email / SMS / …
```

FastAPI's `app/integrations/notifications.py` posts to `N8N_WEBHOOK_URL` with an
`X-Signature: <hmac-sha256(N8N_WEBHOOK_SECRET, body)>` header. Every emission is
also recorded in the `notifications` table (admin sees it under **Admin →
Notifications**) so nothing is silently lost.

Event payloads:

- `order.placed` — new order (customer confirmation + admin alert)
- `order.status_changed` — PAID / PROCESSING / SHIPPED / DELIVERED / CANCELLED / REFUNDED

## Set it up

1. Start n8n (already in `compose.dev.yml`): visit http://localhost:5678.
2. **Import** `order-notifications.workflow.json` (Workflows → Import from File).
3. Add an **SMTP credential** to the two *Send Email* nodes (or swap them for
   Twilio / FCM / Slack nodes).
4. Set `N8N_WEBHOOK_SECRET` in n8n's environment to match the API's `.env`.
5. Activate the workflow, copy its **Production webhook URL**, and put it in the
   API `.env`:

   ```env
   N8N_WEBHOOK_URL=http://localhost:5678/webhook/beauty-orders
   N8N_WEBHOOK_SECRET=<same-long-random-secret-as-n8n>
   ```

6. Restart the API. New orders now dispatch to n8n (channel `N8N` in the outbox).

## Without n8n

If `N8N_WEBHOOK_URL` is empty the API falls back to **direct SMTP** (when
`SMTP_*` is set) and otherwise **logs** the notification (channel `LOG`). So the
flow is testable end-to-end before n8n is configured.

## Next workflows (from the vault)

Low-stock alert, daily sales report, abandoned cart, payment-failure alert,
review sentiment, new-product embedding refresh — all follow the same
webhook-in / action-out shape.
