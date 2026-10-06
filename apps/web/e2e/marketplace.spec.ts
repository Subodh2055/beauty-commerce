import { expect, test } from "@playwright/test";
import { api, login, makeUser, signIn, uid } from "./helpers";

// A seeded demo vendor (python -m app.scripts.seed_catalog).
const VENDOR = { email: "attar@vendors.example.com", password: "Vendor@12345" };

/** Vendor lists a product → it waits in moderation → an admin approves → it's live. */
test("vendor adds a product, admin approves, it appears in the store", async ({ page, browser }) => {
  const name = `E2E Saffron Mist ${uid()}`;
  const sku = `E2E-${uid()}`.toUpperCase();

  // 1. Vendor creates and submits it.
  await signIn(page, VENDOR.email, VENDOR.password);
  await page.goto("/vendor/products/new");
  await page.locator('input[name="name"]').fill(name);
  await page.locator('textarea[name="description"]').fill("Saffron, rose and a warm amber base.");
  await page.locator('input[name="sku"]').fill(sku);
  await page.locator('input[name="variants.0.name"]').fill("50 ml");
  await page.locator('input[name="variants.0.price"]').fill("4200");
  await page.locator('input[name="variants.0.stock_quantity"]').fill("12");
  await page.getByRole("button", { name: /submit for review/i }).click();
  await expect(page.getByText(/in review/i).first()).toBeVisible({ timeout: 20_000 });

  // Not public yet.
  const vendorToken = (await login(VENDOR.email, VENDOR.password)).tokens.access_token;
  const mine = await api<{ items: { name: string; slug: string; status: string }[] }>(
    `/vendor/products?q=${encodeURIComponent(sku)}`,
    { token: vendorToken },
  );
  const created = mine.items.find((p) => p.name === name);
  expect(created?.status).toBe("PENDING");
  const hidden = await fetch(`${process.env.E2E_API_URL ?? "http://localhost:8000/api/v1"}/products/${created!.slug}`);
  expect(hidden.status).toBe(404);

  // 2. An admin approves it from the moderation queue (separate browser session).
  const adminContext = await browser.newContext();
  const admin = await adminContext.newPage();
  await signIn(admin, await makeUser("moderator", "SUPER_ADMIN"));
  // The queue is paged (oldest first); search it like a moderator would.
  await admin.goto(`/admin/moderation?q=${encodeURIComponent(name)}`);
  await admin.getByRole("button", { name: new RegExp(name) }).click();
  const drawer = admin.getByRole("dialog");
  await expect(drawer).toContainText("50 ml");
  await drawer.getByRole("button", { name: "Approve" }).click();
  await admin.getByRole("alertdialog").or(admin.getByRole("dialog").last()).getByRole("button", { name: /approve and publish/i }).click();
  await expect(admin.getByText("Product published")).toBeVisible();
  await adminContext.close();

  // 3. Shoppers can see and open it.
  await page.goto(`/products/${created!.slug}`);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(name);
  await expect(page.getByRole("button", { name: /add to bag/i })).toBeEnabled();
});
