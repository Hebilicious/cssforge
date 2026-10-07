import type { CSSForgeConfig, Diagnostic } from "../src/mod.ts";
import { generateCSS, getDiagnostics } from "../src/mod.ts";
import { assert, assertEquals, assertThrows, Deno } from "./vitest-compat.ts";

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

Deno.test("fluid type - a step growing exactly 2.5x passes", () => {
	const config = typography(singleStep(16, 40));

	generateCSS(config);
	assertEquals(getDiagnostics(config), []);
});

Deno.test("fluid type - a step growing more than 2.5x is rejected (WCAG 1.4.4)", () => {
	const error = assertThrows(() => generateCSS(typography(singleStep(16, 40.01))));

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
		assert(error.message.includes(part), `Expected "${part}" in: ${error.message}`);
	}
});

Deno.test("fluid type - the 2.5x error names the step that exceeds it", () => {
	const error = assertThrows(() =>
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
	assert(
		error.message.includes('"2xl"') && error.message.includes("27.65px"),
		error.message,
	);
});

Deno.test("fluid type - a scale growing exactly 10% is fluid", () => {
	assertEquals(getDiagnostics(typography(singleStep(20, 22))), []);
});

Deno.test("fluid type - a scale growing less than 10% at every step warns once", () => {
	const [diagnostic, ...rest] = getDiagnostics(typography(singleStep(20, 21.9)));
	assertEquals(rest, []);
	assertEquals(diagnostic?.code, "typography-static-scale");
	assertEquals(diagnostic?.severity, "warning");
	assertEquals(diagnostic?.path, "typography_fluid.body");
	assert(diagnostic?.message.includes("9.5%"), diagnostic?.message);

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
	assertEquals(codes(staticSteps), ["typography-static-scale"]);
});

Deno.test("fluid type - one static step in a fluid scale does not warn", () => {
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

	assertEquals(diagnostics, []);
});

Deno.test("fluid type - a minimum of exactly 12px is legible", () => {
	assertEquals(getDiagnostics(typography(singleStep(12, 16))), []);
});

Deno.test("fluid type - a minimum below 12px warns on the step", () => {
	const [diagnostic, ...rest] = getDiagnostics(typography(singleStep(11.99, 16)));

	assertEquals(rest, []);
	assertEquals(diagnostic?.code, "typography-below-legibility-floor");
	assertEquals(diagnostic?.severity, "warning");
	assertEquals(diagnostic?.path, "typography_fluid.body@m");
	assert(
		diagnostic?.message.includes("11.99px") &&
			diagnostic.message.includes("12px") &&
			diagnostic.message.includes("minLegibleSize"),
		diagnostic?.message,
	);
});

Deno.test("fluid type - a shrinking negative step is checked at its smaller end", () => {
	// Step xs is 16 / 1.2^2 = 11.11px at 320px and 20 / 1.5^2 = 8.89px at 1280px.
	const diagnostics = getDiagnostics({
		typography: {
			fluid: {
				body: {
					value: {
						...singleStep(16, 20),
						minTypeScale: 1.2,
						maxTypeScale: 1.5,
						negativeSteps: 2,
					},
				},
			},
		},
	});

	assertEquals(
		diagnostics.map(({ code, path }) => ({ code, path })),
		[{ code: "typography-below-legibility-floor", path: "typography_fluid.body@xs" }],
	);
	assert(diagnostics[0]?.message.includes("8.89px"), diagnostics[0]?.message);
});

Deno.test("fluid type - settings.minLegibleSize moves or disables the floor", () => {
	assertEquals(
		codes(getDiagnostics(typography(singleStep(13, 16), { minLegibleSize: 14 }))),
		["typography-below-legibility-floor"],
	);
	assertEquals(
		getDiagnostics(typography(singleStep(8, 16), { minLegibleSize: false })),
		[],
	);
});

Deno.test("fluid type - rejects a minLegibleSize that is not a positive number or false", () => {
	for (const minLegibleSize of ["12px", true, 0, -1, Number.NaN]) {
		const config = typography(singleStep(16, 20), {
			minLegibleSize,
		} as unknown as FluidSettings);
		const error = assertThrows(() => generateCSS(config));

		assert(
			error.message.includes('"typography_fluid.body.settings.minLegibleSize"'),
			error.message,
		);
	}
});

Deno.test("fluid type - diagnostics leave the generated CSS unchanged", () => {
	const config = typography(singleStep(8, 16));
	const css = generateCSS(config);

	assertEquals(codes(getDiagnostics(config)), ["typography-below-legibility-floor"]);
	assertEquals(
		css,
		generateCSS(typography(singleStep(8, 16), { minLegibleSize: false })),
	);
});

Deno.test("fluid type - rejects a step whose size is 0px", () => {
	const error = assertThrows(() => generateCSS(typography(singleStep(0, 16))));
	assert(error.message.includes("greater than 0px"), error.message);
});
