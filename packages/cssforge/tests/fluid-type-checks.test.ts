import { expect, test } from "vitest";
import type { CSSForgeConfig, Diagnostic } from "../src/mod.ts";
import { generateCSS, getDiagnostics } from "../src/mod.ts";
import { thrownError } from "./helpers.ts";

type FluidSettings = NonNullable<
	NonNullable<CSSForgeConfig["typography"]["fluid"]>[string]["settings"]
>;

/** One `m` step whose sizes are the given font sizes, so each step size is exact. */
const singleStep = (minFontSize: number, maxFontSize: number) => ({
	minWidth: 320,
	maxWidth: 1280,
	minFontSize,
	maxFontSize,
	minTypeScale: 1,
	maxTypeScale: 1,
	positiveSteps: 0,
	negativeSteps: 0,
});

const typography = (
	value: ReturnType<typeof singleStep>,
	settings?: FluidSettings,
): Partial<CSSForgeConfig> => ({
	typography: { fluid: { body: { value, ...(settings ? { settings } : {}) } } },
});

const codes = (diagnostics: Diagnostic[]) => diagnostics.map(({ code }) => code);

test("fluid type - a step growing exactly 2.5x passes", () => {
	const config = typography(singleStep(16, 40));

	generateCSS(config);
	expect(getDiagnostics(config)).toEqual([]);
});

test("fluid type - a step growing more than 2.5x is rejected (WCAG 1.4.4)", () => {
	const error = thrownError(() => generateCSS(typography(singleStep(16, 40.01))));

	for (const part of [
		'"typography_fluid.body"',
		'"m"',
		"16px",
		"40.01px",
		"2.501",
		"2.5",
		"maxFontSize",
		"positiveSteps",
	]) {
		expect(
			error.message.includes(part),
			`Expected "${part}" in: ${error.message}`,
		).toBeTruthy();
	}
});

test("fluid type - the 2.5x error names the step that exceeds it", () => {
	const error = thrownError(() =>
		generateCSS({
			typography: {
				fluid: {
					body: {
						value: {
							...singleStep(16, 20),
							minTypeScale: 1.2,
							maxTypeScale: 1.6,
							positiveSteps: 3,
						},
					},
				},
			},
		}),
	);

	// Step 3 ("2xl") grows from 16 * 1.2^3 = 27.648px to 20 * 1.6^3 = 81.92px, 2.963x; step 2 grows 2.22x.
	expect(
		error.message.includes('"2xl"') && error.message.includes("27.65px"),
		error.message,
	).toBeTruthy();
});

test("fluid type - a scale growing exactly 10% is fluid", () => {
	expect(getDiagnostics(typography(singleStep(20, 22)))).toEqual([]);
});

test("fluid type - a scale growing less than 10% at every step warns once", () => {
	const [diagnostic, ...rest] = getDiagnostics(typography(singleStep(20, 21.9)));
	expect(rest).toEqual([]);
	expect(diagnostic?.code).toEqual("typography-static-scale");
	expect(diagnostic?.severity).toEqual("warning");
	expect(diagnostic?.path).toEqual("typography_fluid.body");
	expect(diagnostic?.message.includes("9.5%"), diagnostic?.message).toBeTruthy();

	const staticSteps = getDiagnostics({
		typography: {
			fluid: {
				body: {
					value: {
						...singleStep(16, 17),
						minTypeScale: 1.2,
						maxTypeScale: 1.2,
						positiveSteps: 2,
					},
				},
			},
		},
	});
	expect(codes(staticSteps)).toEqual(["typography-static-scale"]);
});

test("fluid type - one static step in a fluid scale does not warn", () => {
	// Step m stays at 16px while l and xl grow 11% and 23%.
	const diagnostics = getDiagnostics({
		typography: {
			fluid: {
				body: {
					value: {
						...singleStep(16, 16),
						minTypeScale: 1.2,
						maxTypeScale: 1.333,
						positiveSteps: 2,
					},
				},
			},
		},
	});

	expect(diagnostics).toEqual([]);
});

test("fluid type - a minimum of exactly 12px is legible", () => {
	expect(getDiagnostics(typography(singleStep(12, 16)))).toEqual([]);
});

test("fluid type - a minimum below 12px warns on the step", () => {
	const [diagnostic, ...rest] = getDiagnostics(typography(singleStep(11.99, 16)));

	expect(rest).toEqual([]);
	expect(diagnostic?.code).toEqual("typography-below-legibility-floor");
	expect(diagnostic?.severity).toEqual("warning");
	expect(diagnostic?.path).toEqual("typography_fluid.body@m");
	expect(
		diagnostic?.message.includes("11.99px") &&
			diagnostic.message.includes("12px") &&
			diagnostic.message.includes("minLegibleSize"),
		diagnostic?.message,
	).toBeTruthy();
});

test("fluid type - a shrinking negative step is checked at its smaller end", () => {
	// The scale shrinks from 20px to 16px, so step xs is 20 / 1.2^2 = 13.89px at
	// 320px and 16 / 1.2^2 = 11.11px at 1280px.
	const diagnostics = getDiagnostics({
		typography: {
			fluid: {
				body: {
					value: {
						...singleStep(20, 16),
						minTypeScale: 1.2,
						maxTypeScale: 1.2,
						negativeSteps: 2,
					},
				},
			},
		},
	});

	expect(diagnostics.map(({ code, path }) => ({ code, path }))).toEqual([
		{ code: "typography-below-legibility-floor", path: "typography_fluid.body@xs" },
	]);
	expect(
		diagnostics[0]?.message.includes("11.11px"),
		diagnostics[0]?.message,
	).toBeTruthy();
});

test("fluid type - settings.minLegibleSize moves or disables the floor", () => {
	expect(
		codes(getDiagnostics(typography(singleStep(13, 16), { minLegibleSize: 14 }))),
	).toEqual(["typography-below-legibility-floor"]);
	expect(
		getDiagnostics(typography(singleStep(8, 16), { minLegibleSize: false })),
	).toEqual([]);
});

test("fluid type - rejects a minLegibleSize that is not a positive number or false", () => {
	for (const minLegibleSize of ["12px", true, 0, -1, Number.NaN]) {
		const config = typography(singleStep(16, 20), {
			minLegibleSize,
		} as unknown as FluidSettings);
		const error = thrownError(() => generateCSS(config));

		expect(
			error.message.includes('"typography_fluid.body.settings.minLegibleSize"'),
			error.message,
		).toBeTruthy();
	}
});

test("fluid type - diagnostics leave the generated CSS unchanged", () => {
	const config = typography(singleStep(8, 16));
	const css = generateCSS(config);

	expect(codes(getDiagnostics(config))).toEqual(["typography-below-legibility-floor"]);
	expect(css).toEqual(
		generateCSS(typography(singleStep(8, 16), { minLegibleSize: false })),
	);
});

test("fluid type - rejects a step whose size is 0px", () => {
	const error = thrownError(() => generateCSS(typography(singleStep(0, 16))));
	expect(error.message.includes("greater than 0px"), error.message).toBeTruthy();
});
