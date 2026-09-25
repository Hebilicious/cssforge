import { expect, test } from "@playwright/test";

/** Written as `{ hex: "#1d4ed8" }` in `cssforge.config.ts`. */
const BRAND_PRIMARY_HEX = "#1d4ed8";

/** What Chromium computes for the fallback `#1d4ed8`, and not for the oklch value. */
const BRAND_PRIMARY_FALLBACK_RGB = "rgb(29, 78, 216)";

const FALLBACK_RULE = "--palette-brand-primary: #1d4ed8";

/** The generated condition, and the open condition that stands in for a browser without oklch. */
const GATED_CONDITION = "not (color: oklch";
const OPEN_CONDITION = "(color: oklch";

/**
 * Reads the generated `@supports` block from the served stylesheet, so the
 * promise is observed through the browser's own CSSOM rather than the source
 * string the generator produced.
 */
const readFallbackRule = (page: import("@playwright/test").Page) =>
  page.evaluate(() => {
    const supportsRules = [...document.styleSheets].flatMap((styleSheet) =>
      [...styleSheet.cssRules].filter(
        (rule): rule is CSSSupportsRule => rule instanceof CSSSupportsRule,
      ),
    );
    const oklchRule = supportsRules.find((rule) => rule.conditionText.includes("oklch"));

    return oklchRule
      ? { conditionText: oklchRule.conditionText, cssText: oklchRule.cssText }
      : null;
  });

const readBrandToken = (page: import("@playwright/test").Page) =>
  page.evaluate(() =>
    getComputedStyle(document.documentElement)
      .getPropertyValue("--palette-brand-primary")
      .trim(),
  );

test("the oklch fallback is gated on missing support and stays inert where it is supported", async ({
  page,
}) => {
  await page.goto("/");

  const fallbackRule = await readFallbackRule(page);
  const browser = await page.evaluate(() => ({
    supportsOklch: CSS.supports("color", "oklch(0% 0 0)"),
    brandToken: getComputedStyle(document.documentElement)
      .getPropertyValue("--palette-brand-primary")
      .trim(),
    brandColor: getComputedStyle(
      document.querySelector('[data-testid="brand-probe"]') as Element,
    ).color,
  }));

  // The generated stylesheet carries the fallback for this color.
  expect(fallbackRule?.conditionText).toBe("not (color: oklch(0% 0 0))");
  expect(fallbackRule?.cssText).toContain(FALLBACK_RULE);

  // Chromium supports oklch, so the negated condition keeps the block inert:
  // the token still computes to the modern value, and the probe still renders
  // in the modern color space instead of the fallback hex.
  expect(browser.supportsOklch).toBe(true);
  expect(browser.brandToken).not.toBe(BRAND_PRIMARY_HEX);
  expect(browser.brandToken.startsWith("oklch(")).toBe(true);
  expect(browser.brandColor.startsWith("oklch(")).toBe(true);
  expect(browser.brandColor).not.toBe(BRAND_PRIMARY_FALLBACK_RGB);
});

test("the generated fallback applies when the gate is open", async ({ page }) => {
  await page.goto("/");

  const gated = await readBrandToken(page);

  // Chromium cannot disable oklch support, so the gate is opened on the
  // generated rule itself: the declarations, their selector and their position
  // in the cascade are the ones a browser without oklch support would read.
  const opened = await page.evaluate(
    ({ from, to }) => {
      const rule = [...document.styleSheets]
        .flatMap((styleSheet) => [...styleSheet.cssRules])
        .find(
          (candidate): candidate is CSSSupportsRule =>
            candidate instanceof CSSSupportsRule &&
            candidate.conditionText.includes("oklch"),
        );
      if (!rule) throw new Error("Missing the generated oklch @supports block");

      const style = document.createElement("style");
      style.textContent = rule.cssText.replace(from, to);
      document.head.append(style);

      return (
        getComputedStyle(document.documentElement)
          .getPropertyValue("--palette-brand-primary")
          .trim() || null
      );
    },
    { from: GATED_CONDITION, to: OPEN_CONDITION },
  );

  expect(gated.startsWith("oklch(")).toBe(true);
  expect(opened).toBe(BRAND_PRIMARY_HEX);
});
