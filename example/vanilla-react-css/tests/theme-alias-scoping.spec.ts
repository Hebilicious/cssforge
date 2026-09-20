import { expect, type Page, test } from "@playwright/test";

const THEME_CLASS = "Another";
const SCOPE_HOST_SELECTOR = '[data-testid="scope-host"]';

/** Chromium's serialization of the `red` fallback declared by `.alias-probe`. */
const FALLBACK_COLOR = "rgb(255, 0, 0)";

/** Chromium's serialization of the `lime` fallback declared by the palette probes. */
const PALETTE_FALLBACK_COLOR = "rgb(0, 255, 0)";

type Placement = "root" | "descendant";

async function placeThemeClass(page: Page, placement: Placement) {
  await page.evaluate(
    ({ className, hostSelector, target }) => {
      document.documentElement.classList.remove(className);
      document.querySelector(hostSelector)?.classList.remove(className);
      const element =
        target === "root" ? document.documentElement : document.querySelector(hostSelector);
      element?.classList.add(className);
    },
    { className: THEME_CLASS, hostSelector: SCOPE_HOST_SELECTOR, target: placement },
  );
}

async function readColors(page: Page) {
  return page.evaluate(() => {
    const colorOf = (testId: string) => {
      const element = document.querySelector(`[data-testid="${testId}"]`);
      if (!element) throw new Error(`Missing [data-testid="${testId}"]`);
      return getComputedStyle(element).color;
    };

    return {
      alias: colorOf("alias-probe"),
      anotherPalette: colorOf("another-probe"),
      brandPalette: colorOf("brand-probe"),
      rootPrimary: getComputedStyle(document.documentElement)
        .getPropertyValue("--primary")
        .trim(),
    };
  });
}

test.describe("light color scheme", () => {
  test.use({ colorScheme: "light" });

  test("a theme class on the root element resolves the alias to the palette color", async ({
    page,
  }) => {
    await page.goto("/");
    await placeThemeClass(page, "root");

    const { alias, brandPalette } = await readColors(page);

    expect(brandPalette).not.toBe(PALETTE_FALLBACK_COLOR);
    expect(alias).toBe(brandPalette);
    expect(alias).not.toBe(FALLBACK_COLOR);
  });

  test("a theme class on a descendant still resolves an alias whose palette is root-scoped", async ({
    page,
  }) => {
    await page.goto("/");
    await placeThemeClass(page, "descendant");

    const { alias, brandPalette } = await readColors(page);

    expect(brandPalette).not.toBe(PALETTE_FALLBACK_COLOR);
    expect(alias).toBe(brandPalette);
    expect(alias).not.toBe(FALLBACK_COLOR);
  });
});

test.describe("dark color scheme", () => {
  test.use({ colorScheme: "dark" });

  test("a theme class on the root element resolves the dark alias to the palette declared there", async ({
    page,
  }) => {
    await page.goto("/");
    await placeThemeClass(page, "root");

    const { alias, anotherPalette, rootPrimary } = await readColors(page);

    expect(anotherPalette).not.toBe(PALETTE_FALLBACK_COLOR);
    expect(alias).toBe(anotherPalette);
    expect(alias).not.toBe(FALLBACK_COLOR);
    expect(rootPrimary).not.toBe("");
  });

  test("a theme class on a descendant cannot repair the root-scoped alias", async ({
    page,
  }) => {
    await page.goto("/");
    await placeThemeClass(page, "descendant");

    const { alias, anotherPalette, rootPrimary } = await readColors(page);

    // The palette is scoped to :root.Another, so a theme class on a descendant
    // does not make the token available in that descendant subtree either, and
    // the alias computed on :root has nothing to substitute.
    expect(anotherPalette).toBe(PALETTE_FALLBACK_COLOR);
    expect(rootPrimary).toBe("");
    expect(alias).toBe(FALLBACK_COLOR);
  });
});
