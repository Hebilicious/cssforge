import { defineConfig, processTypography } from "../src/mod.ts";
import { getLines } from "./helpers.ts";
import { assertEquals, assertSnapshot, Deno } from "./vitest-compat.ts";

/** The paths of a fluid scale's tokens: its clamp() steps, then its pow tokens. */
const fluidPaths = (scale: string, labels: string[]) => [
	...labels.map((label) => `typography_fluid.${scale}@${label}`),
	...[
		"min-width",
		"max-width",
		"min-font-size",
		"max-font-size",
		"min-type-scale",
		"max-type-scale",
		"progress",
		"at-min",
		"at-max",
	].map((name) => `typography_fluid.${scale}.pow.${name}`),
	...labels.map((label) => `typography_fluid.${scale}.pow@${label}`),
];

Deno.test("processTypography - generates correct CSS variables", async (t) => {
	const config = defineConfig({
		typography: {
			fluid: {
				arial: {
					value: {
						minWidth: 320,
						minFontSize: 14,
						minTypeScale: 1.25,
						maxWidth: 1435,
						maxFontSize: 16,
						maxTypeScale: 1.25,
						positiveSteps: 5,
						negativeSteps: 3,
					},
				},
			},
		},
	});

	const expectedSizes = ["4xl", "3xl", "2xl", "xl", "l", "m", "s", "xs", "2xs"];
	const result = processTypography(config.typography);
	const lines = getLines(result.css.root);
	assertEquals(lines.length, 2 * expectedSizes.length + 9);

	// Test a specific value for precision
	const xlLine = lines.find((line) => line.includes("--typography_fluid-arial-xl:"));
	assertEquals(
		xlLine,
		"--typography_fluid-arial-xl: clamp(1.3672rem, 1.3111rem + 0.2803vw, 1.5625rem);",
	);

	assertEquals(Array.from(result.resolveMap.keys()), fluidPaths("arial", expectedSizes));

	// Test that we have all the expected size variables
	expectedSizes.forEach((size) => {
		const hasSize = lines.some((line) =>
			line.includes(`--typography_fluid-arial-${size}:`),
		);
		assertEquals(hasSize, true, `Missing size ${size}`);
	});
	await assertSnapshot(t, result.css);
	await assertSnapshot(t, Array.from(result.resolveMap.entries()));
});

Deno.test("typography - can handle custom labels and prefixes", async (t) => {
	const config = defineConfig({
		typography: {
			fluid: {
				arial: {
					value: {
						minWidth: 320,
						minFontSize: 14,
						minTypeScale: 1.25,
						maxWidth: 1435,
						maxFontSize: 16,
						maxTypeScale: 1.25,
						positiveSteps: 7,
						negativeSteps: 2,
						prefix: "text",
					},
					settings: {
						customLabel: {
							"-2": "xs",
							"-1": "s",
							"0": "m",
							"1": "l",
							"2": "xl",
							"3": "xxl",
							"4": "h4",
							"5": "h3",
							"6": "h2",
							"7": "h1",
						},
					},
				},
			},
		},
	});

	const expectedSizes = ["xs", "s", "m", "l", "xl", "xxl", "h4", "h3", "h2", "h1"];
	const result = processTypography(config.typography);
	const lines = getLines(result.css.root);
	assertEquals(lines.length, 2 * expectedSizes.length + 9);

	// Test a specific value for precision
	const xlLine = lines.find((line) => line.includes("--typography_fluid-arial-text-xl:"));
	assertEquals(
		xlLine,
		"--typography_fluid-arial-text-xl: clamp(1.3672rem, 1.3111rem + 0.2803vw, 1.5625rem);",
	);

	assertEquals(
		Array.from(result.resolveMap.keys()),
		fluidPaths("arial", expectedSizes.toReversed()),
	);

	// Test that we have all the expected size variables
	expectedSizes.forEach((size) => {
		const hasSize = lines.some((line) =>
			line.includes(`--typography_fluid-arial-text-${size}:`),
		);
		assertEquals(hasSize, true, `Missing size ${size}`);
	});
	await assertSnapshot(t, result.css);
	await assertSnapshot(t, Array.from(result.resolveMap.entries()));
});

Deno.test("processTypography - can process weights", async (t) => {
	const positiveSteps = 3;
	const negativeSteps = 3;
	const config = defineConfig({
		typography: {
			fluid: {
				arial: {
					value: {
						minWidth: 320,
						minFontSize: 14,
						minTypeScale: 1.25,
						maxWidth: 1435,
						maxFontSize: 16,
						maxTypeScale: 1.25,
						positiveSteps,
						negativeSteps,
					},
				},
			},
			weight: {
				arial: { value: { regular: "500" } },
			},
		},
	});

	const result = processTypography(config.typography);
	const lines = getLines(result.css.root);
	// Each step twice, the 9 pow inputs and helpers, and the weight.
	assertEquals(lines.length, 2 * (positiveSteps + negativeSteps + 1) + 9 + 1);

	assertEquals(Array.from(result.resolveMap.keys()), [
		...fluidPaths("arial", ["2xl", "xl", "l", "m", "s", "xs", "2xs"]),
		"typography.weight.arial.regular",
	]);
	// Test that we have the weight variable
	const xlLine = lines.find((line) =>
		line.includes("--typography-weight-arial-regular:"),
	);
	assertEquals(xlLine, "--typography-weight-arial-regular: 500;");
	await assertSnapshot(t, result.css);
	await assertSnapshot(t, Array.from(result.resolveMap.entries()));
});
