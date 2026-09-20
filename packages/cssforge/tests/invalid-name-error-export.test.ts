import {
	generateCSS,
	generateStyleDictionaryJSON,
	InvalidNameError,
	processColors,
	processPrimitives,
	processSpacing,
	processTypography,
} from "../src/mod.ts";
import { assert, assertEquals, Deno } from "./vitest-compat.ts";

// Imported from the package entry on purpose: the export is the behaviour under
// test, so importing from `helpers.ts` would pass even without a re-export.
Deno.test("InvalidNameError - is exported from the package entry as a constructor", () => {
	assertEquals(typeof InvalidNameError, "function");
	assert(
		InvalidNameError.prototype instanceof Error,
		"InvalidNameError must extend Error so existing catch blocks keep working.",
	);

	const error = new InvalidNameError("boom");
	assert(error instanceof Error, "An instance must be an Error.");
	assertEquals(error.name, "InvalidNameError");
	assertEquals(error.message, "boom");
});

const invalidPrimitiveConfig = {
	primitives: {
		"card button": {
			value: { default: { value: { gap: "1rem" } } },
		},
	},
};

Deno.test("InvalidNameError - catches a name validation failure with instanceof", () => {
	let caught: unknown;
	try {
		processPrimitives(invalidPrimitiveConfig as never);
	} catch (error) {
		caught = error;
	}

	assert(caught instanceof InvalidNameError, "Expected an InvalidNameError instance.");
	assertEquals((caught as Error).name, "InvalidNameError");
});

Deno.test("InvalidNameError - is reachable through every public entry", () => {
	// The entries `mod.ts` exports. `generateJSON` and `generateTS` live in
	// `generator.ts` and are not part of the package surface.
	const entries: Array<[string, () => unknown]> = [
		["generateCSS", () => generateCSS(invalidPrimitiveConfig as never)],
		[
			"generateStyleDictionaryJSON",
			() => generateStyleDictionaryJSON(invalidPrimitiveConfig as never),
		],
		["processPrimitives", () => processPrimitives(invalidPrimitiveConfig as never)],
		[
			"processColors",
			() =>
				processColors({
					palette: { value: { "a b": { value: { "50": { hex: "#ff0000" } } } } },
				} as never),
		],
		[
			"processSpacing",
			() => processSpacing({ custom: { "a b": { value: { "1": "4px" } } } } as never),
		],
		[
			"processTypography",
			() =>
				processTypography({ weight: { "a b": { value: { regular: "400" } } } } as never),
		],
	];

	for (const [label, run] of entries) {
		let caught: unknown;
		try {
			run();
		} catch (error) {
			caught = error;
		}
		assert(
			caught instanceof InvalidNameError,
			`${label} must surface an InvalidNameError, received ${String(caught)}.`,
		);
	}
});

Deno.test("InvalidNameError - does not affect valid configurations", () => {
	const css = generateCSS({
		primitives: {
			"card-2": {
				value: { default: { value: { gap: "1rem" } } },
			},
		},
	} as never);

	assert(
		css.includes("--card-2-default-gap: 1rem;"),
		`Valid names must keep generating. Received: ${css}`,
	);
});
