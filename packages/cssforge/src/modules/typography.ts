import { calculateTypeScale, type UtopiaStep, type UtopiaTypeConfig } from "utopia-core";
import { assertSettingsKeys, validateCustomLabel, validateName } from "../helpers.ts";
import type { Diagnostic, Output, ResolveMap } from "../lib.ts";

export interface FluidTypeScaleDefinition {
	/**
	 * The configuration for the type scale generation.
	 */
	value: Omit<UtopiaTypeConfig, "labelStyle"> & {
		/**
		 * An optional prefix for the generated CSS variables.
		 */
		prefix?: string;
	};
	/**
	 * Optional settings for the type scale.
	 */
	settings?: {
		/**
		 * Custom labels for the type scale steps.
		 */
		customLabel?: Record<string, string>;
		/**
		 * The smallest size, in px, a step may reach before the build warns that
		 * it is hard to read. `false` turns the check off.
		 * @default 12
		 */
		minLegibleSize?: number | false;
		/**
		 * How the steps are written. `"clamp"` bakes each step into a `clamp()`
		 * value. `"pow"` emits the scale's six inputs and derives each step from
		 * them with `pow()`, so the scale can be tuned in the browser. `pow()`
		 * needs Chrome 120, Firefox 118 or Safari 15.4.
		 * @default "clamp"
		 */
		output?: FluidTypeOutput;
	};
}

/** How a fluid type scale writes its steps. */
export type FluidTypeOutput = "clamp" | "pow";

interface TypographyWeight {
	value: {
		[key: string]: string;
	};
}

export interface TypographyConfig {
	/**
	 * A fluid typescale definition.
	 */
	fluid?: { [scaleName: string]: FluidTypeScaleDefinition };
	/**
	 * A collection of font weights.
	 */
	weight?: { [groupName: string]: TypographyWeight };
}

/** Past 2.5x, 500% zoom cannot double the text at some widths (WCAG 1.4.4). */
const MAX_FLUID_GROWTH = 2.5;
/** A step that changes less than 10% across the viewport range is effectively static. */
const MIN_FLUID_CHANGE = 1.1;
const DEFAULT_MIN_LEGIBLE_SIZE = 12;
/** The px per rem utopia-core divides by when it writes rem values. */
const REM = 16;

const px = (size: number) => `${Number(size.toFixed(2))}px`;

const readMinLegibleSize = (value: unknown, path: string): number | false => {
	if (value === undefined) return DEFAULT_MIN_LEGIBLE_SIZE;
	if (
		value === false ||
		(typeof value === "number" && Number.isFinite(value) && value > 0)
	) {
		return value;
	}
	throw new Error(
		`Invalid configuration at "${path}": expected a size in px greater than 0, or false to turn the check off, received ${JSON.stringify(value)}.`,
	);
};

const readOutput = (value: unknown, path: string): FluidTypeOutput => {
	if (value === undefined) return "clamp";
	if (value === "clamp" || value === "pow") return value;
	throw new Error(
		`Invalid configuration at "${path}": expected "clamp" or "pow", received ${JSON.stringify(value)}.`,
	);
};

/** The unit utopia-core writes for each `relativeTo`, which defaults to the viewport width. */
const RELATIVE_UNITS = { viewport: "vi", "viewport-width": "vw", container: "cqi" };

const readRelativeUnit = (value: unknown, path: string): string => {
	if (value === undefined) return RELATIVE_UNITS["viewport-width"];
	for (const [relativeTo, unit] of Object.entries(RELATIVE_UNITS)) {
		if (value === relativeTo) return unit;
	}
	throw new Error(
		`Invalid configuration at "${path}": expected "viewport", "viewport-width" or "container", received ${JSON.stringify(value)}.`,
	);
};

/** The sizes of a step in px at `minWidth` and `maxWidth`. */
type StepSizes = Pick<UtopiaStep, "minFontSize" | "maxFontSize">;

/**
 * The sizes a step is emitted with. A pow step below 0 divides step 0 by the
 * narrow ratio at every width, so its wide end differs from utopia's.
 */
const emittedSizes = (
	step: UtopiaStep,
	output: FluidTypeOutput,
	{ maxFontSize, minTypeScale }: UtopiaTypeConfig,
): StepSizes => {
	if (output === "clamp" || step.step >= 0) return step;
	const wide = maxFontSize / minTypeScale ** -step.step;
	return { minFontSize: step.minFontSize, maxFontSize: Math.round(wide * 10000) / 10000 };
};

/** The larger end of a step divided by the smaller one, as a negative step can shrink. */
const changeRatio = ({ minFontSize, maxFontSize }: StepSizes) =>
	Math.max(minFontSize, maxFontSize) / Math.min(minFontSize, maxFontSize);

const assertWcagGrowth = (step: StepSizes, label: string, path: string) => {
	if (!(step.minFontSize > 0) || !(step.maxFontSize > 0)) {
		throw new Error(
			`Invalid configuration at "${path}": step "${label}" ranges from ${px(step.minFontSize)} to ${px(step.maxFontSize)}. Every step needs a size greater than 0px; raise minFontSize or reduce negativeSteps.`,
		);
	}
	const growth = step.maxFontSize / step.minFontSize;
	if (growth <= MAX_FLUID_GROWTH) return;
	throw new Error(
		`Invalid configuration at "${path}": step "${label}" grows from ${px(step.minFontSize)} to ${px(step.maxFontSize)}, ${Number(growth.toFixed(3))}x its minimum. Past ${MAX_FLUID_GROWTH}x, 500% zoom cannot double the text at some viewport widths (WCAG 1.4.4 Resize Text). Lower maxFontSize or maxTypeScale, or reduce positiveSteps.`,
	);
};

/**
 * Generate CSS Custom Properties for typography.
 *
 * @example
 * ```ts
 * const typography: TypographyConfig = {
 *   fluid: {
 *     base: {
 *       value: {
 *         minWidth: 320,
 *         minFontSize: 14,
 *         minTypeScale: 1.25,
 *         maxWidth: 1435,
 *         maxFontSize: 16,
 *         maxTypeScale: 1.25,
 *         positiveSteps: 2,
 *         negativeSteps: 1,
 *         prefix: "text",
 *       },
 *     },
 *   },
 *   weight: { arial: { value: { regular: "400", bold: "700" } } },
 * };
 * const { css } = processTypography(typography);
 * ```
 */
export function processTypography(config: TypographyConfig): Output {
	const cssOutput: string[] = [];
	const resolveMap: ResolveMap = new Map();
	const diagnostics: Diagnostic[] = [];

	if (config.fluid) {
		const moduleKey = "typography_fluid";
		for (const [scaleName, definition] of Object.entries(config.fluid)) {
			validateName(scaleName, `${moduleKey}.${scaleName}`);
			const { value, settings } = definition;
			const scalePath = `${moduleKey}.${scaleName}`;
			assertSettingsKeys(
				settings,
				["customLabel", "minLegibleSize", "output"],
				`${scalePath}.settings`,
			);
			const minLegibleSize = readMinLegibleSize(
				settings?.minLegibleSize,
				`${scalePath}.settings.minLegibleSize`,
			);
			const output = readOutput(settings?.output, `${scalePath}.settings.output`);
			const { prefix, ...utopiaConfig } = value;
			if (prefix) validateName(prefix, `${moduleKey}.${scaleName}.prefix`);

			const scale = calculateTypeScale({
				labelStyle: settings?.customLabel ? "utopia" : "tshirt",
				...utopiaConfig,
			});

			const resolvedPrefix = prefix ? `${scaleName}-${prefix}` : scaleName;
			const keyOf = (name: string) => `--${moduleKey}-${resolvedPrefix}-${name}`;
			const labelOf = ({ label }: UtopiaStep) => {
				const resolvedLabel = settings?.customLabel
					? (settings.customLabel[label] ?? label)
					: label;
				// Validate the label that is actually emitted. A `customLabel` may
				// resolve through the prototype chain, so iterating own values would
				// miss a label that still reaches the generated key.
				validateCustomLabel(
					resolvedLabel,
					`${moduleKey}.${scaleName}.settings.customLabel.${label}`,
				);
				return resolvedLabel;
			};
			const emit = (path: string, key: string, tokenValue: string) => {
				const variable = `${key}: ${tokenValue};`;
				cssOutput.push(variable);
				resolveMap.set(path, {
					variable,
					key,
					value: tokenValue,
					sourcePath: path,
					type: "typography",
					tier: "primitive",
				});
			};

			let stepValue = (step: UtopiaStep) => step.clamp;
			if (output === "pow") {
				const ref = (name: string) => `var(${keyOf(name)})`;
				const power = (name: string, n: number) =>
					n === 1 ? ref(name) : `pow(${ref(name)}, ${n})`;
				const unit = readRelativeUnit(utopiaConfig.relativeTo, `${scalePath}.relativeTo`);
				const inputs: Array<[string, string]> = [
					["narrow", `${utopiaConfig.minWidth / REM}`],
					["wide", `${utopiaConfig.maxWidth / REM}`],
					["size-narrow", `${utopiaConfig.minFontSize / REM}`],
					["size-wide", `${utopiaConfig.maxFontSize / REM}`],
					["ratio-narrow", `${utopiaConfig.minTypeScale}`],
					["ratio-wide", `${utopiaConfig.maxTypeScale}`],
					[
						"fluid",
						`clamp(0rem, (100${unit} - ${ref("narrow")} * 1rem) / (${ref("wide")} - ${ref("narrow")}), 1rem)`,
					],
					["at-narrow", `calc(${ref("size-narrow")} * (1rem - ${ref("fluid")}))`],
					["at-wide", `calc(${ref("size-wide")} * ${ref("fluid")})`],
				];
				for (const [name, inputValue] of inputs) {
					emit(`${scalePath}.${name}`, keyOf(name), inputValue);
				}

				const stepZero = scale.find(({ step }) => step === 0);
				const stepZeroRef = stepZero ? `var(${keyOf(labelOf(stepZero))})` : "";
				stepValue = ({ step }) => {
					if (step === 0) return `calc(${ref("at-narrow")} + ${ref("at-wide")})`;
					if (step < 0) return `calc(${stepZeroRef} / ${power("ratio-narrow", -step)})`;
					return `calc(${ref("at-narrow")} * ${power("ratio-narrow", step)} + ${ref("at-wide")} * ${power("ratio-wide", step)})`;
				};
			}

			const checkedSizes: StepSizes[] = [];
			for (const step of scale) {
				const resolvedLabel = labelOf(step);
				const stepPath = `${scalePath}@${resolvedLabel}`;
				const sizes = emittedSizes(step, output, utopiaConfig);
				checkedSizes.push(sizes);
				assertWcagGrowth(sizes, resolvedLabel, scalePath);
				const smallest = Math.min(sizes.minFontSize, sizes.maxFontSize);
				if (minLegibleSize !== false && smallest < minLegibleSize) {
					diagnostics.push({
						code: "typography-below-legibility-floor",
						severity: "warning",
						path: stepPath,
						message: `Typography step ${stepPath} reaches ${px(smallest)}, below the ${px(minLegibleSize)} legibility floor. Raise minFontSize, lower the type scale or negativeSteps, or set the scale's settings.minLegibleSize.`,
					});
				}
				emit(stepPath, keyOf(resolvedLabel), stepValue(step));
			}

			// One static step is normal where a scale crosses over, so only a scale
			// that is static at every step is reported, once.
			const largestChange = Math.max(...checkedSizes.map(changeRatio));
			if (largestChange < MIN_FLUID_CHANGE) {
				diagnostics.push({
					code: "typography-static-scale",
					severity: "warning",
					path: scalePath,
					message: `Typography scale ${scalePath} changes by at most ${Number(((largestChange - 1) * 100).toFixed(1))}% across the viewport range, under the ${Math.round((MIN_FLUID_CHANGE - 1) * 100)}% a fluid size needs to be noticeable, so its ${output}() values are effectively static. Widen the gap between minFontSize and maxFontSize or between minTypeScale and maxTypeScale, or use fixed sizes.`,
				});
			}
		}
	}

	// Weights
	if (config.weight) {
		const moduleKey = "typography";
		for (const [weightName, { value }] of Object.entries(config.weight)) {
			validateName(weightName, `${moduleKey}.weight.${weightName}`);
			for (const [token, weightValue] of Object.entries(value)) {
				validateName(token, `${moduleKey}.weight.${weightName}.${token}`);
				const key = `--${moduleKey}-weight-${weightName}-${token}`;
				const variable = `${key}: ${weightValue};`;
				cssOutput.push(variable);
				resolveMap.set(`${moduleKey}.weight.${weightName}.${token}`, {
					variable,
					key,
					value: weightValue,
					sourcePath: `${moduleKey}.weight.${weightName}.${token}`,
					type: "typography",
					tier: "primitive",
				});
			}
		}
	}

	return { css: { root: cssOutput.join("\n") }, resolveMap, diagnostics };
}
