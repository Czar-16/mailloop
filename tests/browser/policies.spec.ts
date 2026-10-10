import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
for (const route of ["privacy", "terms"]) {
  test(`public ${route} page is readable and accessible`, async ({ page }) => {
    await page.goto(`/${route}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      route === "privacy" ? "Privacy Policy" : "Terms of Service",
    );
    await expect(page.getByRole("main")).toContainText("Czar16");
    await expect(page.getByRole("main")).toContainText("czar16dev@proton.me");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect((await page.request.get("/api/account/export")).status()).toBe(401);
  });
}
