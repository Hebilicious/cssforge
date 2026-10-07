import Color from "colorjs.io";
import { generateJSON, generateTS } from "../src/generator.ts";
import type { CSSForgeConfig } from "../src/mod.ts";
import {
	defineConfig,
	generateCSS,
	generateStyleDictionaryJSON,
	processColors,
} from "../src/mod.ts";
import { assert, assertEquals, assertThrows, Deno } from "./vitest-compat.ts";

/** The sRGB hex of an oklch color, derived without the mix implementation. */
const hexOf = (l: number, c: number, h: number) =>
	new Color("oklch", [l, c, h]).to("srgb").toGamut().toString({ format: "hex" });

const accent = { base: { hex: "#336699" } };

const throwsAt = (config: unknown, ...fragments: string[]) => {
	const error = assertThrows(() => generateCSS(config as CSSForgeConfig));
	for (const fragment of fragments) {
		assert(
			error.message.includes(fragment),
			`Expected the error to include ${fragment}. Received: ${error.message}`,
		);
	}
};

Deno.test("generateCSS - a palette mix emits color-mix with a var() reference", () => {
	const css = generateCSS(
		defineConfig({
			colors: {
				palette: {
					value: {
						accent: {
							...accent,
							hover: { mix: { from: "palette.accent.base", with: "black", amount: 15 } },
						},
					},
				},
			},
		}),
	);

	assert(
		css.includes(
			"--palette-accent-hover: color-mix(in oklch, var(--palette-accent-base), black 15%);",
		),
		css,
	);
});

Deno.test("generateCSS - a theme mix derives a variant from a palette color", () => {
	const css = generateCSS(
		defineConfig({
			colors: {
				palette: { value: { accent } },
				theme: {
					light: {
						value: {
							action: {
								value: {
									subtle: {
										mix: { from: "palette.accent.base", with: "transparent", amount: 88 },
									},
								},
							},
						},
					},
				},
			},
		}),
	);

	assert(
		css.includes(
			"--theme-light-action-subtle: color-mix(in oklch, var(--palette-accent-base), transparent 88%);",
		),
		css,
	);
});

Deno.test("generateCSS - a theme mix can reference an earlier theme token", () => {
	const css = generateCSS(
		defineConfig({
			colors: {
				palette: { value: { accent } },
				theme: {
					light: {
						value: {
							action: {
								value: {
									base: "var(--accent)",
									hover: {
										mix: { from: "theme.light.action.base", with: "white", amount: 10 },
									},
								},
								variables: { accent: "palette.accent.base" },
							},
						},
					},
				},
			},
		}),
	);

	assert(
		css.includes(
			"--theme-light-action-hover: color-mix(in oklch, var(--theme-light-action-base), white 10%);",
		),
		css,
	);
});

Deno.test("generateCSS - literal colors are emitted as written", () => {
	const css = generateCSS(
		defineConfig({
			colors: {
				palette: {
					value: {
						brand: {
							blend: { mix: { from: "#ff0000", with: "oklch(50% 0.2 264)", amount: 50 } },
						},
					},
				},
			},
		}),
	);

	assert(
		css.includes(
			"--palette-brand-blend: color-mix(in oklch, #ff0000, oklch(50% 0.2 264) 50%);",
		),
		css,
	);
});

Deno.test("generateCSS - a fallback format declares the statically mixed color", () => {
	const css = generateCSS(
		defineConfig({
			colors: {
				palette: {
					value: {
						accent: {
							...accent,
							hover: { mix: { from: "palette.accent.base", with: "black", amount: 15 } },
						},
					},
					settings: { color: { formats: { hex: true } } },
				},
			},
		}),
	);
	const [l, c, h] = new Color("#336699").to("oklch").coords;
	const fallback = css.slice(css.indexOf("@supports"));

	assert(
		fallback.includes(`--palette-accent-hover: ${hexOf(l * 0.85, c * 0.85, h)};`),
		css,
	);
});

Deno.test("generateJSON - an achromatic operand keeps the other color's hue", () => {
	const config = defineConfig({
		colors: {
			palette: {
				value: {
					base: {
						white: "oklch(100% 0 0)",
						blue: "oklch(50% 0.2 264)",
						tint: {
							mix: { from: "palette.base.white", with: "palette.base.blue", amount: 50 },
						},
					},
				},
				settings: { color: { formats: { hex: true } } },
			},
		},
	});

	const tint = JSON.parse(generateJSON(config)).palette.base.tint;

	assertEquals(tint.color.hex.string, hexOf(0.75, 0.1, 264));
});

Deno.test("generateJSON - mixing with transparent keeps the color and sets its alpha", () => {
	const config = defineConfig({
		colors: {
			palette: {
				value: {
					accent: {
						...accent,
						subtle: {
							mix: { from: "palette.accent.base", with: "transparent", amount: 88 },
						},
					},
				},
				settings: { color: { formats: { rgb: { string: true, array: true } } } },
			},
		},
	});

	const subtle = JSON.parse(generateJSON(config)).palette.accent.subtle;

	assertEquals(subtle.color.rgb, {
		string: "rgb(51 102 153 / 0.12)",
		array: [51, 102, 153, 0.12],
	});
});

Deno.test("generateJSON - alpha weights lightness and chroma but not the hue", () => {
	const config = defineConfig({
		colors: {
			palette: {
				value: {
					base: {
						faded: "oklch(60% 0.1 30 / 0.5)",
						solid: "oklch(60% 0.1 90)",
						blend: {
							mix: { from: "palette.base.faded", with: "palette.base.solid", amount: 50 },
						},
					},
				},
				settings: { color: { formats: { hex: true } } },
			},
		},
	});
	const expected = new Color("oklch", [0.6, 0.1, 60], 0.75)
		.to("srgb")
		.toString({ format: "hex" });

	const blend = JSON.parse(generateJSON(config)).palette.base.blend;

	assertEquals(blend.color.hex.string, expected);
});

Deno.test("generateJSON and generateTS - a mix token keeps its var() reference", () => {
	const config = defineConfig({
		colors: {
			palette: {
				value: {
					accent: {
						...accent,
						hover: { mix: { from: "palette.accent.base", with: "black", amount: 15 } },
					},
				},
			},
		},
	});
	const value = "color-mix(in oklch, var(--palette-accent-base), black 15%)";

	assertEquals(JSON.parse(generateJSON(config)).palette.accent.hover, {
		key: "--palette-accent-hover",
		value,
		variable: `--palette-accent-hover: ${value};`,
	});
	assert(generateTS(config).includes(`"value": "${value}"`));
});

Deno.test("processColors - a mix token records the paths it references", () => {
	const { resolveMap } = processColors({
		palette: {
			value: {
				accent: {
					...accent,
					hover: {
						mix: { from: "palette.value.accent.base", with: "black", amount: 15 },
					},
					literal: { mix: { from: "red", with: "blue", amount: 50 } },
				},
			},
		},
	});

	assertEquals(resolveMap.get("palette.accent.hover")?.referencePaths, [
		"palette.accent.base",
	]);
	assertEquals(resolveMap.get("palette.accent.hover")?.tier, "semantic");
	assertEquals(resolveMap.get("palette.accent.literal")?.referencePaths, undefined);
	assertEquals(resolveMap.get("palette.accent.literal")?.tier, "primitive");
});

Deno.test("generateStyleDictionaryJSON - a mix token resolves its reference", () => {
	const config = defineConfig({
		colors: {
			palette: {
				value: {
					accent: {
						...accent,
						hover: { mix: { from: "palette.accent.base", with: "black", amount: 15 } },
					},
				},
			},
		},
	});

	const tokens = JSON.parse(generateStyleDictionaryJSON(config));
	const base = tokens.palette.accent.base.value;
	const hover = tokens.palette.accent.hover;

	assertEquals(hover.value, `color-mix(in oklch, ${base}, black 15%)`);
	assertEquals(hover.type, "color");
	assertEquals(hover.$tier, "semantic");
	assertEquals(hover.$reference, "palette.accent.base");
});

Deno.test("generateCSS - rejects an unknown key in a mix", () => {
	throwsAt(
		{
			colors: {
				palette: {
					value: {
						accent: {
							...accent,
							hover: {
								mix: { from: "palette.accent.base", with: "black", amount: 15, by: 1 },
							},
						},
					},
				},
			},
		},
		'"palette.accent.hover.mix"',
		'"by"',
	);
});

Deno.test("generateCSS - rejects a key beside mix", () => {
	throwsAt(
		{
			colors: {
				palette: {
					value: {
						accent: {
							...accent,
							hover: {
								mix: { from: "palette.accent.base", with: "black", amount: 15 },
								hex: "#000",
							},
						},
					},
				},
			},
		},
		'"palette.accent.hover"',
		'"hex"',
	);
});

Deno.test("generateCSS - rejects an amount outside 0 to 100", () => {
	for (const amount of [-1, 101, "15", Number.NaN]) {
		throwsAt(
			{
				colors: {
					palette: {
						value: {
							accent: {
								...accent,
								hover: { mix: { from: "palette.accent.base", with: "black", amount } },
							},
						},
					},
				},
			},
			'"palette.accent.hover.mix.amount"',
		);
	}
});

Deno.test("generateCSS - rejects a missing operand", () => {
	throwsAt(
		{
			colors: {
				palette: {
					value: {
						accent: {
							...accent,
							hover: { mix: { from: "palette.accent.base", amount: 15 } },
						},
					},
				},
			},
		},
		'"palette.accent.hover.mix.with"',
	);
});

Deno.test("generateCSS - rejects an interpolation space other than oklch", () => {
	throwsAt(
		{
			colors: {
				palette: {
					value: {
						accent: {
							...accent,
							hover: {
								mix: {
									from: "palette.accent.base",
									with: "black",
									amount: 15,
									in: "srgb",
								},
							},
						},
					},
				},
			},
		},
		'"palette.accent.hover.mix.in"',
		'"oklch"',
	);
});

Deno.test("generateCSS - rejects a token path that does not resolve", () => {
	throwsAt(
		{
			colors: {
				palette: {
					value: {
						accent: {
							...accent,
							hover: {
								mix: { from: "palette.accent.missing", with: "black", amount: 15 },
							},
						},
					},
				},
			},
		},
		'"palette.accent.hover.mix.from"',
		'"palette.accent.missing"',
	);
});

Deno.test("generateCSS - rejects a token path that is not a color", () => {
	throwsAt(
		{
			colors: {
				palette: { value: { accent } },
				gradients: {
					value: { sky: { value: { soft: { value: "linear-gradient(red, blue)" } } } },
				},
				theme: {
					light: {
						value: {
							action: {
								value: {
									hover: {
										mix: { from: "gradients.sky.soft", with: "black", amount: 15 },
									},
								},
							},
						},
					},
				},
			},
		},
		'"theme.light.action.hover.mix.from"',
		'"gradients.sky.soft"',
	);
});

Deno.test("generateCSS - rejects a literal that is not a CSS color", () => {
	throwsAt(
		{
			colors: {
				palette: {
					value: {
						accent: {
							...accent,
							hover: { mix: { from: "palette.accent.base", with: "blak", amount: 15 } },
						},
					},
				},
			},
		},
		'"palette.accent.hover.mix.with"',
		'"blak"',
	);
});

Deno.test("generateCSS - rejects an invalid theme mix instead of skipping the theme", () => {
	throwsAt(
		{
			colors: {
				palette: { value: { accent } },
				theme: {
					light: {
						value: {
							action: {
								value: { hover: { mix: { from: "palette.accent.base", with: "black" } } },
							},
						},
					},
				},
			},
		},
		'"theme.light.action.hover.mix.amount"',
	);
});

Deno.test("generateCSS - rejects a mix with alpha when its format rejects alpha", () => {
	throwsAt(
		{
			colors: {
				palette: {
					value: {
						accent: {
							...accent,
							subtle: {
								mix: { from: "palette.accent.base", with: "transparent", amount: 88 },
							},
						},
					},
					settings: { color: { formats: { hex: { string: true, alpha: false } } } },
				},
			},
		},
		'"palette.accent.subtle"',
		"alpha",
	);
});
