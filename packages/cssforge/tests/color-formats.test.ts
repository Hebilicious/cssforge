import Color from "colorjs.io";
import { generateJSON, generateTS } from "../src/generator.ts";
import type { CSSForgeConfig } from "../src/mod.ts";
import { defineConfig, generateCSS, generateStyleDictionaryJSON } from "../src/mod.ts";
import { assert, assertEquals, assertThrows, Deno } from "./vitest-compat.ts";

/** The value declared for `key` inside the generated `@supports` block. */
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

Deno.test("generateJSON - a format generates at the alpha it sets", () => {
	const config = defineConfig({
		colors: {
			palette: {
				value: { coral: { 100: { hex: "#000000" } } },
				settings: {
					color: {
						formats: {
							hex: { string: true, digits: true, alpha: 0.5 },
							rgb: { string: true, array: true },
						},
					},
				},
			},
		},
	});

	const token = JSON.parse(generateJSON(config)).palette.coral["100"];

	// The value keeps the alpha the color carries, and only the format that
	// asked for an alpha is generated at that opacity.
	assertEquals(token.value, "oklch(0% 0 0)");
	assertEquals(token.color, {
		hex: { string: "#00000080", digits: "00000080" },
		rgb: { string: "rgb(0 0 0)", array: [0, 0, 0] },
	});
});

Deno.test("generateCSS - the declaration uses the alpha of the fallback format", () => {
	const config = defineConfig({
		colors: {
			palette: {
				value: { coral: { 100: { hex: "#000000" } } },
				settings: {
					color: {
						formats: { hex: { string: true, alpha: 0.5 }, rgb: true },
						fallback: "hex",
					},
				},
			},
		},
	});

	assertEquals(declaredValue(generateCSS(config), "--palette-coral-100"), "#00000080");
});

Deno.test("generateJSON - alpha false generates no alpha channel", () => {
	const config = defineConfig({
		colors: {
			palette: {
				value: { coral: { 100: { hex: "#FF7F50" } } },
				settings: {
					color: {
						formats: {
							hex: { string: true, alpha: false },
							rgb: { array: true, alpha: false },
						},
					},
				},
			},
		},
	});

	assertEquals(tokenColor(config), {
		hex: { string: "#ff7f50" },
		rgb: { array: [255, 127, 80] },
	});
});

Deno.test("generateJSON - a color merges its formats into the palette's", () => {
	const config = defineConfig({
		colors: {
			palette: {
				value: {
					coral: {
						value: { 100: { hex: "#FF7F50" } },
						settings: {
							color: {
								formats: { hex: { number: true, alpha: 0.5 } },
								fallback: false,
							},
						},
					},
				},
				settings: { color: { formats: { rgb: true }, fallback: "rgb" } },
			},
		},
	});

	// The palette's rgb survives, the color adds hex, and the color's
	// `fallback: false` still wins over the palette's choice.
	assertEquals(tokenColor(config), {
		rgb: { string: "rgb(255 127 80)" },
		hex: { number: 0xff7f5080 },
	});
	assertEquals(generateCSS(config).includes("@supports"), false);
});

Deno.test("generateJSON - a format set to false removes the inherited format", () => {
	const config = defineConfig({
		colors: {
			palette: {
				value: {
					coral: {
						value: { 100: { hex: "#FF7F50" } },
						settings: { color: { formats: { hex: false } } },
					},
					plain: { 100: { hex: "#FF7F50" } },
				},
				settings: { color: { formats: { hex: true, rgb: true } } },
			},
		},
	});

	const tokens = JSON.parse(generateJSON(config)).palette;

	assertEquals(tokens.coral["100"].color, { rgb: { string: "rgb(255 127 80)" } });
	assertEquals(tokens.plain["100"].color, {
		hex: { string: "#ff7f50" },
		rgb: { string: "rgb(255 127 80)" },
	});
});

Deno.test("generateJSON - a format set to false at the palette level is not generated", () => {
	const config = defineConfig({
		colors: {
			palette: {
				value: { coral: { 100: { hex: "#FF7F50" } } },
				settings: { color: { formats: { hex: false, rgb: true } } },
			},
		},
	});

	assertEquals(tokenColor(config), { rgb: { string: "rgb(255 127 80)" } });
});

Deno.test("generateCSS - the declaration defaults to the first format with a CSS value", () => {
	// `hex` produces no CSS value here, so the declaration has to come from
	// `rgb` instead of failing on the first generated format.
	const config = defineConfig({
		colors: {
			palette: {
				value: { coral: { 100: { hex: "#FF7F50" } } },
				settings: { color: { formats: { hex: { digits: true }, rgb: true } } },
			},
		},
	});

	assertEquals(
		declaredValue(generateCSS(config), "--palette-coral-100"),
		"rgb(255 127 80)",
	);
});

Deno.test("generateCSS - formats without a CSS value emit no declaration", () => {
	const config = defineConfig({
		colors: {
			palette: {
				value: { coral: { 100: { hex: "#FF7F50" } } },
				settings: { color: { formats: { hex: { number: true } } } },
			},
		},
	});

	const css = generateCSS(config);

	assertEquals(css.includes("@supports"), false);
	assertEquals(tokenColor(config), { hex: { number: 16744272 } });
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

Deno.test("generateCSS - an alpha percentage keeps its decimals", () => {
	// 0.549 * 100 is not exact in binary, and the value is what users compare.
	const config = defineConfig({
		colors: {
			palette: {
				value: { soft: { 100: "rgb(11 11 18 / 54.9%)" } },
				settings: { color: { formats: { hex: true } } },
			},
		},
	});

	const css = generateCSS(config);

	assertEquals(
		css.includes("--palette-soft-100: oklch(15.325% 0.0149 284.50542 / 54.9%);"),
		true,
	);
	assertEquals(declaredValue(css, "--palette-soft-100"), "#0b0b128c");
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

Deno.test("generateJSON - an out-of-sRGB color is flagged as gamut mapped", () => {
	const config = defineConfig({
		colors: {
			palette: {
				value: {
					vivid: { 100: { oklch: "oklch(70% 0.4 20)" } },
					plain: { 100: { hex: "#FF7F50" } },
				},
				settings: { color: { formats: { hex: true } } },
			},
		},
	});

	const tokens = JSON.parse(generateJSON(config)).palette;
	const styleDictionary = JSON.parse(generateStyleDictionaryJSON(config)).palette;

	assertEquals(tokens.vivid["100"].gamutMapped, true);
	assertEquals(tokens.vivid["100"].color.hex.string, "#ff5464");
	assertEquals(tokens.plain["100"].gamutMapped, undefined);
	assertEquals(styleDictionary.vivid["100"].$gamutMapped, true);
	assertEquals(styleDictionary.vivid["100"].attributes.gamutMapped, true);
	assertEquals(styleDictionary.plain["100"].$gamutMapped, undefined);
});

Deno.test("generateJSON - a color with no sRGB format is not flagged", () => {
	const config = defineConfig({
		colors: {
			palette: { value: { vivid: { 100: { oklch: "oklch(70% 0.4 20)" } } } },
		},
	});

	assertEquals(
		JSON.parse(generateJSON(config)).palette.vivid["100"].gamutMapped,
		undefined,
	);
});

Deno.test("generateJSON - the hex alpha byte rounds from the exact alpha", () => {
	// Rounding the alpha to three decimals first moved 12.35% off the byte a
	// browser paints.
	const config = defineConfig({
		colors: {
			palette: {
				value: { soft: { 100: "rgb(0 0 0 / 12.35%)" } },
				settings: { color: { formats: { hex: true, rgb: { string: true } } } },
			},
		},
	});

	assertEquals(JSON.parse(generateJSON(config)).palette.soft["100"].color, {
		hex: { string: "#0000001f" },
		rgb: { string: "rgb(0 0 0 / 0.123)" },
	});
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
	assertEquals(token.$gamutMapped, undefined);
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
