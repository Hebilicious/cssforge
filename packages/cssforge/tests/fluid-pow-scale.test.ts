import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { calculateTypeScale } from "utopia-core";
import { build } from "../src/cli.ts";
import { generateJSON, generateTS } from "../src/generator.ts";
import type { CSSForgeConfig, FluidTypeFunction } from "../src/mod.ts";
import {
	defineConfig,
	generateCSS,
	generateStyleDictionaryJSON,
	getDiagnostics,
	processTypography,
} from "../src/mod.ts";
import { childEnv, getLines } from "./helpers.ts";
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

const v = (name: string) => `var(--typography_fluid-body-${name})`;

/** The value of each `--typography_fluid-body-<label>` declaration in a CSS string. */
const declarations = (css: string) =>
	new Map(
		getLines(css)
			.map((line) => /^--typography_fluid-body-([\w-]+): (.*);$/.exec(line))
			.filter((match): match is RegExpExecArray => match !== null)
			.map(([, name, value]) => [name ?? "", value ?? ""]),
	);

/** The steps of the example scale in emitted order, with their labels. */
const steps = [4, 3, 2, 1, 0, -1, -2] as const;
const labels = { 4: "3xl", 3: "2xl", 2: "xl", 1: "l", 0: "m", [-1]: "s", [-2]: "xs" };
const orderedLabels = steps.map((step) => labels[step]);

/**
 * The size of `step` in px at `minWidth` and `maxWidth`, derived from the config
 * alone: utopia's sizes at and above step 0, and step 0 divided by the narrow
 * ratio below it, so a small size never shrinks as the screen grows.
 */
const expectedSizes = (step: number) =>
	step >= 0
		? {
				narrow: example.minFontSize * example.minTypeScale ** step,
				wide: example.maxFontSize * example.maxTypeScale ** step,
			}
		: {
				narrow: example.minFontSize / example.minTypeScale ** -step,
				wide: example.maxFontSize / example.minTypeScale ** -step,
			};

/** The emitted pow formula transcribed to JS: the size of `step` in px at `width` px. */
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

/** Evaluates an emitted `clamp(<min>rem, <a>rem + <b>vw, <max>rem)` in px at `width` px. */
const clampSize = (clamp: string, width: number) => {
	const match =
		/^clamp\((-?[\d.]+)rem, (-?[\d.]+)rem \+ (-?[\d.]+)vw, (-?[\d.]+)rem\)$/.exec(clamp);
	assert(match, `Unexpected clamp: ${clamp}`);
	const [min, intercept, slope, max] = (match ?? []).slice(1).map(Number);
	const preferred = (intercept ?? 0) + ((slope ?? 0) * width) / 100 / 16;
	return Math.min(max ?? 0, Math.max(min ?? 0, preferred)) * 16;
};

const near = (actual: number, expected: number, what: string) =>
	assert(
		Math.abs(actual - expected) < 0.01,
		`${what}: ${actual}px, expected ${expected}px`,
	);

Deno.test("fluid type CSS - pow is the default: six inputs, three helpers and pow() steps", () => {
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
	assertEquals(
		generateCSS(scale(example)),
		generateCSS(scale(example), { fluidTypeFunction: "pow" }),
	);
});

Deno.test("fluid type CSS - the clamp option writes one clamp() per step and keeps utopia's positive steps", () => {
	const css = declarations(generateCSS(scale(example), { fluidTypeFunction: "clamp" }));

	assertEquals([...css.keys()], orderedLabels);
	assert(![...css.values()].some((value) => value.includes("pow(")));
	for (const { step, label, clamp } of calculateTypeScale({
		...example,
		labelStyle: "tshirt",
	})) {
		if (step >= 0) assertEquals(css.get(label), clamp, `step ${label}`);
	}
});

Deno.test("fluid type CSS - both functions give the canonical size of every step at both widths", () => {
	const clamp = declarations(generateCSS(scale(example), { fluidTypeFunction: "clamp" }));

	for (const step of steps) {
		const label = labels[step];
		const { narrow, wide } = expectedSizes(step);
		near(powSize(step, example.minWidth), narrow, `pow ${label} narrow`);
		near(powSize(step, example.maxWidth), wide, `pow ${label} wide`);
		near(
			clampSize(clamp.get(label) ?? "", example.minWidth),
			narrow,
			`clamp ${label} narrow`,
		);
		near(
			clampSize(clamp.get(label) ?? "", example.maxWidth),
			wide,
			`clamp ${label} wide`,
		);
	}
	// Step xs at the wide end is 20 / 1.2^2 px, not utopia's 20 / 1.25^2 px.
	near(clampSize(clamp.get("xs") ?? "", example.maxWidth), 13.8889, "clamp xs wide");
	// Outside the range the scale stops at its ends.
	assertEquals(powSize(2, 100), powSize(2, example.minWidth));
	assertEquals(powSize(2, 4000), powSize(2, example.maxWidth));
});

const buildPaths = (dir: string) => ({
	config: join(dir, "cssforge.config.ts"),
	cssOutput: join(dir, "output.css"),
	jsonOutput: join(dir, "output.json"),
	tsOutput: join(dir, "output.ts"),
	styleDictionaryOutput: join(dir, "tokens.sd.json"),
});

/** The inputs and helpers pow() CSS declares beside the steps. */
const powInputs = [
	"narrow",
	"wide",
	"size-narrow",
	"size-wide",
	"ratio-narrow",
	"ratio-wide",
	"fluid",
	"at-narrow",
	"at-wide",
];

const exampleSource = `export default ${JSON.stringify(scale(example))};`;

Deno.test("fluid type CSS - JSON, TypeScript and Style Dictionary are the same for both functions and hold no pow tokens", async () => {
	const dir = await mkdtemp(join(tmpdir(), "cssforge-fluid-type-function-"));
	try {
		const outputs = async (fluidTypeFunction: FluidTypeFunction) => {
			const paths = buildPaths(join(dir, fluidTypeFunction));
			await mkdir(join(dir, fluidTypeFunction));
			await writeFile(paths.config, exampleSource, "utf8");
			const result = await build({ ...paths, mode: "all", fluidTypeFunction });
			assertEquals(result.success, true, String(result.error));
			return {
				css: await readFile(paths.cssOutput, "utf8"),
				tokens: await Promise.all(
					[paths.jsonOutput, paths.tsOutput, paths.styleDictionaryOutput].map((path) =>
						readFile(path, "utf8"),
					),
				),
			};
		};

		const pow = await outputs("pow");
		const clamp = await outputs("clamp");

		assert(pow.css.includes("pow("), pow.css);
		assert(!clamp.css.includes("pow("), clamp.css);
		assertEquals(pow.tokens, clamp.tokens);
		for (const tokens of pow.tokens) {
			assert(!tokens.includes("pow("), tokens);
			for (const name of powInputs) {
				for (const text of [`-body-${name}"`, `.${name}"`, `"${name}":`]) {
					assert(!tokens.includes(text), `${text} in ${tokens}`);
				}
			}
		}
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

Deno.test("fluid type CSS - a step token holds the clamp() the clamp option writes", () => {
	const clamp = declarations(generateCSS(scale(example), { fluidTypeFunction: "clamp" }));
	type Token = { key: string; value: string; variable: string };
	const json = JSON.parse(generateJSON(scale(example))) as {
		typography_fluid: Record<string, Token>;
	};
	const styleDictionary = JSON.parse(generateStyleDictionaryJSON(scale(example))) as {
		"typography-fluid": { body: Record<string, { value: string }> };
	};

	assertEquals(
		Object.keys(json.typography_fluid),
		orderedLabels.map((label) => `body@${label}`),
	);
	for (const label of orderedLabels) {
		assertEquals(json.typography_fluid[`body@${label}`]?.value, clamp.get(label));
		assertEquals(
			styleDictionary["typography-fluid"].body[label]?.value,
			clamp.get(label),
		);
	}
	assert(generateTS(scale(example)).includes(`"value": "${clamp.get("xs")}"`));
});

Deno.test("fluid type CSS - a reference to a step is var() for both functions", () => {
	const value = { ...example, positiveSteps: 1, negativeSteps: 1, prefix: "text" };
	const customLabel = { "-1": "small", "0": "base", "1": "large" };
	const config = defineConfig({
		typography: { fluid: { body: { value, settings: { customLabel } } } },
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

	for (const fluidTypeFunction of ["clamp", "pow"] as const) {
		const css = generateCSS(config, { fluidTypeFunction });
		for (const label of ["small", "base", "large"]) {
			assert(css.includes(`--typography_fluid-body-text-${label}: `), label);
		}
		assert(
			css.includes("--heading-h1-fontSize: var(--typography_fluid-body-text-large);"),
		);
	}
	assert(
		generateCSS(config).includes(
			"--typography_fluid-body-text-small: calc(var(--typography_fluid-body-text-base) / var(--typography_fluid-body-text-ratio-narrow));",
		),
	);
});

Deno.test("fluid type CSS - relativeTo picks the unit for both functions", () => {
	for (const [relativeTo, unit] of [
		[undefined, "vw"],
		["viewport-width", "vw"],
		["viewport", "vi"],
		["container", "cqi"],
	] as const) {
		const config = scale({ ...example, relativeTo });
		const pow = declarations(generateCSS(config));
		const clamp = declarations(generateCSS(config, { fluidTypeFunction: "clamp" }));
		assert(pow.get("fluid")?.includes(`(100${unit} - `), pow.get("fluid"));
		for (const label of ["xl", "xs"]) {
			assert(clamp.get(label)?.includes(`${unit},`), clamp.get(label));
		}
	}
});

Deno.test("fluid type CSS - two scales never share an input name", () => {
	const css = generateCSS({
		typography: {
			fluid: {
				body: { value: example },
				display: { value: { ...example, prefix: "big" } },
			},
		},
	});

	assert(css.includes("--typography_fluid-body-narrow: 20;"));
	assert(css.includes("--typography_fluid-display-big-narrow: 20;"));
});

Deno.test("fluid type CSS - a step label that takes a pow input name is a key collision", () => {
	const config = scale(example, { customLabel: { "0": "fluid" } });
	const error = assertThrows(() => generateCSS(config));

	assertEquals(
		error.message,
		'Token key collision: "typography_fluid.body@fluid" and "typography_fluid.body.fluid" both generate "--typography_fluid-body-fluid". Rename one of the configuration paths.',
	);
	generateCSS(config, { fluidTypeFunction: "clamp" });
});

Deno.test("fluid type CSS - rejects an unknown function, relativeTo or settings.output", () => {
	const option = assertThrows(() =>
		generateCSS(scale(example), {
			fluidTypeFunction: "calc" as unknown as FluidTypeFunction,
		}),
	);
	assert(
		option.message.includes("fluidTypeFunction") &&
			option.message.includes('"pow" or "clamp"'),
		option.message,
	);

	const relativeTo = assertThrows(() =>
		generateJSON(
			scale({ ...example, relativeTo: "page" } as unknown as FluidScale["value"]),
		),
	);
	assert(
		relativeTo.message.includes('"typography_fluid.body.relativeTo"'),
		relativeTo.message,
	);

	const output = assertThrows(() =>
		generateCSS(scale(example, { output: "pow" } as unknown as FluidSettings)),
	);
	assert(output.message.includes("output"), output.message);
});

Deno.test("fluid type checks - negative steps are checked at their canonical sizes", () => {
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
		floor.map(({ path }) => path),
		["typography_fluid.body@xs"],
	);
	assert(floor[0]?.message.includes("12px"), floor[0]?.message);
});

Deno.test("fluid type checks - the static warning does not name a CSS function", () => {
	const flat = {
		...example,
		maxFontSize: 18.5,
		maxTypeScale: 1.2,
		positiveSteps: 1,
		negativeSteps: 0,
	};
	const [diagnostic] = getDiagnostics(scale(flat));
	assertEquals(diagnostic?.code, "typography-static-scale");
	assert(
		!diagnostic?.message.includes("clamp()") && !diagnostic?.message.includes("pow()"),
		diagnostic?.message,
	);
});

const cliPath = fileURLToPath(new URL("../src/cli.ts", import.meta.url));

Deno.test("cli - --fluid-type-function chooses the CSS and rejects an unknown value", async () => {
	const dir = await mkdtemp(join(tmpdir(), "cssforge-fluid-type-function-cli-"));
	try {
		const paths = buildPaths(dir);
		await writeFile(paths.config, exampleSource, "utf8");
		const run = (fluidTypeFunction: string) =>
			spawnSync(
				process.execPath,
				[
					cliPath,
					"--config",
					paths.config,
					"--mode",
					"css",
					"--css",
					paths.cssOutput,
					"--fluid-type-function",
					fluidTypeFunction,
				],
				{ cwd: dir, encoding: "utf8", env: childEnv },
			);

		const clamp = run("clamp");
		assertEquals(clamp.status, 0, clamp.stderr);
		assertEquals(
			await readFile(paths.cssOutput, "utf8"),
			generateCSS(scale(example), { fluidTypeFunction: "clamp" }),
		);

		const unknown = run("calc");
		assertEquals(unknown.status, 1);
		assert(unknown.stderr.includes("calc"), unknown.stderr);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});
