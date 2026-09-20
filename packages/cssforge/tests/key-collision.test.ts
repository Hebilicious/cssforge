import {
	generateCSS,
	generateJSON,
	generateStyleDictionaryJSON,
	generateTS,
} from "../src/generator.ts";
// The public entry point, so the diagnostic is proven reachable by consumers.
import { defineConfig, generateCSS as generateCSSFromPublicEntry } from "../src/mod.ts";
import {
	assertDoesNotThrow,
	assertEquals,
	assertSnapshot,
	assertThrows,
	Deno,
} from "./vitest-compat.ts";

/** Captures a thrown Error so the assertion can inspect its message. */
const captureError = (run: () => unknown): Error => assertThrows(run);

/**
 * Two distinct configuration paths: `primitives.a-b.c.x` and
 * `primitives.a.b-c.x` both join to `--a-b-c-x`.
 */
const collidingConfig = () =>
	defineConfig({
		primitives: {
			"a-b": { value: { c: { value: { x: "1rem" } } } },
			a: { value: { "b-c": { value: { x: "2rem" } } } },
		},
	});

const collisionMessage =
	'Token key collision: "primitives.a-b.c.x" and "primitives.a.b-c.x" both generate "--a-b-c-x". Rename one of the configuration paths.';

Deno.test("generateCSS - rejects two paths that generate the same key", () => {
	const error = captureError(() => generateCSS(collidingConfig()));
	assertEquals(error.message, collisionMessage);
});

Deno.test("generateJSON - rejects two paths that generate the same key", () => {
	const error = captureError(() => generateJSON(collidingConfig()));
	assertEquals(error.message, collisionMessage);
});

Deno.test("generateTS - rejects two paths that generate the same key", () => {
	const error = captureError(() => generateTS(collidingConfig()));
	assertEquals(error.message, collisionMessage);
});

Deno.test("generateStyleDictionaryJSON - rejects two paths that generate the same key", () => {
	const error = captureError(() => generateStyleDictionaryJSON(collidingConfig()));
	assertEquals(error.message, collisionMessage);
});

Deno.test("generator - the collision error escapes the public entry point", () => {
	const error = captureError(() => generateCSSFromPublicEntry(collidingConfig()));
	assertEquals(error.message, collisionMessage);
});

Deno.test("generator - a near-miss with distinct keys is unaffected", async (t) => {
	const config = defineConfig({
		primitives: {
			"a-b": { value: { c: { value: { x: "1rem" } } } },
			a: { value: { "d-c": { value: { x: "2rem" } } } },
		},
	});

	const css = generateCSS(config);
	assertEquals(
		css.includes("--a-b-c-x: 1rem;") && css.includes("--a-d-c-x: 2rem;"),
		true,
	);

	const json = JSON.parse(generateJSON(config));
	assertEquals(json.primitives["a-b"].c.x.key, "--a-b-c-x");
	assertEquals(json.primitives.a["d-c"].x.key, "--a-d-c-x");

	const styleDictionary = JSON.parse(generateStyleDictionaryJSON(config));
	assertEquals(styleDictionary.primitives["a-b"].c.x.value, "1rem");
	assertEquals(styleDictionary.primitives.a["d-c"].x.value, "2rem");

	await assertSnapshot(t, css);
	await assertSnapshot(t, json);
});

Deno.test("generator - a single module with unique keys is unaffected", async (t) => {
	const config = defineConfig({
		primitives: {
			"a-b": { value: { c: { value: { x: "1rem", y: "2rem" } } } },
		},
	});

	assertEquals(
		generateCSS(config).includes("--a-b-c-x: 1rem;") &&
			generateCSS(config).includes("--a-b-c-y: 2rem;"),
		true,
	);

	const ts = generateTS(config);
	assertEquals(ts.includes('"--a-b-c-x"') && ts.includes('"--a-b-c-y"'), true);

	await assertSnapshot(t, generateCSS(config));
});

Deno.test("generateJSON - rejects a collision inside the colors module", () => {
	// The check lives in the shared resolve map, so it also covers modules other
	// than primitives: palette `a-b.c` and palette `a.b-c` both generate
	// `--palette-a-b-c`.
	const error = captureError(() =>
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
	);
	assertEquals(
		error.message,
		'Token key collision: "palette.a-b.c" and "palette.a.b-c" both generate "--palette-a-b-c". Rename one of the configuration paths.',
	);
});

Deno.test("generateCSS - rejects a collision in the spacing module", () => {
	const error = captureError(() =>
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
	);
	assertEquals(error.message.includes("Token key collision"), true);
	assertEquals(error.message.includes('"spacing.custom.a-b.c"'), true);
	assertEquals(error.message.includes('"spacing.custom.a.b-c"'), true);
});

Deno.test("generator - variantNameOnly themes may reuse a key in different scopes", async (t) => {
	// Every theme emits `--primary`. That is not a collision because each theme
	// is scoped by its own selector or atRule.
	const config = defineConfig({
		colors: {
			palette: {
				value: {
					white: { value: { x: { hex: "#ffffff" } } },
				},
			},
			theme: {
				light: {
					value: {
						background: {
							value: { primary: "var(--white)" },
							variables: { white: "palette.white.x" },
							settings: { variantNameOnly: true },
						},
					},
				},
				dark: {
					value: {
						background: {
							value: { primary: "var(--white)" },
							variables: { white: "palette.white.x" },
							settings: { variantNameOnly: true },
						},
					},
					settings: { atRule: "@media (prefers-color-scheme: dark)" },
				},
				pink: {
					value: {
						background: {
							value: { primary: "var(--white)" },
							variables: { white: "palette.white.x" },
							settings: { variantNameOnly: true },
						},
					},
					settings: { selector: ".ThemePink" },
				},
			},
		},
	});

	const css = generateCSS(config);
	assertEquals((css.match(/--primary:/g) ?? []).length, 3);
	assertEquals(css.includes("@media (prefers-color-scheme: dark)"), true);
	assertEquals(css.includes(".ThemePink {"), true);
	await assertSnapshot(t, css);
});

Deno.test("generator - two variantNameOnly themes in the same scope do collide", () => {
	// Both themes land in `:root` with no selector or atRule, so one `--primary`
	// silently overwrites the other.
	const themeValue = () => ({
		background: {
			value: { primary: "var(--white)" },
			variables: { white: "palette.white.x" },
			settings: { variantNameOnly: true },
		},
	});

	const error = captureError(() =>
		generateCSS(
			defineConfig({
				colors: {
					palette: { value: { white: { value: { x: { hex: "#ffffff" } } } } },
					theme: {
						light: { value: themeValue() },
						other: { value: themeValue() },
					},
				},
			}),
		),
	);
	assertEquals(
		error.message,
		'Token key collision: "theme.light.background.primary" and "theme.other.background.primary" both generate "--primary". Rename one of the configuration paths.',
	);
});

Deno.test("generator - a variantNameOnly theme collides with unscoped spacing", () => {
	// Both declarations land in `:root`, so the shared name is a real collision
	// even though one comes from a theme and the other from the spacing module.
	const error = captureError(() =>
		generateCSS(
			defineConfig({
				colors: {
					palette: { value: { white: { value: { x: { hex: "#ffffff" } } } } },
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
				spacing: {
					custom: { size: { value: { "1": "4px" } } },
				},
			}),
		),
	);
	assertEquals(
		error.message,
		'Token key collision: "theme.light.background.spacing-size-1" and "spacing.custom.size.1" both generate "--spacing-size-1". Rename one of the configuration paths.',
	);
});

Deno.test("generator - a variantNameOnly theme collides with an unscoped palette color", () => {
	const error = captureError(() =>
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
	);
	assertEquals(
		error.message,
		'Token key collision: "palette.brand.500" and "theme.light.background.palette-brand-500" both generate "--palette-brand-500". Rename one of the configuration paths.',
	);
});

Deno.test("generator - palette colors with different selectors may share a key", () => {
	// `a-b.c` is wrapped in `.ThemeAlt` and `a.b-c` is unscoped, so the shared
	// name is emitted into two different scopes and does not overwrite.
	const config = defineConfig({
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
	});

	assertDoesNotThrow(() => generateCSS(config));
	const css = generateCSS(config);
	assertEquals((css.match(/--palette-a-b-c:/g) ?? []).length, 2);
	assertEquals(css.includes(".ThemeAlt {"), true);
});

Deno.test("generator - palette colors with different at-rules may share a key", () => {
	const config = defineConfig({
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
	});

	assertDoesNotThrow(() => generateCSS(config));
	assertEquals(
		generateCSS(config).includes("@media (prefers-color-scheme: dark) {"),
		true,
	);
});

Deno.test("generator - gradients with different selectors may share a key", () => {
	// `Gradient.settings` wraps every variant of that named gradient, so `a-b.c`
	// lands in `.Alt` while `a.b-c` stays unscoped. The shared name therefore
	// does not overwrite anything.
	const gradientVariant = () => ({
		value: "linear-gradient(var(--w), var(--w))",
		variables: { w: "palette.white.x" },
	});

	const config = defineConfig({
		colors: {
			palette: { value: { white: { value: { x: { hex: "#ffffff" } } } } },
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
	});

	assertDoesNotThrow(() => generateCSS(config));
	const css = generateCSS(config);
	assertEquals((css.match(/--gradients-a-b-c:/g) ?? []).length, 2);
	assertEquals(css.includes(".Alt {"), true);
});

Deno.test("generator - unscoped themes that reuse a key are rejected", () => {
	const unscopedTheme = () => ({
		background: {
			value: { primary: "var(--white)" },
			variables: { white: "palette.white.x" },
			settings: { variantNameOnly: true },
		},
	});

	const error = captureError(() =>
		generateCSS(
			defineConfig({
				colors: {
					palette: { value: { white: { value: { x: { hex: "#ffffff" } } } } },
					theme: {
						light: { value: unscopedTheme() },
						dark: { value: unscopedTheme() },
					},
				},
			}),
		),
	);
	assertEquals(
		error.message.includes("Token key collision") &&
			error.message.includes('"--primary"'),
		true,
	);
});

Deno.test("generator - an explicit :root selector collides with an unscoped token", () => {
	// A `:root` selector block and the implicit `:root` block declare the same
	// property on the same element, so the shared name overwrites.
	const error = captureError(() =>
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
	);
	assertEquals(
		error.message,
		'Token key collision: "palette.a-b.c" and "palette.a.b-c" both generate "--palette-a-b-c". Rename one of the configuration paths.',
	);
});

Deno.test("generator - an explicit :root selector collides inside a shared at-rule", () => {
	// Both themes put `--primary` on `:root` under the same media condition.
	const scopedTheme = () => ({
		bg: {
			value: { primary: "var(--white)" },
			variables: { white: "palette.white.x" },
			settings: { variantNameOnly: true },
		},
	});

	const error = captureError(() =>
		generateCSS(
			defineConfig({
				colors: {
					palette: { value: { white: { value: { x: { hex: "#ffffff" } } } } },
					theme: {
						light: {
							value: scopedTheme(),
							settings: {
								atRule: "@media (prefers-color-scheme: dark)",
								selector: ":root",
							},
						},
						dark: {
							value: scopedTheme(),
							settings: { atRule: "@media (prefers-color-scheme: dark)" },
						},
					},
				},
			}),
		),
	);
	assertEquals(
		error.message,
		'Token key collision: "theme.light.bg.primary" and "theme.dark.bg.primary" both generate "--primary". Rename one of the configuration paths.',
	);
});

Deno.test("generator - gradients with different at-rules may share a key", () => {
	// The gradient atRule mirror of the palette and selector cases, so all four
	// wrapper combinations are covered.
	const gradientVariant = () => ({
		value: "linear-gradient(var(--w), var(--w))",
		variables: { w: "palette.white.x" },
	});

	const config = defineConfig({
		colors: {
			palette: { value: { white: { value: { x: { hex: "#ffffff" } } } } },
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
	});

	assertDoesNotThrow(() => generateCSS(config));
	const css = generateCSS(config);
	assertEquals((css.match(/--gradients-a-b-c:/g) ?? []).length, 2);
	assertEquals(css.includes("@media (prefers-color-scheme: dark) {"), true);
});

Deno.test("generator - the documented light/dark/pink theming example still works", async (t) => {
	const themeColor = (variable: string) => ({
		value: { primary: `var(--${variable})`, secondary: `var(--${variable})` },
		variables: { [variable]: "palette.simple.white" },
		settings: { variantNameOnly: true },
	});

	const config = defineConfig({
		colors: {
			palette: {
				value: {
					simple: {
						value: {
							white: { hex: "#ffffff" },
							red: { hex: "#ff0000" },
						},
					},
				},
			},
			theme: {
				light: { value: { background: themeColor("one") } },
				dark: {
					value: { background: themeColor("one") },
					settings: { atRule: "@media (prefers-color-scheme: dark)" },
				},
				pink: {
					value: { background: themeColor("two") },
					settings: { selector: ".ThemePink" },
				},
			},
		},
	});

	assertDoesNotThrow(() => generateCSS(config));
	const css = generateCSS(config);
	assertEquals((css.match(/--primary:/g) ?? []).length, 3);
	assertEquals(css.includes("@media (prefers-color-scheme: dark) {"), true);
	assertEquals(css.includes(".ThemePink {"), true);
	await assertSnapshot(t, css);
});
