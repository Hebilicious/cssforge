import { calculateTypeScale } from "utopia-core";
import { generateJSON, generateTS } from "../src/generator.ts";
import type { CSSForgeConfig } from "../src/mod.ts";
import {
	defineConfig,
	generateCSS,
	generateStyleDictionaryJSON,
	getDiagnostics,
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
	settings?: FluidSettings,
): Partial<CSSForgeConfig> => ({
	typography: { fluid: { body: { value, ...(settings ? { settings } : {}) } } },
});

const v = (name: string) => `var(--typography_fluid-body-pow-${name})`;

/** Every custom property declared in a CSS string, by name. */
const declarations = (css: string) =>
	new Map(
		getLines(css)
			.map((line) => /^(--[\w-]+): (.*);$/.exec(line))
			.filter((match): match is RegExpExecArray => match !== null)
			.map(([, name, value]) => [name ?? "", value ?? ""]),
	);

/** The steps of the example scale in emitted order, with their labels. */
const steps = [4, 3, 2, 1, 0, -1, -2] as const;
const labels = { 4: "3xl", 3: "2xl", 2: "xl", 1: "l", 0: "m", [-1]: "s", [-2]: "xs" };

Deno.test("fluid type - every scale is written as clamp() steps and as pow tokens", () => {
	const utopia = calculateTypeScale({ ...example, labelStyle: "tshirt" });

	assertEquals(getLines(generateCSS(scale(example))).slice(3, -1), [
		...utopia
			.slice(0, 5)
			.map(({ label, clamp }) => `--typography_fluid-body-${label}: ${clamp};`),
		// Below step 0 the clamp() runs from 18 / 1.2^n px to 20 / 1.2^n px.
		"--typography_fluid-body-s: clamp(0.9375rem, 0.9013rem + 0.1812vw, 1.0417rem);",
		"--typography_fluid-body-xs: clamp(0.7813rem, 0.7511rem + 0.151vw, 0.8681rem);",
		"--typography_fluid-body-pow-narrow: 20;",
		"--typography_fluid-body-pow-wide: 77.5;",
		"--typography_fluid-body-pow-size-narrow: 1.125;",
		"--typography_fluid-body-pow-size-wide: 1.25;",
		"--typography_fluid-body-pow-ratio-narrow: 1.2;",
		"--typography_fluid-body-pow-ratio-wide: 1.25;",
		`--typography_fluid-body-pow-fluid: clamp(0rem, (100vw - ${v("narrow")} * 1rem) / (${v("wide")} - ${v("narrow")}), 1rem);`,
		`--typography_fluid-body-pow-at-narrow: calc(${v("size-narrow")} * (1rem - ${v("fluid")}));`,
		`--typography_fluid-body-pow-at-wide: calc(${v("size-wide")} * ${v("fluid")});`,
		`--typography_fluid-body-pow-3xl: calc(${v("at-narrow")} * pow(${v("ratio-narrow")}, 4) + ${v("at-wide")} * pow(${v("ratio-wide")}, 4));`,
		`--typography_fluid-body-pow-2xl: calc(${v("at-narrow")} * pow(${v("ratio-narrow")}, 3) + ${v("at-wide")} * pow(${v("ratio-wide")}, 3));`,
		`--typography_fluid-body-pow-xl: calc(${v("at-narrow")} * pow(${v("ratio-narrow")}, 2) + ${v("at-wide")} * pow(${v("ratio-wide")}, 2));`,
		`--typography_fluid-body-pow-l: calc(${v("at-narrow")} * ${v("ratio-narrow")} + ${v("at-wide")} * ${v("ratio-wide")});`,
		`--typography_fluid-body-pow-m: calc(${v("at-narrow")} + ${v("at-wide")});`,
		`--typography_fluid-body-pow-s: calc(${v("m")} / ${v("ratio-narrow")});`,
		`--typography_fluid-body-pow-xs: calc(${v("m")} / pow(${v("ratio-narrow")}, 2));`,
	]);
});

Deno.test("fluid type - clamp() steps 0 and above are utopia's, byte for byte", () => {
	for (const value of [
		example,
		{ ...example, relativeTo: "container" as const },
		{ ...example, relativeTo: "viewport" as const },
		{
			...example,
			minFontSize: 14,
			maxFontSize: 16,
			minTypeScale: 1.25,
			maxTypeScale: 1.25,
		},
		{ ...example, minWidth: 375, maxWidth: 1435, minFontSize: 17, maxFontSize: 19.5 },
	]) {
		const css = declarations(generateCSS(scale(value)));
		for (const { step, label, clamp } of calculateTypeScale({
			...value,
			labelStyle: "tshirt",
		})) {
			if (step >= 0) assertEquals(css.get(`--typography_fluid-body-${label}`), clamp);
		}
	}
});

/**
 * Evaluates a custom property of `css` in px at a viewport `width` in px, after
 * substituting every `var()`. The CSS functions map onto Math, and a length
 * becomes px with 1rem = 16px and 100vw = `width`.
 */
const evaluate = (css: Map<string, string>, name: string, width: number): number => {
	const substitute = (value: string): string =>
		value.replace(/var\((--[\w-]+)\)/g, (_, inner: string) => {
			const declared = css.get(inner);
			assert(declared !== undefined, `Undeclared ${inner}`);
			return `(${substitute(declared ?? "")})`;
		});
	const expression = substitute(css.get(name) ?? "")
		.replace(/(-?[\d.]+)rem/g, "($1 * 16)")
		.replace(/(-?[\d.]+)(?:vw|vi|cqi)/g, `($1 * ${width} / 100)`)
		.replaceAll("calc(", "(")
		.replaceAll("clamp(", "clampPx(")
		.replaceAll("pow(", "Math.pow(");
	assert(/^[\d\s.+\-*/(),a-zA-Z]+$/.test(expression), expression);
	const clampPx = (min: number, preferred: number, max: number) =>
		Math.min(max, Math.max(min, preferred));
	return new Function("clampPx", `return ${expression};`)(clampPx) as number;
};

Deno.test("fluid type - both representations give every step its size at both widths", () => {
	const value = { ...example, minFontSize: 16, maxFontSize: 21, maxTypeScale: 1.333 };
	const css = declarations(generateCSS(scale(value)));

	for (const step of steps) {
		// Step 0 and above follow utopia. Below it, step 0 is divided by the
		// narrow ratio at both widths, so a small size never shrinks.
		const narrow =
			step >= 0
				? value.minFontSize * value.minTypeScale ** step
				: value.minFontSize / value.minTypeScale ** -step;
		const wide =
			step >= 0
				? value.maxFontSize * value.maxTypeScale ** step
				: value.maxFontSize / value.minTypeScale ** -step;
		const label = labels[step];
		for (const [width, expected] of [
			[value.minWidth, narrow],
			[value.maxWidth, wide],
			// Outside the range each step stays at its end.
			[100, narrow],
			[4000, wide],
		] as const) {
			const pow = evaluate(css, `--typography_fluid-body-pow-${label}`, width);
			const clamp = evaluate(css, `--typography_fluid-body-${label}`, width);
			assert(Math.abs(pow - expected) < 1e-9, `pow ${label} at ${width}px: ${pow}`);
			assert(Math.abs(clamp - expected) < 0.02, `clamp ${label} at ${width}px: ${clamp}`);
		}
	}
});

Deno.test("fluid type - JSON, TypeScript and Style Dictionary hold both representations as the CSS writes them", () => {
	const config = scale(example);
	const css = declarations(generateCSS(config));
	type Token = { key: string; value: string; variable: string };
	const json = JSON.parse(generateJSON(config)) as {
		typography_fluid: Record<string, Token> & {
			body: { pow: Record<string, Token> } & Record<string, Token>;
		};
	};
	const { body, ...clampSteps } = json.typography_fluid;
	const { pow, ...powSteps } = body;
	const jsonTokens = [
		...Object.values(clampSteps),
		...Object.values(pow),
		...Object.values(powSteps),
	];

	assertEquals(
		jsonTokens.map(({ key, value }) => [key, value]),
		[...css.entries()],
	);
	assertEquals(
		Object.keys(clampSteps),
		steps.map((step) => `body@${labels[step]}`),
	);
	assertEquals(
		Object.keys(powSteps),
		steps.map((step) => `pow@${labels[step]}`),
	);
	assertEquals(
		generateTS(config),
		`export const cssForge = ${generateJSON(config)} as const;`,
	);

	type SdToken = {
		value: string;
		attributes: { cssVariable: string; referencePaths?: string[] };
		$tier: string;
		$reference?: string;
	};
	const styleDictionary = JSON.parse(
		generateStyleDictionaryJSON(config, { valueMode: "css-reference" }),
	) as {
		"typography-fluid": {
			body: Record<string, SdToken> & { pow: Record<string, SdToken> };
		};
	};
	const { pow: sdPow, ...sdClamp } = styleDictionary["typography-fluid"].body;
	const sdTokens = [...Object.values(sdClamp), ...Object.values(sdPow)];
	assertEquals(
		sdTokens.map(({ attributes }) => attributes.cssVariable).sort(),
		[...css.keys()].sort(),
	);

	// Plain values are primitives; a value made of other tokens is semantic and
	// names them, as a color mix does.
	assertEquals(sdPow.narrow?.$tier, "primitive");
	assertEquals(sdClamp.m?.$tier, "primitive");
	assertEquals(sdPow.fluid?.attributes.referencePaths, [
		"typography-fluid.body.pow.narrow",
		"typography-fluid.body.pow.wide",
	]);
	assertEquals(sdPow.s?.$tier, "semantic");
	assertEquals(sdPow.s?.attributes.referencePaths, [
		"typography-fluid.body.pow.m",
		"typography-fluid.body.pow.ratio-narrow",
	]);
	assertEquals(sdPow.s?.$reference, "typography-fluid.body.pow.m");
});

Deno.test("fluid type - a primitive references pow tokens like any other token", () => {
	const value = { ...example, positiveSteps: 1, negativeSteps: 1, prefix: "text" };
	const customLabel = { "-1": "small", "0": "base", "1": "large" };
	const config = defineConfig({
		typography: { fluid: { body: { value, settings: { customLabel } } } },
		primitives: {
			heading: {
				value: {
					h1: {
						value: {
							fontSize: "var(--size)",
							lineHeight: "calc(var(--ratio) * 1.1)",
							padding: "var(--clamp)",
						},
						variables: {
							size: "typography_fluid.body.pow@large",
							ratio: "typography_fluid.body.pow.ratio-wide",
							clamp: "typography_fluid.body@small",
						},
					},
				},
			},
		},
	});
	const css = declarations(generateCSS(config));

	assertEquals(
		css.get("--heading-h1-fontSize"),
		"var(--typography_fluid-body-text-pow-large)",
	);
	assertEquals(
		css.get("--heading-h1-lineHeight"),
		"calc(var(--typography_fluid-body-text-pow-ratio-wide) * 1.1)",
	);
	assertEquals(
		css.get("--heading-h1-padding"),
		"var(--typography_fluid-body-text-small)",
	);
	assertEquals(
		css.get("--typography_fluid-body-text-pow-small"),
		"calc(var(--typography_fluid-body-text-pow-base) / var(--typography_fluid-body-text-pow-ratio-narrow))",
	);
	const json = JSON.parse(generateJSON(config)) as {
		primitives: { heading: { h1: { fontSize: { value: string } } } };
	};
	assertEquals(
		json.primitives.heading.h1.fontSize.value,
		"var(--typography_fluid-body-text-pow-large)",
	);
});

Deno.test("fluid type - a step label that takes a pow name fails as a collision", () => {
	const collision = (customLabel: Record<string, string>) =>
		assertThrows(() => generateJSON(scale(example, { customLabel }))).message;

	assertEquals(
		collision({ "0": "narrow" }),
		'Token key collision: "typography_fluid.body.pow.narrow" and "typography_fluid.body.pow@narrow" both generate "--typography_fluid-body-pow-narrow". Rename one of the configuration paths.',
	);
	assertEquals(
		collision({ "1": "pow-narrow" }),
		'Token key collision: "typography_fluid.body@pow-narrow" and "typography_fluid.body.pow.narrow" both generate "--typography_fluid-body-pow-narrow". Rename one of the configuration paths.',
	);
	assertEquals(
		collision({ "0": "pow-l", "1": "l" }),
		'Token key collision: "typography_fluid.body@pow-l" and "typography_fluid.body.pow@l" both generate "--typography_fluid-body-pow-l". Rename one of the configuration paths.',
	);
	assertThrows(() => generateCSS(scale(example, { customLabel: { "0": "narrow" } })));

	// `pow` is the segment that holds the pow tokens, so no step takes it.
	const segment = assertThrows(() =>
		generateCSS(scale(example, { customLabel: { "0": "pow" } })),
	);
	assert(
		segment.message.includes('"typography_fluid.body.settings.customLabel.0"'),
		segment.message,
	);
	assert(segment.message.includes('"pow"'), segment.message);
});

Deno.test("fluid type - relativeTo picks the unit of both representations", () => {
	for (const [relativeTo, unit] of [
		[undefined, "vw"],
		["viewport-width", "vw"],
		["viewport", "vi"],
		["container", "cqi"],
	] as const) {
		const css = declarations(generateCSS(scale({ ...example, relativeTo })));
		assert(
			css
				.get("--typography_fluid-body-pow-fluid")
				?.startsWith(`clamp(0rem, (100${unit} - `),
			css.get("--typography_fluid-body-pow-fluid"),
		);
		for (const label of ["xl", "xs"]) {
			const clamp = css.get(`--typography_fluid-body-${label}`);
			assert(clamp?.includes(`${unit}, `), clamp);
		}
	}

	const invalid = assertThrows(() =>
		generateJSON(
			scale({ ...example, relativeTo: "page" } as unknown as FluidScale["value"]),
		),
	);
	assert(invalid.message.includes('"typography_fluid.body.relativeTo"'), invalid.message);
});

Deno.test("fluid type - two scales never share a pow name", () => {
	const css = declarations(
		generateCSS({
			typography: {
				fluid: {
					body: { value: example },
					display: { value: { ...example, prefix: "big" } },
				},
			},
		}),
	);

	assertEquals(css.get("--typography_fluid-body-pow-narrow"), "20");
	assertEquals(css.get("--typography_fluid-display-big-pow-narrow"), "20");
});

Deno.test("fluid type checks - each step is checked once, at its canonical sizes", () => {
	// Step xs is 17.28 / 1.2^2 = 12px at the narrow end. At the wide end it is
	// 20 / 1.2^2 = 13.89px, where utopia's own scale would give 20 / 1.6^2 = 7.81px.
	const value = {
		...example,
		minFontSize: 17.28,
		maxTypeScale: 1.6,
		positiveSteps: 0,
		negativeSteps: 2,
	};

	assertEquals(getDiagnostics(scale(value)), []);
	const floor = getDiagnostics(scale(value, { minLegibleSize: 13 }));
	assertEquals(
		floor.map(({ code, path }) => [code, path]),
		[["typography-below-legibility-floor", "typography_fluid.body@xs"]],
	);
	assert(floor[0]?.message.includes("12px"), floor[0]?.message);
});

Deno.test("fluid type checks - a static scale warns once and names no CSS function", () => {
	const flat = {
		...example,
		maxFontSize: 18.5,
		maxTypeScale: 1.2,
		positiveSteps: 1,
		negativeSteps: 0,
	};
	const diagnostics = getDiagnostics(scale(flat));
	assertEquals(
		diagnostics.map(({ code, path }) => [code, path]),
		[["typography-static-scale", "typography_fluid.body"]],
	);
	const message = diagnostics[0]?.message ?? "";
	assert(!message.includes("clamp()") && !message.includes("pow()"), message);
});
