import {
	generateCSS,
	generateJSON,
	generateStyleDictionaryJSON,
	generateTS,
} from "../src/generator.ts";
// The public entry point, so the diagnostic is proven reachable by consumers.
import { defineConfig, generateCSS as generateCSSFromPublicEntry } from "../src/mod.ts";
import { assertDoesNotThrow, assertEquals, assertThrows, Deno } from "./vitest-compat.ts";

const captureError = (run: () => unknown): Error => assertThrows(run);

/** `primitives.a-b.c.x` and `primitives.a.b-c.x` both join to `--a-b-c-x`. */
const collidingConfig = () =>
	defineConfig({
		primitives: {
			"a-b": { value: { c: { value: { x: "1rem" } } } },
			a: { value: { "b-c": { value: { x: "2rem" } } } },
		},
	});

const collisionMessage =
	'Token key collision: "primitives.a-b.c.x" and "primitives.a.b-c.x" both generate "--a-b-c-x". Rename one of the configuration paths.';

const palette = { value: { white: { value: { x: { hex: "#ffffff" } } } } };

Deno.test("generator - every output rejects two paths that generate the same key", () => {
	const outputs: Array<[string, () => unknown]> = [
		["generateCSS", () => generateCSS(collidingConfig())],
		["generateJSON", () => generateJSON(collidingConfig())],
		["generateTS", () => generateTS(collidingConfig())],
		["generateStyleDictionaryJSON", () => generateStyleDictionaryJSON(collidingConfig())],
		["the public entry point", () => generateCSSFromPublicEntry(collidingConfig())],
	];

	for (const [label, run] of outputs) {
		assertEquals(captureError(run).message, collisionMessage, label);
	}
});

Deno.test("generator - a collision is reported from any module", () => {
	const collisions: Array<[string, () => unknown, string]> = [
		[
			"colors",
			() =>
				generateJSON(
					defineConfig({
						colors: {
							palette: {
								value: {
									"a-b": { value: { c: { hex: "#ffffff" } } },
									a: { value: { "b-c": { hex: "#000000" } } },
								},
							},
						},
					}),
				),
			'Token key collision: "palette.a-b.c" and "palette.a.b-c" both generate "--palette-a-b-c". Rename one of the configuration paths.',
		],
		[
			"spacing",
			() =>
				generateCSS(
					defineConfig({
						spacing: {
							custom: {
								"a-b": { value: { c: "1px" } },
								a: { value: { "b-c": "2px" } },
							},
						},
					}),
				),
			'Token key collision: "spacing.custom.a-b.c" and "spacing.custom.a.b-c" both generate "--spacing-a-b-c". Rename one of the configuration paths.',
		],
	];

	for (const [label, run, expected] of collisions) {
		assertEquals(captureError(run).message, expected, label);
	}
});

Deno.test("generator - a near-miss with distinct keys is unaffected", () => {
	const config = defineConfig({
		primitives: {
			"a-b": { value: { c: { value: { x: "1rem" } } } },
			a: { value: { "d-c": { value: { x: "2rem" } } } },
		},
	});

	assertEquals(generateCSS(config).includes("--a-b-c-x: 1rem;"), true);
	assertEquals(generateCSS(config).includes("--a-d-c-x: 2rem;"), true);

	const json = JSON.parse(generateJSON(config));
	assertEquals(json.primitives["a-b"].c.x.key, "--a-b-c-x");
	assertEquals(json.primitives.a["d-c"].x.key, "--a-d-c-x");
});

/** A theme color that emits `--primary` when `variantNameOnly` is set. */
const variantTheme = (
	variables: Record<string, string> = { white: "palette.white.x" },
) => ({
	background: {
		value: { primary: "var(--white)" },
		variables,
		settings: { variantNameOnly: true },
	},
});

Deno.test("generator - variantNameOnly themes may reuse a key in different scopes", () => {
	const css = generateCSS(
		defineConfig({
			colors: {
				palette,
				theme: {
					light: { value: variantTheme() },
					dark: {
						value: variantTheme(),
						settings: { atRule: "@media (prefers-color-scheme: dark)" },
					},
					pink: { value: variantTheme(), settings: { selector: ".ThemePink" } },
				},
			},
		}),
	);

	assertEquals((css.match(/--primary:/g) ?? []).length, 3);
	assertEquals(css.includes("@media (prefers-color-scheme: dark) {"), true);
	assertEquals(css.includes(".ThemePink {"), true);
});

Deno.test("generator - unscoped declarations that share a key are rejected", () => {
	// Every case below lands in `:root`, so one declaration overwrites the other.
	const unscoped: Array<[string, () => unknown, string]> = [
		[
			"two themes",
			() =>
				generateCSS(
					defineConfig({
						colors: {
							palette,
							theme: {
								light: { value: variantTheme() },
								other: { value: variantTheme() },
							},
						},
					}),
				),
			'Token key collision: "theme.light.background.primary" and "theme.other.background.primary" both generate "--primary". Rename one of the configuration paths.',
		],
		[
			"a theme and the spacing module",
			() =>
				generateCSS(
					defineConfig({
						colors: {
							palette,
							theme: {
								light: {
									value: {
										background: {
											value: { "spacing-size-1": "var(--white)" },
											variables: { white: "palette.white.x" },
											settings: { variantNameOnly: true },
										},
									},
								},
							},
						},
						spacing: { custom: { size: { value: { "1": "4px" } } } },
					}),
				),
			'Token key collision: "theme.light.background.spacing-size-1" and "spacing.custom.size.1" both generate "--spacing-size-1". Rename one of the configuration paths.',
		],
		[
			"a theme and the palette",
			() =>
				generateCSS(
					defineConfig({
						colors: {
							palette: { value: { brand: { value: { "500": { hex: "#ffffff" } } } } },
							theme: {
								light: {
									value: {
										background: {
											value: { "palette-brand-500": "var(--brand)" },
											variables: { brand: "palette.brand.500" },
											settings: { variantNameOnly: true },
										},
									},
								},
							},
						},
					}),
				),
			'Token key collision: "palette.brand.500" and "theme.light.background.palette-brand-500" both generate "--palette-brand-500". Rename one of the configuration paths.',
		],
		[
			"an explicit :root selector and an unscoped token",
			() =>
				generateCSS(
					defineConfig({
						colors: {
							palette: {
								value: {
									"a-b": {
										value: { c: { hex: "#ffffff" } },
										settings: { selector: ":root" },
									},
									a: { value: { "b-c": { hex: "#000000" } } },
								},
							},
						},
					}),
				),
			'Token key collision: "palette.a-b.c" and "palette.a.b-c" both generate "--palette-a-b-c". Rename one of the configuration paths.',
		],
	];

	for (const [label, run, expected] of unscoped) {
		assertEquals(captureError(run).message, expected, label);
	}
});

Deno.test("generator - an explicit :root selector collides inside a shared at-rule", () => {
	const error = captureError(() =>
		generateCSS(
			defineConfig({
				colors: {
					palette,
					theme: {
						light: {
							value: variantTheme(),
							settings: {
								atRule: "@media (prefers-color-scheme: dark)",
								selector: ":root",
							},
						},
						dark: {
							value: variantTheme(),
							settings: { atRule: "@media (prefers-color-scheme: dark)" },
						},
					},
				},
			}),
		),
	);
	assertEquals(
		error.message,
		'Token key collision: "theme.light.background.primary" and "theme.dark.background.primary" both generate "--primary". Rename one of the configuration paths.',
	);
});

Deno.test("generator - differing wrappers may share a key", () => {
	// A wrapper is part of the scope identity, so the same name under two
	// different wrappers does not overwrite. Covers both modules and both
	// wrapper kinds.
	const gradientVariant = () => ({
		value: "linear-gradient(var(--w), var(--w))",
		variables: { w: "palette.white.x" },
	});

	const accepted: Array<[string, () => string, string, string]> = [
		[
			"palette selectors",
			() =>
				generateCSS(
					defineConfig({
						colors: {
							palette: {
								value: {
									"a-b": {
										value: { c: { hex: "#ffffff" } },
										settings: { selector: ".ThemeAlt" },
									},
									a: { value: { "b-c": { hex: "#000000" } } },
								},
							},
						},
					}),
				),
			"--palette-a-b-c:",
			".ThemeAlt {",
		],
		[
			"palette at-rules",
			() =>
				generateCSS(
					defineConfig({
						colors: {
							palette: {
								value: {
									"a-b": {
										value: { c: { hex: "#ffffff" } },
										settings: { atRule: "@media (prefers-color-scheme: dark)" },
									},
									a: { value: { "b-c": { hex: "#000000" } } },
								},
							},
						},
					}),
				),
			"--palette-a-b-c:",
			"@media (prefers-color-scheme: dark) {",
		],
		[
			"gradient selectors",
			() =>
				generateCSS(
					defineConfig({
						colors: {
							palette,
							gradients: {
								value: {
									"a-b": {
										value: { c: gradientVariant() },
										settings: { selector: ".Alt" },
									},
									a: { value: { "b-c": gradientVariant() } },
								},
							},
						},
					}),
				),
			"--gradients-a-b-c:",
			".Alt {",
		],
		[
			"gradient at-rules",
			() =>
				generateCSS(
					defineConfig({
						colors: {
							palette,
							gradients: {
								value: {
									"a-b": {
										value: { c: gradientVariant() },
										settings: { atRule: "@media (prefers-color-scheme: dark)" },
									},
									a: { value: { "b-c": gradientVariant() } },
								},
							},
						},
					}),
				),
			"--gradients-a-b-c:",
			"@media (prefers-color-scheme: dark) {",
		],
	];

	for (const [label, run, key, wrapper] of accepted) {
		assertDoesNotThrow(run, label);
		const css = run();
		assertEquals((css.match(new RegExp(key, "g")) ?? []).length, 2, label);
		assertEquals(css.includes(wrapper), true, label);
	}
});
