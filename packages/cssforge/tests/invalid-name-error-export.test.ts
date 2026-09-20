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

/**
 * `InvalidNameError` is thrown by name validation, so a consumer needs to catch it
 * by type. These tests import it from the package entry on purpose: the export is
 * the behaviour under test, and importing from `helpers.ts` would pass even when
 * the entry does not re-export it.
 */
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

Deno.test("InvalidNameError - catches a primitive name validation failure with instanceof", () => {
	const config = {
		primitives: {
			"card button": {
				value: { default: { value: { gap: "1rem" } } },
			},
		},
	};

	let caught: unknown;
	try {
		processPrimitives(config as never);
	} catch (error) {
		caught = error;
	}

	assert(caught instanceof InvalidNameError, "Expected an InvalidNameError instance.");
	assert(
		(caught as Error).message.includes("primitives.card button"),
		`The error must keep its configuration path. Received: ${(caught as Error).message}`,
	);
	// The typed catch is the whole point of the export; `error.name` is the
	// type-unsafe handle a consumer has today.
	assertEquals((caught as Error).name, "InvalidNameError");
});

Deno.test("InvalidNameError - is reachable through every public entry", () => {
	// Only the entries `mod.ts` actually exports. `generateJSON` and `generateTS`
	// live in `generator.ts` and are deliberately not part of the package surface.
	const entries: Array<[string, () => unknown]> = [
		[
			"generateCSS",
			() =>
				generateCSS({
					primitives: {
						"card button": { value: { default: { value: { gap: "1rem" } } } },
					},
				} as never),
		],
		[
			"generateStyleDictionaryJSON",
			() =>
				generateStyleDictionaryJSON({
					primitives: {
						"card button": { value: { default: { value: { gap: "1rem" } } } },
					},
				} as never),
		],
		[
			"processPrimitives",
			() =>
				processPrimitives({
					primitives: {
						"card button": { value: { default: { value: { gap: "1rem" } } } },
					},
				} as never),
		],
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
