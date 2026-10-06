import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import type { Page } from "@playwright/test";

export const API = process.env.E2E_API_URL ?? "http://localhost:8000/api/v1";
export const PASSWORD = "E2e-secret-pass!42";

export async function api<T = unknown>(
  path: string,
  init: { method?: string; body?: unknown; token?: string } = {},
): Promise<T> {
  const opts: RequestInit = {
    method: init.method ?? (init.body ? "POST" : "GET"),
    headers: {
      "Content-Type": "application/json",
      ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  };
  // grantRole blocks the event loop; a pooled keep-alive socket may be stale after it.
  const res = await fetch(API + path, opts).catch(() => fetch(API + path, opts));
  if (!res.ok) throw new Error(`${init.method ?? "GET"} ${path} → ${res.status} ${await res.text()}`);
  return (res.status === 204 ? undefined : await res.json()) as T;
}

export const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Register a fresh account (optionally with a staff/vendor role) and return its email. */
export async function makeUser(prefix: string, role?: string): Promise<string> {
  const email = `${prefix}-${uid()}@e2e.example.com`;
  await api("/auth/register", { body: { email, password: PASSWORD, full_name: `${prefix} E2E` } });
  if (role) grantRole(email, role);
  return email;
}

export function grantRole(email: string, role: string): void {
  // E2E_GRANT_CMD: whitespace-separated program + args, e.g. "docker compose exec -T api python -m app.scripts.grant_role".
  const [file, ...args] = (
    process.env.E2E_GRANT_CMD ??
    `${process.platform === "win32" ? ".venv\\Scripts\\python.exe" : ".venv/bin/python"} -m app.scripts.grant_role`
  ).split(/\s+/);
  execFileSync(file, [...args, email, role], { cwd: resolve(__dirname, "../../api"), stdio: "pipe" });
}

interface Login {
  user: unknown;
  tokens: { access_token: string; refresh_token: string; expires_in: number };
}

export async function login(email: string, password = PASSWORD): Promise<Login> {
  return api<Login>("/auth/login", { body: { email, password } });
}

/** Sign the browser in the way the app does: localStorage session + the proxy's cookie. */
export async function signIn(page: Page, email: string, password = PASSWORD): Promise<Login> {
  const r = await login(email, password);
  await page.goto("/");
  const session = { user: r.user, ...r.tokens, session_started_at: Date.now() };
  await page.evaluate((s) => localStorage.setItem("beauty-commerce:auth:v1", JSON.stringify(s)), session);
  await page.evaluate(
    (t) =>
      fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ access_token: t }),
      }),
    r.tokens.access_token,
  );
  return r;
}

/** A published product with stock, for flows that need something to buy. */
export async function inStockProduct(): Promise<{ slug: string; name: string }> {
  const page = await api<{ items: { slug: string; name: string; in_stock: boolean; product_type: string }[] }>(
    "/products?size=40",
  );
  // Skip products other e2e runs just created: the cached listing may not show them yet.
  const p = page.items.find((i) => i.in_stock && !i.name.startsWith("E2E "));
  if (!p) throw new Error("No in-stock product: seed the catalog first");
  return p;
}
