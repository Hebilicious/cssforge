import { expect, test } from "@playwright/test";

test("cssforge variables exist and are applied in the DOM", async ({ page }) => {
  await page.goto("/");

  const root = await page.evaluate(() => {
    const css = getComputedStyle(document.documentElement);
    return {
      spacing: css.getPropertyValue("--spacing-size-4").trim(),
      color: css.getPropertyValue("--palette-brand-primary").trim(),
      type: css.getPropertyValue("--typography_fluid-base-text-m").trim(),
    };
  });

  expect(root.spacing).not.toBe("");
  expect(root.color).not.toBe("");
  expect(root.type).not.toBe("");

  const tokenCard = page.getByTestId("token-card");
  await expect(tokenCard).toBeVisible();

  const computed = await tokenCard.evaluate((el) => {
    const css = getComputedStyle(el);
    return {
      paddingTop: css.paddingTop,
      backgroundColor: css.backgroundColor,
      fontSize: css.fontSize,
    };
  });

  expect(parseFloat(computed.paddingTop)).toBeGreaterThan(0);
  expect(computed.backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
  expect(parseFloat(computed.fontSize)).toBeGreaterThan(0);
});
