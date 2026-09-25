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

const tokenColor = (config: Partial<CSSForgeConfig>) =>
	JSON.parse(generateJSON(config)).palette.coral["100"].color;

Deno.test("generateCSS - a format emits its CSS value under @supports", () => {
	const config = defineConfig({
		colors: {
			palette: {
				value: {
					coral: {
						100: { hex: "#FF7F50" },
					},
				},
				settings: { color: { formats: { hex: true } } },
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

Deno.test("generateJSON - hex produces the string, digits and number outputs", () => {
	const config = defineConfig({
		colors: {
			palette: {
				value: { coral: { 100: { hex: "#FF7F50" } } },
				settings: {
					color: { formats: { hex: { string: true, digits: true, number: true } } },
				},
			},
		},
	});

	assertEquals(tokenColor(config), {
		hex: { string: "#ff7f50", digits: "ff7f50", number: 16744272 },
	});
});

Deno.test("generateJSON - rgb produces the string and array outputs", () => {
	const config = defineConfig({
		colors: {
			palette: {
				value: { coral: { 100: { hex: "#FF7F50" } } },
				settings: { color: { formats: { rgb: { string: true, array: true } } } },
			},
		},
	});

	assertEquals(tokenColor(config), {
		rgb: { string: "rgb(255 127 80)", array: [255, 127, 80] },
	});
});

Deno.test("generateJSON - a color with alpha carries it in every output", () => {
	const config = defineConfig({
		colors: {
			palette: {
				value: { coral: { 100: "rgb(0 0 0 / 12%)" } },
				settings: {
					color: {
						formats: {
							hex: { string: true, digits: true, number: true },
							rgb: { string: true, array: true },
						},
					},
				},
			},
		},
	});

	assertEquals(tokenColor(config), {
		hex: { string: "#0000001f", digits: "0000001f", number: 31 },
		rgb: { string: "rgb(0 0 0 / 0.12)", array: [0, 0, 0, 0.12] },
	});
});

Deno.test("generateCSS - fallback selects the format of the CSS declaration", () => {
	const config = defineConfig({
		colors: {
			palette: {
				value: { coral: { 100: { hex: "#FF7F50" } } },
				settings: {
					color: { formats: { hex: true, rgb: true }, fallback: "rgb" },
				},
			},
		},
	});

	const css = generateCSS(config);

	assertEquals(declaredValue(css, "--palette-coral-100"), "rgb(255 127 80)");
	assertEquals(tokenColor(config), {
		hex: { string: "#ff7f50" },
		rgb: { string: "rgb(255 127 80)" },
	});
});

Deno.test("generateCSS - fallback false keeps the formats out of the CSS", () => {
	const config = defineConfig({
		colors: {
			palette: {
				value: { coral: { 100: { hex: "#FF7F50" } } },
				settings: { color: { formats: { hex: true }, fallback: false } },
			},
		},
	});

	const css = generateCSS(config);

	assertEquals(css.includes("@supports"), false);
	assertEquals(tokenColor(config), { hex: { string: "#ff7f50" } });
});

Deno.test("generateCSS - rejects a fallback format that is not generated", () => {
	const config = {
		colors: {
			palette: {
				value: { coral: { 100: { hex: "#FF7F50" } } },
				settings: { color: { formats: { hex: true }, fallback: "rgb" } },
			},
		},
	} as unknown as CSSForgeConfig;

	const error = assertThrows(() => generateCSS(config));

	assert(
		error.message.includes('"rgb"'),
		`Expected the error to name the missing format. Received: ${error.message}`,
	);
});

Deno.test("generateCSS - rejects a fallback format without its string output", () => {
	const config = defineConfig({
		colors: {
			palette: {
				value: { coral: { 100: { hex: "#FF7F50" } } },
				settings: {
					color: { formats: { hex: { digits: true } }, fallback: "hex" },
				},
			},
		},
	});

	const error = assertThrows(() => generateCSS(config));

	assert(
		error.message.includes('"string"'),
		`Expected the error to ask for the string output. Received: ${error.message}`,
	);
});

Deno.test("generateJSON - alpha replaces the alpha of the color everywhere", () => {
	const config = defineConfig({
		colors: {
			palette: {
				value: { coral: { 100: { hex: "#000000" } } },
				settings: {
					color: {
						formats: {
							hex: { string: true, digits: true },
							rgb: { string: true, array: true },
						},
						alpha: 0.5,
					},
				},
			},
		},
	});

	const token = JSON.parse(generateJSON(config)).palette.coral["100"];

	assertEquals(token.value, "oklch(0% 0 0 / 50%)");
	assertEquals(token.color, {
		hex: { string: "#00000080", digits: "00000080" },
		rgb: { string: "rgb(0 0 0 / 0.5)", array: [0, 0, 0, 0.5] },
	});
});

Deno.test("generateCSS - alpha false rejects a color that carries alpha", () => {
	const config = defineConfig({
		colors: {
			palette: {
				value: {
					coral: { 100: "rgb(0 0 0 / 12%)" },
					opaque: { 100: { hex: "#FF7F50" } },
				},
				settings: { color: { formats: { hex: true }, alpha: false } },
			},
		},
	});

	const error = assertThrows(() => generateCSS(config));

	assert(
		error.message.includes('"palette.coral.100"'),
		`Expected the error to name the offending variant. Received: ${error.message}`,
	);
});

Deno.test("generateJSON - alpha false generates no alpha channel", () => {
	const config = defineConfig({
		colors: {
			palette: {
				value: { coral: { 100: { hex: "#FF7F50" } } },
				settings: {
					color: { formats: { hex: true, rgb: { array: true } }, alpha: false },
				},
			},
		},
	});

	assertEquals(tokenColor(config), {
		hex: { string: "#ff7f50" },
		rgb: { array: [255, 127, 80] },
	});
});

Deno.test("generateJSON - a color replaces the inherited color settings", () => {
	const config = defineConfig({
		colors: {
			palette: {
				value: {
					coral: {
						value: { 100: { hex: "#FF7F50" } },
						settings: {
							color: { formats: { hex: { number: true } }, fallback: false, alpha: 0.5 },
						},
					},
				},
				settings: { color: { formats: { rgb: true }, fallback: "rgb" } },
			},
		},
	});

	assertEquals(tokenColor(config), { hex: { number: 0xff7f5080 } });
	assertEquals(generateCSS(config).includes("@supports"), false);
});

Deno.test("generateCSS - the colorFormats option appends a default format", () => {
	const config = defineConfig({
		colors: {
			palette: {
				value: { coral: { 100: { hex: "#FF7F50" } } },
			},
		},
	});

	const css = generateCSS(config, { colorFormats: ["rgb"] });

	assertEquals(declaredValue(css, "--palette-coral-100"), "rgb(255 127 80)");
	assertEquals(
		JSON.parse(generateJSON(config, { colorFormats: ["hex", "rgb"] })).palette.coral[
			"100"
		].color,
		{
			hex: { string: "#ff7f50" },
			rgb: { string: "rgb(255 127 80)" },
		},
	);
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
				settings: { color: { formats: { hex: true } } },
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

Deno.test("generateCSS - a palette color without variants emits no color block", () => {
	const config = defineConfig({
		colors: {
			palette: {
				value: { empty: { value: {} } },
				settings: { color: { formats: { hex: true } } },
			},
		},
	});

	assertEquals(generateCSS(config).includes("@supports"), false);
});

Deno.test("generateCSS - a wide gamut color uses the CSS gamut mapped sRGB value", () => {
	// `oklch(70% 0.4 20)` cannot be shown in sRGB: its conversion is
	// `rgb(336 -117 10)`, and clipping each channel would give `#ff000a`. The
	// declaration keeps the authored hue instead, which is how a browser maps
	// the color it cannot display.
	const config = defineConfig({
		colors: {
			palette: {
				value: { vivid: { 100: { oklch: "oklch(70% 0.4 20)" } } },
				settings: { color: { formats: { hex: true } } },
			},
		},
	});

	const declared = declaredValue(generateCSS(config), "--palette-vivid-100");

	assertEquals(declared === "#ff000a", false);
	assertEquals(new Color(declared).inGamut("srgb", { epsilon: 0 }), true);
});

Deno.test("generateStyleDictionaryJSON - exposes the color outputs beside the resolved value", () => {
	const config = defineConfig({
		colors: {
			palette: {
				value: { coral: { 100: { hex: "#FF7F50" } } },
				settings: {
					color: {
						formats: { hex: { string: true, number: true }, rgb: { array: true } },
					},
				},
			},
		},
	});

	const token = JSON.parse(generateStyleDictionaryJSON(config)).palette.coral["100"];

	assertEquals(token.$color, {
		hex: { string: "#ff7f50", number: 16744272 },
		rgb: { array: [255, 127, 80] },
	});
	assertEquals(token.attributes.color, token.$color);
	assertEquals(token.$resolvedValue, "oklch(73.511% 0.16799 40.24666)");
});

Deno.test("generateJSON and generateTS - the color outputs are part of the token object", () => {
	const config = defineConfig({
		colors: {
			palette: {
				value: { coral: { 100: { hex: "#FF7F50" } } },
				settings: { color: { formats: { rgb: { string: true, array: true } } } },
			},
		},
	});

	const expected = {
		palette: {
			coral: {
				"100": {
					key: "--palette-coral-100",
					value: "oklch(73.511% 0.16799 40.24666)",
					variable: "--palette-coral-100: oklch(73.511% 0.16799 40.24666);",
					color: { rgb: { string: "rgb(255 127 80)", array: [255, 127, 80] } },
				},
			},
		},
	};

	assertEquals(generateJSON(config), JSON.stringify(expected, null, 2));
	assertEquals(
		generateTS(config),
		`export const cssForge = ${JSON.stringify(expected, null, 2)} as const;`,
	);
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

Deno.test("generateCSS - rejects an unknown color format", () => {
	const palette = { value: { coral: { 100: { hex: "#FF7F50" } } } };
	const invalidPalette = {
		colors: { palette: { ...palette, settings: { color: { formats: { hsl: true } } } } },
	} as unknown as CSSForgeConfig;
	const invalidColor = {
		colors: {
			palette: {
				value: {
					coral: {
						value: { 100: { hex: "#FF7F50" } },
						settings: { color: { formats: { sqrgb: true } } },
					},
				},
			},
		},
	} as unknown as CSSForgeConfig;

	const paletteError = assertThrows(() => generateCSS(invalidPalette));
	const colorError = assertThrows(() => generateCSS(invalidColor));

	assert(
		paletteError.message.includes('"palette.settings.color.formats"') &&
			paletteError.message.includes("hsl"),
		`Expected the error to name the path and the value. Received: ${paletteError.message}`,
	);
	assert(
		colorError.message.includes('"palette.coral.settings.color.formats"'),
		`Expected the error to name "palette.coral.settings.color.formats". Received: ${colorError.message}`,
	);
});

Deno.test("generateCSS - rejects an output a format does not produce", () => {
	const palette = { value: { coral: { 100: { hex: "#FF7F50" } } } };
	const arrayOnHex = {
		colors: {
			palette: { ...palette, settings: { color: { formats: { hex: { array: true } } } } },
		},
	} as unknown as CSSForgeConfig;
	const digitsOnRgb = {
		colors: {
			palette: {
				...palette,
				settings: { color: { formats: { rgb: { digits: true } } } },
			},
		},
	} as unknown as CSSForgeConfig;
	const nothingEnabled = {
		colors: { palette: { ...palette, settings: { color: { formats: { hex: {} } } } } },
	} as unknown as CSSForgeConfig;

	const hexError = assertThrows(() => generateCSS(arrayOnHex));
	const rgbError = assertThrows(() => generateCSS(digitsOnRgb));
	const emptyError = assertThrows(() => generateCSS(nothingEnabled));

	assert(
		hexError.message.includes('"palette.settings.color.formats.hex"') &&
			hexError.message.includes('"digits"'),
		`Expected the error to list the hex outputs. Received: ${hexError.message}`,
	);
	assert(
		rgbError.message.includes('"palette.settings.color.formats.rgb"') &&
			rgbError.message.includes('"array"'),
		`Expected the error to list the rgb outputs. Received: ${rgbError.message}`,
	);
	assert(
		emptyError.message.includes('"palette.settings.color.formats.hex"'),
		`Expected the error to name the empty format. Received: ${emptyError.message}`,
	);
});

Deno.test("generateCSS - rejects an alpha that is not a boolean or an opacity", () => {
	const palette = { value: { coral: { 100: { hex: "#FF7F50" } } } };
	const notAnOpacity = {
		colors: {
			palette: { ...palette, settings: { color: { formats: { hex: true }, alpha: 2 } } },
		},
	} as unknown as CSSForgeConfig;

	const error = assertThrows(() => generateCSS(notAnOpacity));

	assert(
		error.message.includes('"palette.settings.color.alpha"'),
		`Expected the error to name "palette.settings.color.alpha". Received: ${error.message}`,
	);
});

Deno.test("generateCSS - rejects color settings that are not inside settings", () => {
	const palette = { value: { coral: { 100: { hex: "#FF7F50" } } } };
	const colorOnPalette = {
		colors: { palette: { ...palette, color: { formats: { hex: true } } } },
	} as unknown as CSSForgeConfig;
	const formatsInSettings = {
		colors: { palette: { ...palette, settings: { formats: { hex: true } } } },
	} as unknown as CSSForgeConfig;
	const fallbackOnColor = {
		colors: {
			palette: {
				value: {
					coral: {
						value: { 100: { hex: "#FF7F50" } },
						fallback: "hex",
					},
				},
			},
		},
	} as unknown as CSSForgeConfig;

	const paletteError = assertThrows(() => generateCSS(colorOnPalette));
	const settingsError = assertThrows(() => generateCSS(formatsInSettings));
	const colorError = assertThrows(() => generateCSS(fallbackOnColor));

	assert(
		paletteError.message.includes('"palette"'),
		`Expected the error to name "palette". Received: ${paletteError.message}`,
	);
	assert(
		settingsError.message.includes('"palette.settings.color"'),
		`Expected the error to name "palette.settings.color". Received: ${settingsError.message}`,
	);
	assert(
		colorError.message.includes('"palette.coral"'),
		`Expected the error to name "palette.coral". Received: ${colorError.message}`,
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
				settings: { color: { formats: { hex: true } } },
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
