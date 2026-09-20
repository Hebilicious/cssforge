import { expect } from "vitest";
import {
	generateCSS,
	generateJSON,
	generateStyleDictionaryJSON,
	generateTS,
} from "../src/generator.ts";
import { defineConfig } from "../src/mod.ts";
import { assertEquals, assertSnapshot, Deno } from "./vitest-compat.ts";

/** Captures a thrown Error so the assertion can inspect its message. */
const captureError = (run: () => unknown): Error => {
	try {
		run();
	} catch (error) {
		if (error instanceof Error) return error;
		throw error;
	}
	throw new Error("Expected the generator to throw, but it returned a value.");
};

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
	const error = captureError(() => generateCSS(collidingConfig()));
	expect(error).toBeInstanceOf(Error);
	expect(error.message).toContain('"primitives.a-b.c.x"');
	expect(error.message).toContain('"primitives.a.b-c.x"');
	expect(error.message).toContain('"--a-b-c-x"');
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
	expect(error.message).toContain("Token key collision");
	expect(error.message).toContain('"spacing.custom.a-b.c"');
	expect(error.message).toContain('"spacing.custom.a.b-c"');
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
