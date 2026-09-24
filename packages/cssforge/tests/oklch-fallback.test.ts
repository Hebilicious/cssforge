import Color from "colorjs.io";
import { generateJSON, generateTS } from "../src/generator.ts";
import type { CSSForgeConfig } from "../src/mod.ts";
import { defineConfig, generateCSS, generateStyleDictionaryJSON } from "../src/mod.ts";
import { assert, assertEquals, assertThrows, Deno } from "./vitest-compat.ts";

/**
 * The fallback value declared for `key` inside the generated `@supports` block,
 * read from the block rather than the root declaration above it.
 */
const fallbackValue = (css: string, key: string): string => {
	const block = css.slice(css.indexOf("@supports"));
	const match = new RegExp(`${key}: ([^;]+);`).exec(block);

	if (!match) throw new Error(`Expected a fallback declaration for ${key} in:\n${css}`);

	return match[1];
};

Deno.test("generateCSS - palette fallback emits an sRGB hex declaration under @supports", () => {
	const config = defineConfig({
		colors: {
			palette: {
				value: {
					coral: {
						100: { hex: "#FF7F50" },
					},
				},
				settings: { fallback: "hex" },
			},
		},
	});

	assertEquals(
		generateCSS(config),
		[
			"/*____ CSSForge ____*/",
			":root {",
			"/*____ Colors ____*/",
			"/* Palette */",
			"/* coral */",
			"--palette-coral-100: oklch(73.511% 0.16799 40.24666);",
			"}",
			"@supports not (color: oklch(0% 0 0)) {",
			"  :root {",
			"    /* coral */",
			"    --palette-coral-100: #ff7f50;",
			"  }",
			"}",
		].join("\n"),
	);
});

Deno.test("generateCSS - a palette color without variants emits no fallback block", () => {
	const config = defineConfig({
		colors: {
			palette: {
				value: { empty: { value: {} } },
				settings: { fallback: "hex" },
			},
		},
	});

	assertEquals(generateCSS(config).includes("@supports"), false);
});

Deno.test("generateCSS - applies the palette format with per-color overrides", () => {
	const config = defineConfig({
		colors: {
			palette: {
				value: {
					coral: { 100: { hex: "#FF7F50" } },
					soft: { 100: "rgb(0 0 0 / 12%)" },
					brand: {
						value: { 100: { hex: "#FF0000" } },
						settings: { fallback: "hex" },
					},
					opted: {
						value: { 100: { hex: "#00FF00" } },
						settings: { fallback: false },
					},
				},
				settings: { fallback: "rgb" },
			},
		},
	});

	const css = generateCSS(config);
	const lines = css.split("\n");
	const fallbackStart = lines.indexOf("@supports not (color: oklch(0% 0 0)) {");

	assert(fallbackStart > 0, `Expected a fallback block. Received:\n${css}`);
	assertEquals(lines.slice(fallbackStart), [
		"@supports not (color: oklch(0% 0 0)) {",
		"  :root {",
		"    /* coral */",
		"    --palette-coral-100: rgb(255 127 80);",
		"    /* soft */",
		"    --palette-soft-100: rgb(0 0 0 / 0.12);",
		"    /* brand */",
		"    --palette-brand-100: #ff0000;",
		"  }",
		"}",
	]);
	assertEquals(css.includes("--palette-opted-100: #"), false);
});

Deno.test("generateCSS - a hex fallback keeps alpha as an eight digit hex", () => {
	const config = defineConfig({
		colors: {
			palette: {
				value: {
					soft: { 100: "rgb(0 0 0 / 12%)" },
				},
				settings: { fallback: "hex" },
			},
		},
	});

	assertEquals(
		generateCSS(config),
		[
			"/*____ CSSForge ____*/",
			":root {",
			"/*____ Colors ____*/",
			"/* Palette */",
			"/* soft */",
			"--palette-soft-100: oklch(0% 0 0 / 12%);",
			"}",
			"@supports not (color: oklch(0% 0 0)) {",
			"  :root {",
			"    /* soft */",
			"    --palette-soft-100: #0000001f;",
			"  }",
			"}",
		].join("\n"),
	);
});

Deno.test("generateCSS - a wide gamut color falls back to the CSS gamut mapped sRGB value", () => {
	// `oklch(70% 0.4 20)` cannot be shown in sRGB: its conversion is
	// `rgb(336 -117 10)`, and clipping each channel would give `#ff000a`. The
	// fallback keeps the authored hue instead, which is how a browser maps the
	// color it cannot display.
	const config = defineConfig({
		colors: {
			palette: {
				value: { vivid: { 100: { oklch: "oklch(70% 0.4 20)" } } },
				settings: { fallback: "hex" },
			},
		},
	});

	const fallback = fallbackValue(generateCSS(config), "--palette-vivid-100");

	assertEquals(fallback === "#ff000a", false);
	assertEquals(new Color(fallback).inGamut("srgb", { epsilon: 0 }), true);
});

Deno.test("generateCSS - fallback mirrors the color selector and at-rule", () => {
	const config = defineConfig({
		colors: {
			palette: {
				value: {
					dark: {
						value: { 900: { hex: "#000" } },
						settings: { atRule: "@media (prefers-color-scheme: dark)" },
					},
					another: {
						value: { 900: { hex: "#fff" } },
						settings: { selector: ":root.Another" },
					},
					card: {
						value: { 900: { hex: "#111" } },
						settings: { atRule: "@container (min-width: 40rem)", selector: ".card" },
					},
				},
				settings: { fallback: "hex" },
			},
		},
	});

	const css = generateCSS(config);

	assert(
		css.endsWith(
			[
				"@media (prefers-color-scheme: dark) {",
				"  @supports not (color: oklch(0% 0 0)) {",
				"    :root {",
				"      /* dark */",
				"      --palette-dark-900: #000000;",
				"    }",
				"  }",
				"}",
				"@supports not (color: oklch(0% 0 0)) {",
				"  :root.Another {",
				"    /* another */",
				"    --palette-another-900: #ffffff;",
				"  }",
				"}",
				"@container (min-width: 40rem) {",
				"  @supports not (color: oklch(0% 0 0)) {",
				"    .card {",
				"      /* card */",
				"      --palette-card-900: #111111;",
				"    }",
				"  }",
				"}",
			].join("\n"),
		),
		`Expected the fallback blocks at the end of:\n${css}`,
	);
});

Deno.test("generateJSON and generateTS - fallback is part of the token object", () => {
	const config = defineConfig({
		colors: {
			palette: {
				value: { coral: { 100: { hex: "#FF7F50" } } },
				settings: { fallback: "hex" },
			},
		},
	});

	assertEquals(JSON.parse(generateJSON(config)), {
		palette: {
			coral: {
				"100": {
					key: "--palette-coral-100",
					value: "oklch(73.511% 0.16799 40.24666)",
					variable: "--palette-coral-100: oklch(73.511% 0.16799 40.24666);",
					fallback: "#ff7f50",
				},
			},
		},
	});
	assertEquals(generateTS(config).includes('"fallback": "#ff7f50"'), true);
});

Deno.test("generateJSON - token objects omit the fallback when none is configured", () => {
	const config = defineConfig({
		colors: {
			palette: {
				value: { coral: { 100: { hex: "#FF7F50" } } },
			},
		},
	});

	assertEquals(JSON.parse(generateJSON(config)), {
		palette: {
			coral: {
				"100": {
					key: "--palette-coral-100",
					value: "oklch(73.511% 0.16799 40.24666)",
					variable: "--palette-coral-100: oklch(73.511% 0.16799 40.24666);",
				},
			},
		},
	});
});

Deno.test("generateStyleDictionaryJSON - exposes the fallback beside the resolved value", () => {
	const config = defineConfig({
		colors: {
			palette: {
				value: { coral: { 100: { hex: "#FF7F50" } } },
				settings: { fallback: "hex" },
			},
		},
	});

	const token = JSON.parse(generateStyleDictionaryJSON(config)).palette.coral["100"];

	assertEquals(token.$fallback, "#ff7f50");
	assertEquals(token.attributes.fallback, "#ff7f50");
	assertEquals(token.$resolvedValue, "oklch(73.511% 0.16799 40.24666)");
});

Deno.test("generateCSS - rejects an unsupported fallback format", () => {
	const palette = { value: { coral: { 100: { hex: "#FF7F50" } } } };
	const invalidPalette = {
		colors: { palette: { ...palette, settings: { fallback: "oklch" } } },
	} as unknown as CSSForgeConfig;
	const invalidColor = {
		colors: {
			palette: {
				value: {
					coral: {
						value: { 100: { hex: "#FF7F50" } },
						settings: { fallback: "sqrgb" },
					},
				},
			},
		},
	} as unknown as CSSForgeConfig;

	const paletteError = assertThrows(() => generateCSS(invalidPalette));
	const colorError = assertThrows(() => generateCSS(invalidColor));

	assert(
		paletteError.message.includes('"palette.settings"'),
		`Expected the error to name "palette.settings". Received: ${paletteError.message}`,
	);
	assert(
		colorError.message.includes('"palette.coral.settings"'),
		`Expected the error to name "palette.coral.settings". Received: ${colorError.message}`,
	);
});

Deno.test("generateCSS - rejects a fallback that is not inside settings", () => {
	const palette = { value: { coral: { 100: { hex: "#FF7F50" } } } };
	const misplacedPalette = {
		colors: { palette: { ...palette, fallback: "hex" } },
	} as unknown as CSSForgeConfig;
	const misplacedColor = {
		colors: {
			palette: {
				value: {
					coral: { value: { 100: { hex: "#FF7F50" } }, fallback: "hex" },
				},
			},
		},
	} as unknown as CSSForgeConfig;
	const settingsNotAnObject = {
		colors: { palette: { ...palette, settings: "hex" } },
	} as unknown as CSSForgeConfig;

	const paletteError = assertThrows(() => generateCSS(misplacedPalette));
	const colorError = assertThrows(() => generateCSS(misplacedColor));
	const settingsError = assertThrows(() => generateCSS(settingsNotAnObject));

	assert(
		paletteError.message.includes('"palette"'),
		`Expected the error to name "palette". Received: ${paletteError.message}`,
	);
	assert(
		colorError.message.includes('"palette.coral"'),
		`Expected the error to name "palette.coral". Received: ${colorError.message}`,
	);
	assert(
		settingsError.message.includes('"palette.settings"'),
		`Expected the error to name "palette.settings". Received: ${settingsError.message}`,
	);
});

Deno.test("generateCSS - a whitespace-only selector is read as the root scope", () => {
	const config = defineConfig({
		colors: {
			palette: {
				value: {
					coral: {
						value: { 100: { hex: "#FF7F50" } },
						settings: { selector: "   " },
					},
				},
				settings: { fallback: "hex" },
			},
		},
	});

	assertEquals(
		generateCSS(config),
		[
			"/*____ CSSForge ____*/",
			":root {",
			"/*____ Colors ____*/",
			"/* Palette */",
			"/* coral */",
			"--palette-coral-100: oklch(73.511% 0.16799 40.24666);",
			"}",
			"@supports not (color: oklch(0% 0 0)) {",
			"  :root {",
			"    /* coral */",
			"    --palette-coral-100: #ff7f50;",
			"  }",
			"}",
		].join("\n"),
	);
});

Deno.test("generateCSS - a shorthand color may keep a variant named fallback", () => {
	const config = defineConfig({
		colors: {
			palette: {
				value: { coral: { fallback: { hex: "#FFFFFF" } } },
			},
		},
	});

	assertEquals(
		generateCSS(config).includes("--palette-coral-fallback: oklch(100% 0 0);"),
		true,
	);
});
