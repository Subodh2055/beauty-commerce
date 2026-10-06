import { expect, test, type Locator } from "@playwright/test";
import { api, inStockProduct, makeUser, signIn } from "./helpers";

/** A new shopper browses, adds to the bag and checks out with cash on delivery. */
test("browse → bag → checkout → order confirmed", async ({ page }) => {
  const email = await makeUser("shopper");
  const session = await signIn(page, email);
  const product = await inStockProduct();

  // Browse: the listing links to the product page.
  await page.goto("/products");
  // The wishlist heart must sit above the card's stretched link (tapping it saves,
  // it doesn't open the product).
  const heart = page.getByRole("button", { name: `Save ${product.name} to wishlist` }).first();
  await heart.scrollIntoViewIfNeeded();
  const box = (await heart.boundingBox())!;
  const onTop = await page.evaluate(
    ({ x, y }) => document.elementFromPoint(x, y)?.closest("button")?.getAttribute("aria-label") ?? null,
    { x: box.x + box.width / 2, y: box.y + box.height / 2 },
  );
  expect(onTop).toBe(`Save ${product.name} to wishlist`);

  // The card title is a stretched link covering the card (what a shopper clicks).
  await page.getByRole("link", { name: product.name, exact: true }).first().click();
  await expect(page).toHaveURL(new RegExp(`/products/${product.slug}$`));
  await expect(page.getByRole("heading", { level: 1 })).toContainText(product.name);

  // Add to bag → the bag drawer opens with a checkout button.
  await page.getByRole("button", { name: /add to bag/i }).click();
  const drawer = page.getByRole("dialog");
  await expect(drawer).toContainText(product.name);
  await drawer.getByRole("link", { name: /checkout/i }).click();
  await expect(page).toHaveURL(/\/checkout$/);

  // Address (a fresh account has none saved, so the form shows). Typing can land
  // before hydration resets the controlled inputs, so re-fill until it sticks.
  const fill = async (field: Locator, value: string) =>
    expect(async () => {
      await field.fill(value);
      await expect(field).toHaveValue(value, { timeout: 1_000 });
    }).toPass({ timeout: 15_000 });
  await fill(page.locator("#co-recipient_name"), "Asha Shrestha");
  await fill(page.locator("#co-phone"), "9800000000");
  await fill(page.locator("#co-line1"), "Durbar Marg 1");
  await fill(page.locator("#co-city"), "Kathmandu");
  await page.getByRole("button", { name: "Continue to delivery" }).click();
  await page.getByRole("button", { name: "Continue to payment" }).click();
  await page.getByLabel(/cash on delivery/i).check();
  await page.getByRole("button", { name: "Review order" }).click();
  await expect(page.getByText("Durbar Marg 1")).toBeVisible();
  await page.getByRole("button", { name: /place order/i }).click();

  // Confirmation page, and the order exists server-side.
  await expect(page).toHaveURL(/\/orders\/[0-9a-f-]{36}/, { timeout: 20_000 });
  await expect(page.getByText(/your order is confirmed/i)).toBeVisible();
  const orderId = page.url().match(/\/orders\/([0-9a-f-]{36})/)![1];
  const order = await api<{ status: string; items: { product_name: string }[] }>(`/orders/${orderId}`, {
    token: session.tokens.access_token,
  });
  expect(order.status).toBe("PROCESSING");
  expect(order.items.map((i) => i.product_name)).toContain(product.name);
});
