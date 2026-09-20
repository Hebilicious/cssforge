import { generateCSS, generateJSON, generateTS } from "../src/generator.ts";
import { defineConfig } from "../src/mod.ts";
import { processColors } from "../src/modules/colors.ts";
import { processPrimitives } from "../src/modules/primitive.ts";
import { processSpacing } from "../src/modules/spacing.ts";
import { processTypography } from "../src/modules/typography.ts";
import { assert, assertEquals, Deno } from "./vitest-compat.ts";

/**
 * Custom property names that are not valid CSS dashed identifiers.
 *
 * A declaration name is `--` followed by an identifier. An identifier is
 * `[-]*` then a letter, underscore or non-ASCII code point, then any number of
 * letters, digits, hyphens, underscores or non-ASCII code points.
 */
const invalidDashedIdentifiers = (css: string): string[] => {
	const names = css.match(/--[^\s:;{}()]+/g) ?? [];
	return names.filter(
		(name) => !/^--[A-Za-z_\u0080-\u{10FFFF}][\w\-\u0080-\u{10FFFF}]*$/u.test(name),
	);
};

const captureError = (fn: () => unknown): string => {
	try {
		fn();
	} catch (error) {
		return error instanceof Error ? error.message : String(error);
	}
	throw new Error("Expected the call to throw, but it returned normally.");
};

Deno.test("validateName - rejects primitive names that are not dashed identifiers", () => {
	const config = defineConfig({
		primitives: {
			"card button": {
				value: { default: { value: { gap: "1rem" } } },
			},
		},
	});

	const message = captureError(() => processPrimitives(config));
	assert(
		message.includes("card button"),
		`Error must name the offending segment. Received: ${message}`,
	);
	assert(
		message.includes("primitives.card button"),
		`Error must name the configuration path. Received: ${message}`,
	);
});

Deno.test("validateName - rejects variant names that are not dashed identifiers", () => {
	const config = defineConfig({
		primitives: {
			card: {
				value: { "hover focus": { value: { gap: "1rem" } } },
			},
		},
	});

	const message = captureError(() => processPrimitives(config));
	assert(
		message.includes("hover focus"),
		`Error must name the offending segment. Received: ${message}`,
	);
	assert(
		message.includes("primitives.card.hover focus"),
		`Error must name the configuration path. Received: ${message}`,
	);
});

Deno.test("validateName - rejects primitive property names that are not dashed identifiers", () => {
	const config = defineConfig({
		primitives: {
			card: {
				value: { default: { value: { "row gap": "1rem" } } },
			},
		},
	});

	const message = captureError(() => processPrimitives(config));
	assert(
		message.includes("row gap"),
		`Error must name the offending segment. Received: ${message}`,
	);
	assert(
		message.includes("primitives.card.default.row gap"),
		`Error must name the configuration path. Received: ${message}`,
	);
});

Deno.test("validateName - rejects color delimiters in CSS delimiter characters", () => {
	for (const name of ["a,b", "a:y", "card;button", "card{button}", "a(b)"]) {
		const message = captureError(() =>
			processColors({
				palette: { value: { [name]: { value: { 100: { hex: "#ff0000" } } } } },
			} as never),
		);
		assert(
			message.includes(name),
			`Error must name the offending segment ${name}. Received: ${message}`,
		);
		assert(
			message.includes("palette."),
			`Error must name the configuration path. Received: ${message}`,
		);
	}
});

Deno.test("validateName - rejects spacing scale and prefix names that are not dashed identifiers", () => {
	const scaleMessage = captureError(() =>
		processSpacing({
			custom: { "size group": { value: { 1: "4px" } } },
		} as never),
	);
	assert(
		scaleMessage.includes("size group") &&
			scaleMessage.includes("spacing.custom.size group"),
		`Spacing scale error must name segment and path. Received: ${scaleMessage}`,
	);

	const tokenMessage = captureError(() =>
		processSpacing({
			custom: { size: { value: { "1 2": "4px" } } },
		} as never),
	);
	assert(
		tokenMessage.includes("1 2") && tokenMessage.includes("spacing.custom.size.1 2"),
		`Spacing token error must name segment and path. Received: ${tokenMessage}`,
	);

	const fluidScaleMessage = captureError(() =>
		processSpacing({
			fluid: {
				"base scale": {
					value: {
						minSize: 4,
						maxSize: 24,
						minWidth: 320,
						maxWidth: 1280,
						negativeSteps: [0],
						positiveSteps: [1],
					},
				},
			},
		} as never),
	);
	assert(
		fluidScaleMessage.includes("base scale") &&
			fluidScaleMessage.includes("spacing_fluid.base scale"),
		`Fluid scale error must name segment and path. Received: ${fluidScaleMessage}`,
	);

	const fluidMessage = captureError(() =>
		processSpacing({
			fluid: {
				base: {
					value: {
						minSize: 4,
						maxSize: 24,
						minWidth: 320,
						maxWidth: 1280,
						negativeSteps: [0],
						positiveSteps: [1],
						prefix: "gap x",
					},
				},
			},
		} as never),
	);
	assert(
		fluidMessage.includes("gap x") && fluidMessage.includes("spacing_fluid.base.prefix"),
		`Fluid prefix error must name segment and path. Received: ${fluidMessage}`,
	);
});

Deno.test("validateName - rejects typography scale, weight and prefix names", () => {
	const weightMessage = captureError(() =>
		processTypography({
			weight: { "font family": { value: { regular: "400" } } },
		} as never),
	);
	assert(
		weightMessage.includes("font family") &&
			weightMessage.includes("typography.weight.font family"),
		`Typography weight error must name segment and path. Received: ${weightMessage}`,
	);

	const weightTokenMessage = captureError(() =>
		processTypography({
			weight: { arial: { value: { "semi bold": "600" } } },
		} as never),
	);
	assert(
		weightTokenMessage.includes("semi bold") &&
			weightTokenMessage.includes("typography.weight.arial.semi bold"),
		`Typography weight token error must name segment and path. Received: ${weightTokenMessage}`,
	);

	const scaleMessage = captureError(() =>
		processTypography({
			fluid: {
				"base scale": {
					value: {
						minWidth: 320,
						minFontSize: 14,
						minTypeScale: 1.25,
						maxWidth: 1435,
						maxFontSize: 16,
						maxTypeScale: 1.25,
						positiveSteps: 1,
						negativeSteps: 0,
					},
				},
			},
		} as never),
	);
	assert(
		scaleMessage.includes("base scale") &&
			scaleMessage.includes("typography_fluid.base scale"),
		`Typography scale error must name segment and path. Received: ${scaleMessage}`,
	);

	const prefixMessage = captureError(() =>
		processTypography({
			fluid: {
				base: {
					value: {
						minWidth: 320,
						minFontSize: 14,
						minTypeScale: 1.25,
						maxWidth: 1435,
						maxFontSize: 16,
						maxTypeScale: 1.25,
						positiveSteps: 1,
						negativeSteps: 0,
						prefix: "type x",
					},
				},
			},
		} as never),
	);
	assert(
		prefixMessage.includes("type x") &&
			prefixMessage.includes("typography_fluid.base.prefix"),
		`Fluid type prefix error must name segment and path. Received: ${prefixMessage}`,
	);
});

Deno.test("validateName - rejects typography custom labels that are not dashed identifiers", () => {
	const message = captureError(() =>
		processTypography({
			fluid: {
				base: {
					value: {
						minWidth: 320,
						minFontSize: 14,
						minTypeScale: 1.25,
						maxWidth: 1435,
						maxFontSize: 16,
						maxTypeScale: 1.25,
						positiveSteps: 1,
						negativeSteps: 0,
					},
					settings: { customLabel: { "1": "big type", "0": "0" } },
				},
			},
		} as never),
	);
	assert(
		message.includes("big type") &&
			message.includes("typography_fluid.base.settings.customLabel"),
		`Custom label error must name segment and path. Received: ${message}`,
	);
});

Deno.test("validateName - rejects theme and gradient names that are not dashed identifiers", () => {
	const gradientMessage = captureError(() =>
		processColors({
			palette: { value: { coral: { value: { "50": { hex: "#FF7E60" } } } } },
			gradients: {
				value: {
					"orange gradient": {
						value: { primary: { value: "linear-gradient(#f00, #00f)" } },
					},
				},
			},
		} as never),
	);
	assert(
		gradientMessage.includes("orange gradient") &&
			gradientMessage.includes("gradients.orange gradient"),
		`Gradient error must name segment and path. Received: ${gradientMessage}`,
	);

	const themeMessage = captureError(() =>
		processColors({
			palette: { value: { coral: { value: { "50": { hex: "#FF7E60" } } } } },
			theme: {
				"dark mode": {
					value: {
						background: {
							value: { primary: "var(--c)" },
							variables: { c: "palette.coral.50" },
						},
					},
				},
			},
		} as never),
	);
	assert(
		themeMessage.includes("dark mode") && themeMessage.includes("theme.dark mode"),
		`Theme error must name segment and path. Received: ${themeMessage}`,
	);
});

Deno.test("validateName - rejects variable alias keys that would emit invalid references", () => {
	const message = captureError(() =>
		processPrimitives({
			colors: { palette: { value: { coral: { value: { "50": { hex: "#FF7E60" } } } } } },
			primitives: {
				btn: {
					value: {
						d: {
							value: { color: "var(--my color)" },
							variables: { "my color": "palette.coral.50" },
						},
					},
				},
			},
		} as never),
	);
	assert(
		message.includes("my color") && message.includes("primitives.btn.d.variables"),
		`Alias key error must name segment and path. Received: ${message}`,
	);
});

Deno.test("validateName - rejects each ASCII delimiter and keeps ASCII identifier characters", () => {
	const rejected = " !\"#$%&'()*+,./:;<=>?@[\\]^`{|}~";
	const accepted = "-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz";

	for (const character of rejected) {
		const message = captureError(() =>
			processSpacing({
				custom: { size: { value: { [`a${character}b`]: "4px" } } },
			} as never),
		);
		assert(
			message.includes(`a${character}b`),
			`Expected "${character}" to be rejected as a name segment. Received: ${message}`,
		);
	}

	for (const character of accepted) {
		const css = processSpacing({
			custom: { size: { value: { [`a${character}b`]: "4px" } } },
		} as never).css.root;
		assert(
			Boolean(css?.startsWith(`--spacing-size-a${character}b:`)),
			`Expected "${character}" to stay accepted. Received: ${css}`,
		);
	}
});

Deno.test("validateName - surfaces name errors that module error handling would swallow", () => {
	// Palette colors and themes log ordinary per-token failures and continue. A
	// configuration mistake must not be hidden that way, otherwise the caller sees
	// silently missing declarations instead of an actionable error.
	const paletteVariant = captureError(() =>
		processColors({
			palette: { value: { coral: { value: { "50 light": { hex: "#ff0000" } } } } },
		} as never),
	);
	assert(
		paletteVariant.includes("50 light") &&
			paletteVariant.includes("palette.coral.50 light"),
		`Palette variant error must escape per-color error handling. Received: ${paletteVariant}`,
	);

	const themeVariant = captureError(() =>
		processColors({
			palette: { value: { coral: { value: { "50": { hex: "#ff0000" } } } } },
			theme: {
				light: {
					value: {
						background: {
							value: { "primary dark": "var(--c)" },
							variables: { c: "palette.coral.50" },
						},
					},
				},
			},
		} as never),
	);
	assert(
		themeVariant.includes("primary dark") &&
			themeVariant.includes("theme.light.background.primary dark"),
		`Theme variant error must escape per-theme error handling. Received: ${themeVariant}`,
	);
});

Deno.test("validateName - keeps numeric keys, hyphens, underscores and non-ASCII names working", () => {
	const config = defineConfig({
		spacing: {
			custom: {
				size: { value: { 1: "4px", "2xl": "8px", sm_2: "12px", größe: "16px" } },
			},
		},
		primitives: {
			"card-2": {
				value: {
					hover_focus: { value: { "background-color": "1rem", "row-gap": "2rem" } },
				},
			},
		},
	});

	const spacing = processSpacing(config.spacing);
	const primitives = processPrimitives(config);
	const css = `${spacing.css.root}\n${primitives.css.root}`;

	assert(
		css.includes("--spacing-size-1: 0.25rem;"),
		`Numeric keys must keep working. Received: ${css}`,
	);
	assert(
		css.includes("--spacing-size-2xl: 0.5rem;"),
		`Hyphenated keys must keep working. Received: ${css}`,
	);
	assert(
		css.includes("--spacing-size-sm_2: 0.75rem;"),
		`Underscore keys must keep working. Received: ${css}`,
	);
	assert(
		css.includes("--spacing-size-größe: 1rem;"),
		`Non-ASCII keys must keep working. Received: ${css}`,
	);
	assert(
		css.includes("--card-2-hover_focus-background-color: 1rem;") &&
			css.includes("--card-2-hover_focus-row-gap: 2rem;"),
		`Primitive names with hyphens and underscores must keep working. Received: ${css}`,
	);
	assertEquals(invalidDashedIdentifiers(css), []);
});

Deno.test("generateCSS - never emits a malformed custom property name", () => {
	const config = defineConfig({
		colors: {
			palette: { value: { coral: { value: { "50": { hex: "#FF7E60" } } } } },
			gradients: {
				value: {
					orangeGradient: {
						value: { primary: { value: "linear-gradient(#f00, #00f)" } },
					},
				},
			},
			theme: {
				light: {
					value: {
						background: {
							value: { primary: "var(--grad)" },
							variables: { grad: "gradients.orangeGradient.primary" },
						},
					},
				},
			},
		},
		spacing: {
			custom: { size: { value: { 1: "4px", 2: "8px" } } },
			fluid: {
				gap: {
					value: {
						minSize: 4,
						maxSize: 24,
						minWidth: 320,
						maxWidth: 1280,
						negativeSteps: [0],
						positiveSteps: [1],
						prefix: "gs",
					},
				},
			},
		},
		typography: {
			fluid: {
				base: {
					value: {
						minWidth: 320,
						minFontSize: 14,
						minTypeScale: 1.25,
						maxWidth: 1435,
						maxFontSize: 16,
						maxTypeScale: 1.25,
						positiveSteps: 1,
						negativeSteps: 0,
						prefix: "text",
					},
				},
			},
			weight: { arial: { value: { regular: "400" } } },
		},
		primitives: {
			"card-2": {
				value: {
					hover_focus: {
						value: {
							"background-color": "var(--bg)",
							"row-gap": "var(--2)",
						},
						variables: {
							bg: "palette.coral.50",
							"2": "spacing.custom.size.2",
						},
					},
				},
			},
		},
	});

	const css = generateCSS(config);
	const malformed = invalidDashedIdentifiers(css);
	assertEquals(
		malformed,
		[],
		`Generated CSS contains malformed custom property names: ${malformed.join(", ")}`,
	);
});

Deno.test("generateCSS - rejects names that would emit malformed declarations", () => {
	const config = defineConfig({
		primitives: {
			"card button": {
				value: { default: { value: { gap: "1rem" } } },
			},
		},
	});

	const message = captureError(() => generateCSS(config));
	assert(
		message.includes("card button") && message.includes("primitives.card button"),
		`Generation must fail with a configuration-path error. Received: ${message}`,
	);

	assert(
		captureError(() => generateJSON(config)).includes("primitives.card button"),
		"JSON generation must fail with the same configuration-path error.",
	);
	assert(
		captureError(() => generateTS(config)).includes("primitives.card button"),
		"TypeScript generation must fail with the same configuration-path error.",
	);
});
