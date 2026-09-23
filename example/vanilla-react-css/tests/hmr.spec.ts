import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

/**
 * A token the other suites never assert, so mutating the config while they run
 * cannot change their expectations. The config sets `3: "12px"`, which the
 * spacing module emits as `0.75rem`.
 */
const TOKEN = "--spacing-size-3";
const CONFIG_BEFORE = '3: "12px"';
const CONFIG_AFTER = '3: "13px"';
const VALUE_BEFORE = "0.75rem";
const VALUE_AFTER = "0.8125rem";

const configUrl = new URL("../cssforge.config.ts", import.meta.url);

/** Reads a custom property from the document root. */
const readToken = (page: import("@playwright/test").Page, token: string) =>
	page.evaluate(
		(name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim(),
		token,
	);

test("token config edits update the styles in the running dev server", async ({ page }) => {
	const originalConfig = await readFile(configUrl, "utf8");
	expect(originalConfig).toContain(CONFIG_BEFORE);

	// A full page reload clears this marker, so a surviving marker proves the
	// stylesheet was updated in place.
	const marker = "cssforge-hmr-marker";

	try {
		await page.goto("/");
		expect(await readToken(page, TOKEN)).toBe(VALUE_BEFORE);
		await page.evaluate((value) => {
			(window as unknown as Record<string, unknown>).__cssforgeMarker = value;
		}, marker);

		await writeFile(
			configUrl,
			originalConfig.replace(CONFIG_BEFORE, CONFIG_AFTER),
			"utf8",
		);

		await expect
			.poll(() => readToken(page, TOKEN), {
				message: "the dev server must serve the regenerated token value",
				timeout: 15_000,
			})
			.toBe(VALUE_AFTER);

		expect(
			await page.evaluate(
				() => (window as unknown as Record<string, unknown>).__cssforgeMarker,
			),
			"the stylesheet must update without reloading the page",
		).toBe(marker);
	} finally {
		await writeFile(configUrl, originalConfig, "utf8");
	}
});
