import { generateCSS, generateJSON, generateTS } from "../src/generator.ts";
import { defineConfig } from "../src/mod.ts";
import { processColors } from "../src/modules/colors.ts";
import { processPrimitives } from "../src/modules/primitive.ts";
import { processSpacing } from "../src/modules/spacing.ts";
import { processTypography } from "../src/modules/typography.ts";
import { assert, assertEquals, Deno } from "./vitest-compat.ts";

/**
 * Declaration names that are not valid CSS dashed identifiers. The name is read
 * up to `:`, because the issue #29 bug put a space inside the name itself.
 * Verified against `css-tree`, except that backslash escapes are rejected here
 * since a name must survive round-tripping through configuration paths.
 */
const invalidDashedIdentifiers = (css: string): string[] =>
	css
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line.startsWith("--"))
		.map((line) => line.slice(0, line.indexOf(":")))
		.filter(
			(name) => !/^--[-]*[\w\u0080-\u{10FFFF}][\w\-\u0080-\u{10FFFF}]*$/u.test(name),
		);

const captureError = (fn: () => unknown): string => {
	try {
		fn();
	} catch (error) {
		return error instanceof Error ? error.message : String(error);
	}
	throw new Error("Expected the call to throw, but it returned normally.");
};

const fluidSize = {
	minWidth: 320,
	minFontSize: 14,
	minTypeScale: 1.25,
	maxWidth: 1435,
	maxFontSize: 16,
	maxTypeScale: 1.25,
	positiveSteps: 1,
	negativeSteps: 0,
};

Deno.test("invalidDashedIdentifiers - detects the malformed name from issue #29", () => {
	assertEquals(invalidDashedIdentifiers("--card button-default-gap: 1rem;"), [
		"--card button-default-gap",
	]);
	assertEquals(invalidDashedIdentifiers("--palette-coral-50: oklch(0 0 0);"), []);
	assertEquals(invalidDashedIdentifiers("---card-default-gap: 1rem;"), []);
	assertEquals(invalidDashedIdentifiers("--50-default-gap: 1rem;"), []);
});

/**
 * Every name segment a module reads from configuration, paired with the path the
 * error must name. Each entry is the invalid form of one `validateName` call
 * site.
 */
const rejectedSegments: Array<[label: string, run: () => unknown, expected: string]> = [
	[
		"primitive name",
		() =>
			processPrimitives({
				primitives: { "card button": { value: { default: { value: { gap: "1rem" } } } } },
			} as never),
		"primitives.card button",
	],
	[
		"primitive variant",
		() =>
			processPrimitives({
				primitives: { card: { value: { "hover focus": { value: { gap: "1rem" } } } } },
			} as never),
		"primitives.card.hover focus",
	],
	[
		"primitive property",
		() =>
			processPrimitives({
				primitives: { card: { value: { default: { value: { "row gap": "1rem" } } } } },
			} as never),
		"primitives.card.default.row gap",
	],
	[
		"palette color",
		() =>
			processColors({
				palette: { value: { "coral red": { value: { 100: { hex: "#ff0000" } } } } },
			} as never),
		"palette.coral red",
	],
	[
		"palette variant",
		() =>
			processColors({
				palette: { value: { coral: { value: { "50 light": { hex: "#ff0000" } } } } },
			} as never),
		"palette.coral.50 light",
	],
	[
		"gradient name",
		() =>
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
		"gradients.orange gradient",
	],
	[
		"gradient variant",
		() =>
			processColors({
				palette: { value: { coral: { value: { "50": { hex: "#FF7E60" } } } } },
				gradients: {
					value: {
						orange: {
							value: { "primary dark": { value: "linear-gradient(#f00, #00f)" } },
						},
					},
				},
			} as never),
		"gradients.orange.primary dark",
	],
	[
		"theme name",
		() =>
			processColors({
				palette: { value: { coral: { value: { "50": { hex: "#FF7E60" } } } } },
				theme: {
					"light mode": {
						value: {
							background: {
								value: { primary: "var(--c)" },
								variables: { c: "palette.coral.50" },
							},
						},
					},
				},
			} as never),
		"theme.light mode",
	],
	[
		"theme variant",
		() =>
			processColors({
				palette: { value: { coral: { value: { "50": { hex: "#FF7E60" } } } } },
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
		"theme.light.background.primary dark",
	],
	[
		"spacing custom scale",
		() => processSpacing({ custom: { "size group": { value: { 1: "4px" } } } } as never),
		"spacing.custom.size group",
	],
	[
		"spacing custom token",
		() => processSpacing({ custom: { size: { value: { "1 2": "4px" } } } } as never),
		"spacing.custom.size.1 2",
	],
	[
		"spacing fluid scale",
		() =>
			processSpacing({
				fluid: { "base scale": { value: { ...fluidSize, maxTypeScale: undefined } } },
			} as never),
		"spacing_fluid.base scale",
	],
	[
		"spacing fluid prefix",
		() =>
			processSpacing({
				fluid: { base: { value: { ...fluidSize, prefix: "gap x" } } },
			} as never),
		"spacing_fluid.base.prefix",
	],
	[
		"typography weight name",
		() =>
			processTypography({
				weight: { "font family": { value: { regular: "400" } } },
			} as never),
		"typography.weight.font family",
	],
	[
		"typography weight token",
		() =>
			processTypography({
				weight: { arial: { value: { "semi bold": "600" } } },
			} as never),
		"typography.weight.arial.semi bold",
	],
	[
		"typography fluid scale",
		() => processTypography({ fluid: { "base scale": { value: fluidSize } } } as never),
		"typography_fluid.base scale",
	],
	[
		"typography fluid prefix",
		() =>
			processTypography({
				fluid: { base: { value: { ...fluidSize, prefix: "type x" } } },
			} as never),
		"typography_fluid.base.prefix",
	],
	[
		"typography custom label",
		() =>
			processTypography({
				fluid: {
					base: { value: fluidSize, settings: { customLabel: { "1": "big type" } } },
				},
			} as never),
		"typography_fluid.base.settings.customLabel",
	],
	[
		"variable alias key",
		() =>
			processPrimitives({
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
		"primitives.btn.d.variables.my color",
	],
];

Deno.test("validateName - rejects an invalid segment at every call site", () => {
	for (const [label, run, expectedPath] of rejectedSegments) {
		const message = captureError(run);
		assert(
			message.includes(expectedPath),
			`${label} must name "${expectedPath}". Received: ${message}`,
		);
	}
});

Deno.test("validateName - rejects every ASCII delimiter as a name segment", () => {
	for (const character of " !\"#$%&'()*+,./:;<=>?@[\\]^`{|}~") {
		const message = captureError(() =>
			processSpacing({
				custom: { size: { value: { [`a${character}b`]: "4px" } } },
			} as never),
		);
		assert(
			message.includes(`a${character}b`),
			`Expected "${character}" to be rejected. Received: ${message}`,
		);
	}
});

Deno.test("validateName - rejects an empty alias key that would emit var(--)", () => {
	const message = captureError(() =>
		processPrimitives({
			primitives: {
				btn: {
					value: {
						d: { value: { color: "var(--)" }, variables: { "": "palette.coral.50" } },
					},
				},
			},
		} as never),
	);
	assert(
		message.includes("primitives.btn.d.variables.") && message.includes("non-empty"),
		`An empty alias key must be rejected with its path. Received: ${message}`,
	);
});

Deno.test("validateName - names the configured alias key verbatim in the error", () => {
	// `getResolvedVariablesMap` builds the reference as `--${varKey}`, so a key
	// written `--alias` already includes its hyphens and must be quoted as-is.
	const message = captureError(() =>
		processPrimitives({
			primitives: {
				btn: {
					value: {
						d: {
							value: { color: "var(----a b)" },
							variables: { "--a b": "palette.coral.50" },
						},
					},
				},
			},
		} as never),
	);
	assert(
		message.includes("Invalid name: --a b") &&
			message.includes("primitives.btn.d.variables.--a b"),
		`Error must name the configured key verbatim. Received: ${message}`,
	);
});

Deno.test("validateName - keeps alias keys and custom labels that are not token keys", () => {
	// Alias keys and custom labels are not token keys, so the reserved-keyword
	// rule must not apply to them.
	const aliasResult = processPrimitives({
		colors: { palette: { value: { coral: { value: { "50": { hex: "#FF7E60" } } } } } },
		primitives: {
			btn: {
				value: {
					d: {
						value: { color: "var(--spacing)" },
						variables: { spacing: "palette.coral.50" },
					},
				},
			},
		},
	} as never);
	assertEquals(
		aliasResult.css.root,
		"/* btn */\n--btn-d-color: var(--palette-coral-50);",
	);

	const labelResult = processTypography({
		fluid: {
			base: { value: fluidSize, settings: { customLabel: { "1": "value", "0": "0" } } },
		},
	} as never);
	assertEquals(labelResult.css.root?.includes("--typography_fluid-base-value:"), true);

	// A hyphen-only alias key is a name that already contains the hyphens, so
	// `var(----)` resolves and must keep working.
	const hyphenKey = processPrimitives({
		colors: { palette: { value: { coral: { value: { "50": { hex: "#FF7E60" } } } } } },
		primitives: {
			btn: {
				value: {
					d: { value: { color: "var(----)" }, variables: { "--": "palette.coral.50" } },
				},
			},
		},
	} as never);
	assertEquals(hyphenKey.css.root, "/* btn */\n--btn-d-color: var(--palette-coral-50);");
});

Deno.test("validateName - keeps numeric, hyphen, underscore and non-ASCII names working", () => {
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

	const css = `${processSpacing(config.spacing).css.root}\n${processPrimitives(config).css.root}`;

	for (const expected of [
		"--spacing-size-1: 0.25rem;",
		"--spacing-size-2xl: 0.5rem;",
		"--spacing-size-sm_2: 0.75rem;",
		"--spacing-size-größe: 1rem;",
		"--card-2-hover_focus-background-color: 1rem;",
		"--card-2-hover_focus-row-gap: 2rem;",
	]) {
		assert(css.includes(expected), `Expected "${expected}". Received: ${css}`);
	}
	assertEquals(invalidDashedIdentifiers(css), []);
});

Deno.test("validateName - validates the custom label that is actually emitted", () => {
	// `customLabel` is read with bracket access, so an inherited mapping resolves
	// through the prototype chain and must still be validated.
	const inherited: Record<string, string> = Object.create({ "1": "big type", "0": "0" });
	const message = captureError(() =>
		processTypography({
			fluid: { base: { value: fluidSize, settings: { customLabel: inherited } } },
		} as never),
	);
	assert(
		message.includes("big type") &&
			message.includes("typography_fluid.base.settings.customLabel"),
		`An inherited invalid label must be rejected. Received: ${message}`,
	);

	// A label with no mapping falls back to the generated step label.
	const fallback = processTypography({
		fluid: { base: { value: fluidSize, settings: { customLabel: {} } } },
	} as never);
	assertEquals(fallback.css.root?.includes("--typography_fluid-base-1:"), true);
	assertEquals(invalidDashedIdentifiers(fallback.css.root ?? ""), []);
});

Deno.test("validateName - surfaces name errors that module error handling would swallow", () => {
	// Palette colors and themes log ordinary token failures and continue, so a
	// configuration mistake must escape instead of silently dropping declarations.
	const paletteVariant = captureError(() =>
		processColors({
			palette: { value: { coral: { value: { "50 light": { hex: "#ff0000" } } } } },
		} as never),
	);
	assertEquals(paletteVariant.includes("palette.coral.50 light"), true);

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
	assertEquals(themeVariant.includes("theme.light.background.primary dark"), true);
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
			fluid: { base: { value: { ...fluidSize, prefix: "text" } } },
			weight: { arial: { value: { regular: "400" } } },
		},
		primitives: {
			"card-2": {
				value: {
					hover_focus: {
						value: { "background-color": "var(--bg)", "row-gap": "var(--2)" },
						variables: { bg: "palette.coral.50", "2": "spacing.custom.size.2" },
					},
				},
			},
		},
	});

	const css = generateCSS(config);
	assertEquals(invalidDashedIdentifiers(css), []);
	// Keeps the check above from passing vacuously: it must see the issue #29 name.
	assertEquals(invalidDashedIdentifiers(`${css}\n--card button-default-gap: 1rem;`), [
		"--card button-default-gap",
	]);
});

Deno.test("generator - rejects an invalid name through every output", () => {
	const config = defineConfig({
		primitives: { "card button": { value: { default: { value: { gap: "1rem" } } } } },
	});

	for (const [output, run] of [
		["CSS", () => generateCSS(config)],
		["JSON", () => generateJSON(config)],
		["TypeScript", () => generateTS(config)],
	] as const) {
		assert(
			captureError(run).includes("primitives.card button"),
			`${output} generation must fail with the configuration path.`,
		);
	}
});
