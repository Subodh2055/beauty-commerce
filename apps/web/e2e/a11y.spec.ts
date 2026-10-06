import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { inStockProduct, makeUser, signIn } from "./helpers";

/**
 * Accessibility + responsive sweep: axe (WCAG 2.2 A/AA) finds no violations,
 * and nothing scrolls sideways, at phone, tablet, laptop and wide desktop.
 */
const WIDTHS = [375, 768, 1280, 1920];
test.describe.configure({ timeout: 420_000 });

async function audit(page: Page, path: string) {
  const problems: string[] = [];
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: width < 768 ? 812 : 900 });
    // "load", not "networkidle": remote demo images keep the network busy.
    await page.goto(path, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    // Client-loaded rails (recommendations, recently viewed) mount after "load" and
    // reveal on scroll: walk the page so every reveal has fired before measuring.
    await page.waitForTimeout(800);
    await page.evaluate(async () => {
      for (let y = 0; y < document.documentElement.scrollHeight; y += window.innerHeight / 2) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 120));
      }
      window.scrollTo(0, 0);
    });
    // Let entrance/reveal animations finish so axe measures final colours, not a
    // half-faded frame (infinite ones, like the scroll cue, are skipped).
    await page.evaluate(() =>
      Promise.race([
        Promise.all(
          document
            .getAnimations()
            .filter((a) => a.effect?.getTiming().iterations !== Infinity)
            .map((a) => a.finished.catch(() => undefined)),
        ),
        new Promise((r) => setTimeout(r, 5000)),
      ]),
    );
    await page.waitForTimeout(300);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    if (overflow > 1) problems.push(`${width}px: scrolls sideways by ${overflow}px`);
    if (width === 375 || width === 1280) {
      const result = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
        // Decorative motion layers are aria-hidden; axe can't see through
        // opacity animations mid-flight, so wait for reveals to settle.
        .analyze();
      for (const v of result.violations) {
        problems.push(
          `${width}px ${v.id} (${v.impact}): ${v.help} — ${v.nodes
            .slice(0, 3)
            .map((n) => `${n.target.join(" ")} [${n.failureSummary?.split("\n").pop()?.trim()}]`)
            .join(" | ")}`,
        );
      }
    }
  }
  return problems;
}

test.describe("public pages", () => {
  for (const path of ["/", "/products", "/search?q=citrus", "/find-your-scent", "/login", "/register", "/cart", "/sell"]) {
    test(`a11y + layout ${path}`, async ({ page }) => {
      expect(await audit(page, path)).toEqual([]);
    });
  }

  test("a11y + layout product page", async ({ page }) => {
    const p = await inStockProduct();
    expect(await audit(page, `/products/${p.slug}`)).toEqual([]);
  });
});

test.describe("signed-in pages", () => {
  test("customer account, orders, wishlist", async ({ page }) => {
    await signIn(page, await makeUser("a11y-shopper"));
    const problems = [];
    for (const path of ["/account", "/orders", "/wishlist", "/account/addresses"]) {
      problems.push(...(await audit(page, path)).map((p) => `${path} ${p}`));
    }
    expect(problems).toEqual([]);
  });

  test("admin and super admin", async ({ page }) => {
    await signIn(page, await makeUser("a11y-root", "SUPER_ADMIN"));
    const problems = [];
    for (const path of [
      "/admin",
      "/admin/orders",
      "/admin/analytics",
      "/admin/returns",
      "/admin/support",
      "/super-admin",
      "/super-admin/roles",
      "/super-admin/settings",
    ]) {
      problems.push(...(await audit(page, path)).map((p) => `${path} ${p}`));
    }
    expect(problems).toEqual([]);
  });
});
