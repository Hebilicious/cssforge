import type { CSSForgeConfig } from "../src/mod.ts";
import { defineConfig, generateCSS } from "../src/mod.ts";
import { assert, assertThrows, Deno } from "./vitest-compat.ts";

/** Settings are read from a JavaScript object at runtime, so every module validates them. */

const fluidValue = {
	minWidth: 320,
	minFontSize: 14,
	minTypeScale: 1.25,
	maxWidth: 1435,
	maxFontSize: 16,
	maxTypeScale: 1.25,
	positiveSteps: 1,
	negativeSteps: 0,
};

const palette = { value: { coral: { 100: { hex: "#FF7F50" } } } };

Deno.test("generateCSS - rejects a spacing settings value that is not an object", () => {
	const config = {
		spacing: { custom: { size: { value: { 2: "8px" }, settings: "rem" } } },
	} as unknown as CSSForgeConfig;

	const error = assertThrows(() => generateCSS(config));

	assert(
		error.message.includes('"spacing.custom.size.settings"'),
		`Expected the error to name the scale. Received: ${error.message}`,
	);
});

Deno.test("generateCSS - rejects an unknown spacing setting", () => {
	const config = {
		spacing: { custom: { size: { value: { 2: "8px" }, settings: { remm: 16 } } } },
	} as unknown as CSSForgeConfig;

	const error = assertThrows(() => generateCSS(config));

	assert(
		error.message.includes('"remm"') && error.message.includes('"pxToRem"'),
		`Expected the error to name the key and the accepted ones. Received: ${error.message}`,
	);
});

Deno.test("generateCSS - rejects an unknown typography setting", () => {
	const config = {
		typography: { fluid: { base: { value: fluidValue, settings: { customLabl: {} } } } },
	} as unknown as CSSForgeConfig;

	const error = assertThrows(() => generateCSS(config));

	assert(
		error.message.includes('"typography_fluid.base.settings"') &&
			error.message.includes('"customLabel"'),
		`Expected the error to name the path and the accepted key. Received: ${error.message}`,
	);
});

Deno.test("generateCSS - rejects settings a primitive group does not read", () => {
	const config = {
		primitives: {
			button: {
				value: { default: { value: { color: "red" } } },
				settings: { pxToRem: true },
			},
		},
	} as unknown as CSSForgeConfig;

	const error = assertThrows(() => generateCSS(config));

	assert(
		error.message.includes('"primitives.button.settings"') &&
			error.message.includes("reads no settings"),
		`Expected the error to name the group and the level. Received: ${error.message}`,
	);
});

Deno.test("generateCSS - rejects an unknown primitive variant setting", () => {
	const config = {
		primitives: {
			button: {
				value: {
					default: {
						value: { padding: "8px" },
						settings: { pxToRem: true, rem: 16, foo: 1 },
					},
				},
			},
		},
	} as unknown as CSSForgeConfig;

	const error = assertThrows(() => generateCSS(config));

	assert(
		error.message.includes('"primitives.button.default.settings"') &&
			error.message.includes('"foo"'),
		`Expected the error to name the variant and the key. Received: ${error.message}`,
	);
});

Deno.test("generateCSS - a valid settings object still generates", () => {
	const config = defineConfig({
		colors: { palette },
		spacing: {
			custom: { size: { value: { 2: "8px" }, settings: { pxToRem: true, rem: 16 } } },
		},
		typography: {
			fluid: { base: { value: fluidValue, settings: { customLabel: { "1": "mid" } } } },
		},
		primitives: {
			button: {
				value: { default: { value: { padding: "8px" }, settings: { pxToRem: false } } },
			},
		},
	});

	const css = generateCSS(config);

	assert(css.includes("--spacing-size-2: 0.5rem;"), css);
	assert(css.includes("--typography_fluid-base-mid:"), css);
	assert(css.includes("--button-default-padding: 8px;"), css);
});
