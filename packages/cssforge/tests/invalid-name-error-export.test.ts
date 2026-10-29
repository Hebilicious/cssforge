import { expect, test } from "vitest";
import {
	generateCSS,
	generateStyleDictionaryJSON,
	InvalidNameError,
	processColors,
	processPrimitives,
	processSpacing,
	processTypography,
} from "../src/mod.ts";

// Imported from the package entry on purpose: the export is the behaviour under
// test, so importing from `helpers.ts` would pass even without a re-export.
test("InvalidNameError - is exported from the package entry as a constructor", () => {
	expect(typeof InvalidNameError).toEqual("function");
	expect(
		InvalidNameError.prototype instanceof Error,
		"InvalidNameError must extend Error so existing catch blocks keep working.",
	).toBeTruthy();

	const error = new InvalidNameError("boom");
	expect(error instanceof Error, "An instance must be an Error.").toBeTruthy();
	expect(error.name).toEqual("InvalidNameError");
	expect(error.message).toEqual("boom");
});

const invalidPrimitiveConfig = {
	primitives: {
		"card button": {
			value: { default: { value: { gap: "1rem" } } },
		},
	},
};

test("InvalidNameError - catches a name validation failure with instanceof", () => {
	let caught: unknown;
	try {
		processPrimitives(invalidPrimitiveConfig as never);
	} catch (error) {
		caught = error;
	}

	expect(
		caught instanceof InvalidNameError,
		"Expected an InvalidNameError instance.",
	).toBeTruthy();
	expect((caught as Error).name).toEqual("InvalidNameError");
});

test("InvalidNameError - is reachable through every public entry", () => {
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
		expect(
			caught instanceof InvalidNameError,
			`${label} must surface an InvalidNameError, received ${String(caught)}.`,
		).toBeTruthy();
	}
});

test("InvalidNameError - does not affect valid configurations", () => {
	const css = generateCSS({
		primitives: {
			"card-2": {
				value: { default: { value: { gap: "1rem" } } },
			},
		},
	} as never);

	expect(
		css.includes("--card-2-default-gap: 1rem;"),
		`Valid names must keep generating. Received: ${css}`,
	).toBeTruthy();
});
