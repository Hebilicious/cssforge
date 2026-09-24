import Color from "colorjs.io";
import { generateJSON, generateTS } from "../src/generator.ts";
import type { CSSForgeConfig } from "../src/mod.ts";
import { defineConfig, generateCSS, generateStyleDictionaryJSON } from "../src/mod.ts";
import { assert, assertEquals, assertThrows, Deno } from "./vitest-compat.ts";

/**
 * The value declared for `key` inside the generated `@supports` block, read from
 * the block rather than the root declaration above it.
 */
const declaredValue = (css: string, key: string): string => {
	const block = css.slice(css.indexOf("@supports"));
	const match = new RegExp(`${key}: ([^;]+);`).exec(block);

	if (!match)
		throw new Error(`Expected a color format declaration for ${key} in:\n${css}`);

	return match[1];
};

Deno.test("generateCSS - configured formats emit an sRGB declaration under @supports", () => {
	const config = defineConfig({
		colors: {
			palette: {
				value: {
					coral: {
						100: { hex: "#FF7F50" },
					},
				},
				settings: { color: { formats: ["hex"] } },
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

Deno.test("generateCSS - the first format is the CSS declaration and all formats reach the token", () => {
	const config = defineConfig({
		colors: {
			palette: {
				value: { coral: { 100: { hex: "#FF7F50" } } },
				settings: { color: { formats: ["rgb", "hex"] } },
			},
		},
	});

	const css = generateCSS(config);

	assertEquals(declaredValue(css, "--palette-coral-100"), "rgb(255 127 80)");
	assertEquals(JSON.parse(generateJSON(config)).palette.coral["100"].color, {
		rgb: "rgb(255 127 80)",
		hex: "#ff7f50",
	});
});

Deno.test("generateCSS - a palette color without variants emits no fallback block", () => {
	const config = defineConfig({
		colors: {
			palette: {
				value: { empty: { value: {} } },
				settings: { color: { formats: ["hex"] } },
			},
		},
	});

	assertEquals(generateCSS(config).includes("@supports"), false);
});

Deno.test("generateCSS - applies the palette formats with per-color overrides", () => {
	const config = defineConfig({
		colors: {
			palette: {
				value: {
					coral: { 100: { hex: "#FF7F50" } },
					soft: { 100: "rgb(0 0 0 / 12%)" },
					brand: {
						value: { 100: { hex: "#FF0000" } },
						settings: { color: { formats: ["hex"] } },
					},
					opted: {
						value: { 100: { hex: "#00FF00" } },
						settings: { color: { formats: [] } },
					},
				},
				settings: { color: { formats: ["rgb"] } },
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
				settings: { color: { formats: ["hex"] } },
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
	// declaration keeps the authored hue instead, which is how a browser maps
	// the color it cannot display.
	const config = defineConfig({
		colors: {
			palette: {
				value: { vivid: { 100: { oklch: "oklch(70% 0.4 20)" } } },
				settings: { color: { formats: ["hex"] } },
			},
		},
	});

	const declared = declaredValue(generateCSS(config), "--palette-vivid-100");

	assertEquals(declared === "#ff000a", false);
	assertEquals(new Color(declared).inGamut("srgb", { epsilon: 0 }), true);
});

Deno.test("generateCSS - the declaration mirrors the color selector and at-rule", () => {
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
				settings: { color: { formats: ["hex"] } },
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

Deno.test("generateCSS - the colorFormats option adds formats without editing the config", () => {
	const config = defineConfig({
		colors: {
			palette: {
				value: { coral: { 100: { hex: "#FF7F50" } } },
			},
		},
	});

	const css = generateCSS(config, { colorFormats: ["hex", "rgb"] });

	assertEquals(declaredValue(css, "--palette-coral-100"), "#ff7f50");
	assertEquals(JSON.parse(generateJSON(config, { colorFormats: ["hex", "rgb"] })), {
		palette: {
			coral: {
				"100": {
					key: "--palette-coral-100",
					value: "oklch(73.511% 0.16799 40.24666)",
					variable: "--palette-coral-100: oklch(73.511% 0.16799 40.24666);",
					color: { hex: "#ff7f50", rgb: "rgb(255 127 80)" },
				},
			},
		},
	});
});

Deno.test("generateCSS - the option appends to the configured formats", () => {
	const config = defineConfig({
		colors: {
			palette: {
				value: { coral: { 100: { hex: "#FF7F50" } } },
				settings: { color: { formats: ["rgb"] } },
			},
		},
	});

	// The configuration picks the CSS declaration, and the option only adds.
	const css = generateCSS(config, { colorFormats: ["hex", "rgb"] });

	assertEquals(declaredValue(css, "--palette-coral-100"), "rgb(255 127 80)");
	assertEquals(JSON.parse(generateJSON(config, { colorFormats: ["hex"] })), {
		palette: {
			coral: {
				"100": {
					key: "--palette-coral-100",
					value: "oklch(73.511% 0.16799 40.24666)",
					variable: "--palette-coral-100: oklch(73.511% 0.16799 40.24666);",
					color: { rgb: "rgb(255 127 80)", hex: "#ff7f50" },
				},
			},
		},
	});
});

Deno.test("generateJSON and generateTS - every requested format is part of the token object", () => {
	const config = defineConfig({
		colors: {
			palette: {
				value: { coral: { 100: { hex: "#FF7F50" } } },
				settings: { color: { formats: ["hex", "rgb"] } },
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
					color: { hex: "#ff7f50", rgb: "rgb(255 127 80)" },
				},
			},
		},
	});
	assertEquals(generateTS(config).includes('"rgb": "rgb(255 127 80)"'), true);
});

Deno.test("generateJSON - token objects omit the color field when none is configured", () => {
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

Deno.test("generateStyleDictionaryJSON - exposes the formats beside the resolved value", () => {
	const config = defineConfig({
		colors: {
			palette: {
				value: { coral: { 100: { hex: "#FF7F50" } } },
				settings: { color: { formats: ["hex", "rgb"] } },
			},
		},
	});

	const token = JSON.parse(generateStyleDictionaryJSON(config)).palette.coral["100"];

	assertEquals(token.$color, { hex: "#ff7f50", rgb: "rgb(255 127 80)" });
	assertEquals(token.attributes.color, { hex: "#ff7f50", rgb: "rgb(255 127 80)" });
	assertEquals(token.$resolvedValue, "oklch(73.511% 0.16799 40.24666)");
});

Deno.test("generateCSS - rejects an unsupported color format", () => {
	const palette = { value: { coral: { 100: { hex: "#FF7F50" } } } };
	const invalidPalette = {
		colors: { palette: { ...palette, settings: { color: { formats: ["oklch"] } } } },
	} as unknown as CSSForgeConfig;
	const invalidColor = {
		colors: {
			palette: {
				value: {
					coral: {
						value: { 100: { hex: "#FF7F50" } },
						settings: { color: { formats: ["sqrgb"] } },
					},
				},
			},
		},
	} as unknown as CSSForgeConfig;

	const paletteError = assertThrows(() => generateCSS(invalidPalette));
	const colorError = assertThrows(() => generateCSS(invalidColor));

	assert(
		paletteError.message.includes('"palette.settings.color.formats"'),
		`Expected the error to name "palette.settings.color.formats". Received: ${paletteError.message}`,
	);
	assert(
		colorError.message.includes('"palette.coral.settings.color.formats"'),
		`Expected the error to name "palette.coral.settings.color.formats". Received: ${colorError.message}`,
	);
});

Deno.test("generateCSS - rejects formats that are not an array of formats", () => {
	const palette = { value: { coral: { 100: { hex: "#FF7F50" } } } };
	const formatsNotAnArray = {
		colors: { palette: { ...palette, settings: { color: { formats: "hex" } } } },
	} as unknown as CSSForgeConfig;
	const settingsNotAnObject = {
		colors: { palette: { ...palette, settings: "color" } },
	} as unknown as CSSForgeConfig;

	const formatsError = assertThrows(() => generateCSS(formatsNotAnArray));
	const settingsError = assertThrows(() => generateCSS(settingsNotAnObject));

	assert(
		formatsError.message.includes('"palette.settings.color.formats"'),
		`Expected the error to name "palette.settings.color.formats". Received: ${formatsError.message}`,
	);
	assert(
		settingsError.message.includes('"palette.settings"'),
		`Expected the error to name "palette.settings". Received: ${settingsError.message}`,
	);
});

Deno.test("generateCSS - rejects color settings that are not inside settings", () => {
	const palette = { value: { coral: { 100: { hex: "#FF7F50" } } } };
	const colorOnPalette = {
		colors: { palette: { ...palette, color: { formats: ["hex"] } } },
	} as unknown as CSSForgeConfig;
	const colorOnColor = {
		colors: {
			palette: {
				value: {
					coral: { value: { 100: { hex: "#FF7F50" } }, color: { formats: ["hex"] } },
				},
			},
		},
	} as unknown as CSSForgeConfig;
	const formatsInSettings = {
		colors: { palette: { ...palette, settings: { formats: ["hex"] } } },
	} as unknown as CSSForgeConfig;

	const paletteError = assertThrows(() => generateCSS(colorOnPalette));
	const colorError = assertThrows(() => generateCSS(colorOnColor));
	const formatsError = assertThrows(() => generateCSS(formatsInSettings));

	assert(
		paletteError.message.includes('"palette"'),
		`Expected the error to name "palette". Received: ${paletteError.message}`,
	);
	assert(
		colorError.message.includes('"palette.coral"'),
		`Expected the error to name "palette.coral". Received: ${colorError.message}`,
	);
	assert(
		formatsError.message.includes('"palette.settings.color"'),
		`Expected the error to name "palette.settings.color". Received: ${formatsError.message}`,
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
				settings: { color: { formats: ["hex"] } },
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

Deno.test("generateCSS - a shorthand color may keep a variant named color", () => {
	const config = defineConfig({
		colors: {
			palette: {
				value: { coral: { color: { hex: "#FFFFFF" } } },
			},
		},
	});

	assertEquals(
		generateCSS(config).includes("--palette-coral-color: oklch(100% 0 0);"),
		true,
	);
});
