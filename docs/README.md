# Docs

The full planning knowledge base is an Obsidian vault
(`Beauty-Commerce-Obsidian`, kept outside this repo). Key decisions are
summarised here so they travel with the code.

## Decision log

| Decision | Choice | Reason |
|---|---|---|
| Backend | FastAPI + Python | AI-friendly, fast development, modern API stack |
| Web | Next.js + TypeScript + Tailwind | SEO + interactive commerce |
| Mobile | Flutter | One codebase for iOS/Android |
| Database | PostgreSQL | Strong relational commerce foundation |
| Vector | pgvector | Keep vector search close to product data initially |
| Cache | Redis | Caching and task infrastructure |
| Background | Celery | Application-level background processing |
| Automation | n8n | External integrations and workflows |
| Architecture | Modular monolith | Simpler initial deployment and maintenance |
| Deployment | Docker + Ubuntu VPS | Portable local/production environment |
| Product attributes | JSONB column on `products` (not an EAV `product_attributes` table) | Perfume and cosmetics carry different attribute shapes; JSONB avoids schema churn and is queryable with GIN if needed |
| Variant stock (V1) | `product_variants.stock_quantity` | Simple on-hand count until the inventory module adds reservations/transactions |
| Cart / wishlist (V1) | Browser localStorage | Server-side cart lands with auth in Phase 3; checkout always re-prices server-side |
| Docker host ports | Postgres 15432, Redis 16379 | Avoids clashing with locally installed Postgres/Redis on the dev machine |

## Core principles

- Start as a modular monolith, not microservices.
- FastAPI owns core business logic and transactions.
- n8n handles integrations and automation.
- PostgreSQL is the source of truth.
- AI features must not bypass authorization or business rules.
- Dockerize from day one.

## Order lifecycle

`CART → PENDING_PAYMENT → PAID → PROCESSING → SHIPPED → DELIVERED`
Alternative states: `CANCELLED`, `REFUNDED`, `PAYMENT_FAILED`.

## Definition of done

A feature is complete when: requirements documented · API contract defined ·
authorization implemented · validation implemented · migration exists ·
unit tests · integration tests where appropriate · frontend/mobile works ·
error states handled · logging adequate · security reviewed · docs updated ·
Docker/local env works.

## Development phases

1. Foundation — repo, monorepo, README, `.env.example`, Docker, dev Compose ✅
2. Backend — FastAPI app, config, DB, Alembic, logging, errors, security ✅
3. Commerce — ~~auth~~ ✅, ~~users (address book)~~ ✅, ~~catalog~~ ✅, ~~inventory~~ ✅ (stock + ledger), ~~search~~ ✅, ~~cart~~ ✅ (server + guest merge), ~~wishlist~~ ✅ (server + guest merge), ~~orders~~ ✅, payments (COD ✅; gateways stubbed), ~~reviews~~ ✅, ~~coupons~~ ✅
4. Frontend — ~~storefront, product pages, search~~ ✅, ~~account/login/register~~ ✅, ~~checkout, orders~~ ✅, ~~admin~~ ✅

## Admin, coupons, inventory (done)

- **Admin** (`/api/v1/admin`, gated by `require_roles("STAFF","ADMIN","SUPER_ADMIN")`): dashboard stats,
  all-orders list + status transitions (validated state machine; cancel/refund restocks),
  **full product CRUD** (create/edit/delete with variants + images; edit reconciles variants by id so
  the inventory ledger and order snapshots stay intact), **brand + category CRUD** (with parent nesting,
  self-parent guard, product-count warnings on delete — deletes SET NULL so products survive),
  product moderation (publish/archive/feature), coupon list/create, inventory adjust, notifications outbox.
  Web at `/admin` (dashboard, orders, products + editor, brands, categories, coupons, notifications) —
  client-gated by role.
  Promote a user: `python -m app.scripts.grant_role <email> ADMIN` (then re-login for a fresh token).
- **Coupons** (`coupons`, `coupon_usage`): PERCENT/FIXED, min-spend, max-discount, usage + per-user limits,
  active window. `POST /coupons/validate` and checkout both call the same `evaluate()`, so the quoted and
  charged discount can't diverge. Checkout re-validates against the server subtotal and records redemption
  in the order transaction. `orders.discount_total` now used.
- **Inventory ledger** (`inventory_transactions`): append-only signed movements (SALE/CANCEL/RESTOCK/ADJUST)
  with balance_after, order + admin references. Written on checkout, cancel/refund, and admin adjust.

## Auth (Phase 3, done)

- Endpoints under `/api/v1/auth`: `register`, `login`, `refresh`, `logout`, `me`,
  `verify-email`, `password/reset-request`, `password/reset-confirm`, `password/change`.
- Access tokens (short-lived JWT) + refresh tokens (long-lived JWT, `jti` tracked in
  `refresh_tokens`). **Refresh rotation with reuse detection**: replaying a revoked token
  revokes the whole family.
- argon2 password hashing (pwdlib). RBAC via `require_roles(...)` dependency; roles seeded
  (CUSTOMER/STAFF/VENDOR/ADMIN/SUPER_ADMIN), new signups get CUSTOMER.
- No user enumeration on reset-request. Password change / reset revokes all sessions.
- **Deferred (need external setup):** email delivery is logged, not sent, until SMTP is
  configured; Google/Apple OAuth need provider credentials; rate limiting needs Redis (Phase 8).
- Web: `/login`, `/register`, `/forgot-password`, real `/account`. Tokens in localStorage
  with auto-refresh on 401 (Phase 8 moves refresh tokens to httpOnly cookies).
5. Mobile — Flutter
6. AI — embeddings, semantic search, recommendations, RAG, assistant
7. Automation — n8n workflows (order notifications ✅; more per the vault checklist)

## Notifications (Phase 7, started)

- FastAPI emits **HMAC-signed events** to n8n (`app/integrations/notifications.py`); n8n delivers
  email/SMS (`infrastructure/n8n/order-notifications.workflow.json`). Falls back to direct SMTP,
  then to logs, so it works before n8n is wired.
- Events: `order.placed` (checkout), `order.status_changed` (customer cancel + every admin transition).
- Every emission is recorded in the `notifications` outbox table (migration 0007) and visible under
  **Admin → Notifications** (channel N8N/EMAIL/LOG + status).
- Enable n8n: set `N8N_WEBHOOK_URL` + `N8N_WEBHOOK_SECRET` in `.env` (see `infrastructure/n8n/README.md`).
8. Production — testing, security audit, VPS, Nginx, Cloudflare, backups, monitoring, CI/CD
