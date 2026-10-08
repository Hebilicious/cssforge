import {
	calculateClamp,
	calculateTypeScale,
	type UtopiaStep,
	type UtopiaTypeConfig,
} from "utopia-core";
import { assertSettingsKeys, validateCustomLabel, validateName } from "../helpers.ts";
import {
	type Diagnostic,
	getReferencePaths,
	type Output,
	type ResolvedToken,
	type ResolveMap,
	type Variables,
} from "../lib.ts";

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
	};
}

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

/**
 * A step of a fluid type scale: its sizes in px at `minWidth` and `maxWidth`,
 * and the `clamp()` that runs between them.
 */
type FluidTypeStep = Pick<
	UtopiaStep,
	"step" | "label" | "minFontSize" | "maxFontSize" | "clamp"
>;

/** Rounds a size to 4 decimals, as utopia-core rounds the sizes it reports. */
const round = (size: number) => Math.round((size + Number.EPSILON) * 10000) / 10000;

/**
 * The canonical sizes of every step, which the checks and both representations
 * of the scale use. Step 0 and above are utopia-core's. Step -n is step 0
 * divided by `minTypeScale^n` at every width, so a small size never shrinks as
 * the screen grows: it matches utopia at `minWidth`, and is
 * `maxFontSize / minTypeScale^n` at `maxWidth`.
 */
const fluidTypeSteps = (config: UtopiaTypeConfig): FluidTypeStep[] =>
	calculateTypeScale(config).map(({ step, label, minFontSize, maxFontSize, clamp }) => {
		if (step >= 0) return { step, label, minFontSize, maxFontSize, clamp };
		const divisor = config.minTypeScale ** -step;
		const narrow = config.minFontSize / divisor;
		const wide = config.maxFontSize / divisor;
		return {
			step,
			label,
			minFontSize: round(narrow),
			maxFontSize: round(wide),
			clamp: calculateClamp({
				minSize: narrow,
				maxSize: wide,
				minWidth: config.minWidth,
				maxWidth: config.maxWidth,
				relativeTo: config.relativeTo,
			}),
		};
	});

/** The sizes of a step in px at `minWidth` and `maxWidth`. */
type StepSizes = Pick<FluidTypeStep, "minFontSize" | "maxFontSize">;

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
 *
 * Each fluid scale is written twice from the same step sizes. The step tokens
 * `typography_fluid.<scale>@<label>` hold one self-contained `clamp()` each.
 * The tokens under `typography_fluid.<scale>.pow` hold the scale's inputs as
 * plain numbers, three helpers, and the steps derived from them with `pow()`,
 * so changing an input on `:root` tunes the whole scale at runtime.
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
				["customLabel", "minLegibleSize"],
				`${scalePath}.settings`,
			);
			const minLegibleSize = readMinLegibleSize(
				settings?.minLegibleSize,
				`${scalePath}.settings.minLegibleSize`,
			);
			const { prefix, ...utopiaConfig } = value;
			if (prefix) validateName(prefix, `${moduleKey}.${scaleName}.prefix`);
			const unit = readRelativeUnit(utopiaConfig.relativeTo, `${scalePath}.relativeTo`);

			const scale = fluidTypeSteps({
				labelStyle: settings?.customLabel ? "utopia" : "tshirt",
				...utopiaConfig,
			});

			const resolvedPrefix = prefix ? `${scaleName}-${prefix}` : scaleName;
			const keyOf = (name: string) => `--${moduleKey}-${resolvedPrefix}-${name}`;
			const steps = scale.map((step) => {
				const labelPath = `${moduleKey}.${scaleName}.settings.customLabel.${step.label}`;
				const label = settings?.customLabel
					? (settings.customLabel[step.label] ?? step.label)
					: step.label;
				// Validate the label that is actually emitted. A `customLabel` may
				// resolve through the prototype chain, so iterating own values would
				// miss a label that still reaches the generated key.
				validateCustomLabel(label, labelPath);
				if (label === "pow") {
					throw new Error(
						`Invalid configuration at "${labelPath}": "pow" is the segment of the scale's pow tokens, so a step cannot take it as its label.`,
					);
				}
				return { ...step, label };
			});

			const powPath = `${scalePath}.pow`;
			const powKey = (name: string) => keyOf(`pow-${name}`);
			const ref = (name: string) => `var(${powKey(name)})`;
			const power = (name: string, n: number) =>
				n === 1 ? ref(name) : `pow(${ref(name)}, ${n})`;
			const powInputs: Array<[string, string]> = [
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
			const stepZero = steps.find(({ step }) => step === 0);
			if (!stepZero) {
				throw new Error(
					`Invalid configuration at "${scalePath}": the scale has no step 0.`,
				);
			}
			const powStep = (step: number) => {
				if (step === 0) return `calc(${ref("at-narrow")} + ${ref("at-wide")})`;
				if (step < 0) {
					return `calc(${ref(stepZero.label)} / ${power("ratio-narrow", -step)})`;
				}
				return `calc(${ref("at-narrow")} * ${power("ratio-narrow", step)} + ${ref("at-wide")} * ${power("ratio-wide", step)})`;
			};

			// The pow values reference each other by key, so the shared resolver
			// finds their reference paths through these aliases.
			const powVariables: Variables = Object.fromEntries([
				...powInputs.map(([name]) => [powKey(name).slice(2), `${powPath}.${name}`]),
				...steps.map(({ label }) => [powKey(label).slice(2), `${powPath}@${label}`]),
			]);
			const tokenOf = (path: string, key: string, tokenValue: string): ResolvedToken => {
				const referencePaths = getReferencePaths({
					value: tokenValue,
					variables: powVariables,
				});
				return {
					variable: `${key}: ${tokenValue};`,
					key,
					value: tokenValue,
					sourcePath: path,
					...(referencePaths ? { referencePaths } : {}),
					type: "typography",
					tier: referencePaths ? "semantic" : "primitive",
				};
			};

			const clampTokens: ResolvedToken[] = [];
			const powTokens = powInputs.map(([name, inputValue]) =>
				tokenOf(`${powPath}.${name}`, powKey(name), inputValue),
			);
			for (const step of steps) {
				const stepPath = `${scalePath}@${step.label}`;
				assertWcagGrowth(step, step.label, scalePath);
				const smallest = Math.min(step.minFontSize, step.maxFontSize);
				if (minLegibleSize !== false && smallest < minLegibleSize) {
					diagnostics.push({
						code: "typography-below-legibility-floor",
						severity: "warning",
						path: stepPath,
						message: `Typography step ${stepPath} reaches ${px(smallest)}, below the ${px(minLegibleSize)} legibility floor. Raise minFontSize, lower the type scale or negativeSteps, or set the scale's settings.minLegibleSize.`,
					});
				}
				clampTokens.push(tokenOf(stepPath, keyOf(step.label), step.clamp));
				powTokens.push(
					tokenOf(`${powPath}@${step.label}`, powKey(step.label), powStep(step.step)),
				);
			}
			for (const token of [...clampTokens, ...powTokens]) {
				cssOutput.push(token.variable);
				resolveMap.set(token.sourcePath, token);
			}

			// One static step is normal where a scale crosses over, so only a scale
			// that is static at every step is reported, once.
			const largestChange = Math.max(...scale.map(changeRatio));
			if (largestChange < MIN_FLUID_CHANGE) {
				diagnostics.push({
					code: "typography-static-scale",
					severity: "warning",
					path: scalePath,
					message: `Typography scale ${scalePath} changes by at most ${Number(((largestChange - 1) * 100).toFixed(1))}% across the viewport range, under the ${Math.round((MIN_FLUID_CHANGE - 1) * 100)}% a fluid size needs to be noticeable, so its steps are effectively static. Widen the gap between minFontSize and maxFontSize or between minTypeScale and maxTypeScale, or use fixed sizes.`,
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
