import { calculateTypeScale } from "utopia-core";
import { generateJSON } from "../src/generator.ts";
import type { CSSForgeConfig } from "../src/mod.ts";
import {
	defineConfig,
	generateCSS,
	getDiagnostics,
	processTypography,
} from "../src/mod.ts";
import { getLines } from "./helpers.ts";
import { assert, assertEquals, assertThrows, Deno } from "./vitest-compat.ts";

type FluidScale = NonNullable<CSSForgeConfig["typography"]["fluid"]>[string];
type FluidSettings = NonNullable<FluidScale["settings"]>;

/** The good-css example scale: 20rem to 77.5rem, 18px to 20px, ratios 1.2 and 1.25. */
const example = {
	minWidth: 320,
	maxWidth: 1240,
	minFontSize: 18,
	maxFontSize: 20,
	minTypeScale: 1.2,
	maxTypeScale: 1.25,
	positiveSteps: 4,
	negativeSteps: 2,
} satisfies FluidScale["value"];

const scale = (
	value: FluidScale["value"],
	settings: FluidSettings = { output: "pow" },
): Partial<CSSForgeConfig> => ({ typography: { fluid: { body: { value, settings } } } });

const v = (name: string) => `var(--typography_fluid-body-${name})`;

Deno.test("pow scale - emits the six inputs, the helpers and the steps", () => {
	const lines = getLines(processTypography(scale(example).typography ?? {}).css.root);

	assertEquals(lines, [
		"--typography_fluid-body-narrow: 20;",
		"--typography_fluid-body-wide: 77.5;",
		"--typography_fluid-body-size-narrow: 1.125;",
		"--typography_fluid-body-size-wide: 1.25;",
		"--typography_fluid-body-ratio-narrow: 1.2;",
		"--typography_fluid-body-ratio-wide: 1.25;",
		`--typography_fluid-body-fluid: clamp(0rem, (100vw - ${v("narrow")} * 1rem) / (${v("wide")} - ${v("narrow")}), 1rem);`,
		`--typography_fluid-body-at-narrow: calc(${v("size-narrow")} * (1rem - ${v("fluid")}));`,
		`--typography_fluid-body-at-wide: calc(${v("size-wide")} * ${v("fluid")});`,
		`--typography_fluid-body-3xl: calc(${v("at-narrow")} * pow(${v("ratio-narrow")}, 4) + ${v("at-wide")} * pow(${v("ratio-wide")}, 4));`,
		`--typography_fluid-body-2xl: calc(${v("at-narrow")} * pow(${v("ratio-narrow")}, 3) + ${v("at-wide")} * pow(${v("ratio-wide")}, 3));`,
		`--typography_fluid-body-xl: calc(${v("at-narrow")} * pow(${v("ratio-narrow")}, 2) + ${v("at-wide")} * pow(${v("ratio-wide")}, 2));`,
		`--typography_fluid-body-l: calc(${v("at-narrow")} * ${v("ratio-narrow")} + ${v("at-wide")} * ${v("ratio-wide")});`,
		`--typography_fluid-body-m: calc(${v("at-narrow")} + ${v("at-wide")});`,
		`--typography_fluid-body-s: calc(${v("m")} / ${v("ratio-narrow")});`,
		`--typography_fluid-body-xs: calc(${v("m")} / pow(${v("ratio-narrow")}, 2));`,
	]);
});

/**
 * The emitted formula transcribed to JS: the size of `step` in px at a
 * viewport `width` in px, from the inputs derived independently of the module.
 */
const powSize = (step: number, width: number) => {
	const rem = 16;
	const narrow = example.minWidth / rem;
	const wide = example.maxWidth / rem;
	const fluid = Math.min(1, Math.max(0, (width / rem - narrow) / (wide - narrow)));
	const atNarrow = (example.minFontSize / rem) * (1 - fluid);
	const atWide = (example.maxFontSize / rem) * fluid;
	const stepZero = atNarrow + atWide;
	const size =
		step >= 0
			? atNarrow * example.minTypeScale ** step + atWide * example.maxTypeScale ** step
			: stepZero / example.minTypeScale ** -step;
	return size * rem;
};

Deno.test("pow scale - the formula matches utopia at the narrow and wide widths", () => {
	const utopia = calculateTypeScale(example);
	const stepZeroWide = utopia.find(({ step }) => step === 0)?.maxFontSize ?? Number.NaN;

	for (const { step, minFontSize, maxFontSize } of utopia) {
		const narrow = powSize(step, example.minWidth);
		const wide = powSize(step, example.maxWidth);
		assert(Math.abs(narrow - minFontSize) < 1e-3, `step ${step} narrow: ${narrow}`);
		// Below step 0 the wide end divides step 0 by the narrow ratio, as good-css does.
		const expectedWide =
			step >= 0 ? maxFontSize : stepZeroWide / example.minTypeScale ** -step;
		assert(Math.abs(wide - expectedWide) < 1e-3, `step ${step} wide: ${wide}`);
	}
	// Step xs at the wide end is 20 / 1.2^2 px, not utopia's 20 / 1.25^2 px.
	assert(Math.abs(powSize(-2, example.maxWidth) - 13.8889) < 1e-3);
	// Outside the range the scale stops at its ends.
	assertEquals(powSize(2, 100), powSize(2, example.minWidth));
	assertEquals(powSize(2, 4000), powSize(2, example.maxWidth));
});

Deno.test("pow scale - clamp stays the default and its output is unchanged", () => {
	const css = generateCSS(scale(example, {}));

	assertEquals(generateCSS(scale(example, { output: "clamp" })), css);
	assert(css.includes("--typography_fluid-body-m: clamp("), css);
	assert(!css.includes("pow(") && !css.includes("-narrow:"), css);
});

Deno.test("pow scale - steps keep their names and paths with a prefix and custom labels", () => {
	const value = { ...example, positiveSteps: 1, negativeSteps: 1, prefix: "text" };
	const customLabel = { "-1": "small", "0": "base", "1": "large" };
	const config = (output: "clamp" | "pow") =>
		defineConfig({
			typography: { fluid: { body: { value, settings: { output, customLabel } } } },
			primitives: {
				heading: {
					value: {
						h1: {
							value: { fontSize: "var(--size)" },
							variables: { size: "typography_fluid.body@large" },
						},
					},
				},
			},
		});

	for (const output of ["clamp", "pow"] as const) {
		const css = generateCSS(config(output));
		for (const label of ["small", "base", "large"]) {
			assert(
				css.includes(`--typography_fluid-body-text-${label}: `),
				`${output} ${label}`,
			);
		}
		assert(
			css.includes("--heading-h1-fontSize: var(--typography_fluid-body-text-large);"),
		);
	}

	const css = generateCSS(config("pow"));
	assert(css.includes("--typography_fluid-body-text-narrow: 20;"));
	assert(
		css.includes(
			"--typography_fluid-body-text-small: calc(var(--typography_fluid-body-text-base) / var(--typography_fluid-body-text-ratio-narrow));",
		),
	);
});

Deno.test("pow scale - the inputs and helpers are tokens in the JSON output", () => {
	type Token = { key: string; value: string; variable: string };
	const json = JSON.parse(generateJSON(scale(example))) as {
		typography_fluid: Record<string, Record<string, Token> | Token>;
	};
	const inputs = json.typography_fluid.body as Record<string, Token> | undefined;
	const stepZero = json.typography_fluid["body@m"] as Token | undefined;

	assertEquals(inputs?.narrow, {
		key: "--typography_fluid-body-narrow",
		value: "20",
		variable: "--typography_fluid-body-narrow: 20;",
	});
	assertEquals(Object.keys(inputs ?? {}), [
		"narrow",
		"wide",
		"size-narrow",
		"size-wide",
		"ratio-narrow",
		"ratio-wide",
		"fluid",
		"at-narrow",
		"at-wide",
	]);
	assertEquals(stepZero?.value, `calc(${v("at-narrow")} + ${v("at-wide")})`);
});

Deno.test("pow scale - the helpers can be referenced to build a pair", () => {
	const css = generateCSS({
		...scale(example),
		primitives: {
			space: {
				value: {
					pair: {
						value: { gap: "calc(var(--n) + 2 * var(--w))" },
						variables: {
							n: "typography_fluid.body.at-narrow",
							w: "typography_fluid.body.at-wide",
						},
					},
				},
			},
		},
	});

	assert(
		css.includes(
			"--space-pair-gap: calc(var(--typography_fluid-body-at-narrow) + 2 * var(--typography_fluid-body-at-wide));",
		),
	);
});

Deno.test("pow scale - relativeTo picks the unit of the fluid width", () => {
	const fluidLine = (relativeTo?: "viewport" | "viewport-width" | "container") =>
		getLines(
			processTypography(scale({ ...example, relativeTo }).typography ?? {}).css.root,
		).find((line) => line.startsWith("--typography_fluid-body-fluid:"));

	assert(fluidLine()?.includes("(100vw - "));
	assert(fluidLine("viewport-width")?.includes("(100vw - "));
	assert(fluidLine("viewport")?.includes("(100vi - "));
	assert(fluidLine("container")?.includes("(100cqi - "));
});

Deno.test("pow scale - two scales never share an input name", () => {
	const css = generateCSS({
		typography: {
			fluid: {
				body: { value: example, settings: { output: "pow" } },
				display: { value: { ...example, prefix: "big" }, settings: { output: "pow" } },
			},
		},
	});

	assert(css.includes("--typography_fluid-body-narrow: 20;"));
	assert(css.includes("--typography_fluid-display-big-narrow: 20;"));
});

Deno.test("pow scale - a step label that takes an input name is a key collision", () => {
	const error = assertThrows(() =>
		generateCSS(scale(example, { output: "pow", customLabel: { "1": "fluid" } })),
	);

	assertEquals(
		error.message,
		'Token key collision: "typography_fluid.body.fluid" and "typography_fluid.body@fluid" both generate "--typography_fluid-body-fluid". Rename one of the configuration paths.',
	);
	generateCSS(scale(example, { output: "clamp", customLabel: { "1": "fluid" } }));
});

Deno.test("pow scale - rejects an unknown output or relativeTo", () => {
	const output = assertThrows(() =>
		generateCSS(scale(example, { output: "calc" } as unknown as FluidSettings)),
	);
	assert(
		output.message.includes('"typography_fluid.body.settings.output"') &&
			output.message.includes('"clamp" or "pow"'),
		output.message,
	);

	const relativeTo = assertThrows(() =>
		generateCSS(
			scale({ ...example, relativeTo: "page" } as unknown as FluidScale["value"]),
		),
	);
	assert(
		relativeTo.message.includes('"typography_fluid.body.relativeTo"'),
		relativeTo.message,
	);
});

Deno.test("pow scale - checks negative steps at the sizes pow produces", () => {
	// Step xs is 17.28 / 1.2^2 = 12px at the narrow end in both modes. At the wide
	// end clamp gives 20 / 1.6^2 = 7.81px and pow gives 20 / 1.2^2 = 13.89px.
	const value = {
		...example,
		minFontSize: 17.28,
		minTypeScale: 1.2,
		maxTypeScale: 1.6,
		positiveSteps: 0,
		negativeSteps: 2,
	};

	const clamp = getDiagnostics(scale(value, { output: "clamp" }));
	assertEquals(
		clamp.map(({ code, path }) => ({ code, path })),
		[{ code: "typography-below-legibility-floor", path: "typography_fluid.body@xs" }],
	);
	assertEquals(getDiagnostics(scale(value)), []);

	const floor = getDiagnostics(scale(value, { output: "pow", minLegibleSize: 13 }));
	assertEquals(
		floor.map(({ path }) => path),
		["typography_fluid.body@xs"],
	);
	assert(floor[0]?.message.includes("12px"), floor[0]?.message);
});

Deno.test("pow scale - the 2.5x error and static warning apply as in clamp", () => {
	const growing = { ...example, maxFontSize: 45.01, positiveSteps: 0, negativeSteps: 0 };
	for (const output of ["clamp", "pow"] as const) {
		const error = assertThrows(() => generateCSS(scale(growing, { output })));
		assert(error.message.includes("2.5"), error.message);
	}

	const flat = {
		...example,
		maxFontSize: 18.5,
		maxTypeScale: 1.2,
		positiveSteps: 1,
		negativeSteps: 0,
	};
	const [diagnostic] = getDiagnostics(scale(flat));
	assertEquals(diagnostic?.code, "typography-static-scale");
	assert(diagnostic?.message.includes("pow()"), diagnostic?.message);
});
