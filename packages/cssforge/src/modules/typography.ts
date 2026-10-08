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

/** The larger end of a step divided by the smaller one, as a negative step can shrink. */
const changeRatio = ({ minFontSize, maxFontSize }: UtopiaStep) =>
	Math.max(minFontSize, maxFontSize) / Math.min(minFontSize, maxFontSize);

const assertWcagGrowth = (step: UtopiaStep, label: string, path: string) => {
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
				["customLabel", "minLegibleSize"],
				`${scalePath}.settings`,
			);
			const minLegibleSize = readMinLegibleSize(
				settings?.minLegibleSize,
				`${scalePath}.settings.minLegibleSize`,
			);
			const { prefix, ...utopiaConfig } = value;
			if (prefix) validateName(prefix, `${moduleKey}.${scaleName}.prefix`);

			const scale = calculateTypeScale({
				labelStyle: settings?.customLabel ? "utopia" : "tshirt",
				...utopiaConfig,
			});

			const resolvedPrefix = prefix ? `${scaleName}-${prefix}` : scaleName;
			for (const step of scale) {
				const { label, clamp } = step;
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
				const stepPath = `${scalePath}@${resolvedLabel}`;
				assertWcagGrowth(step, resolvedLabel, scalePath);
				const smallest = Math.min(step.minFontSize, step.maxFontSize);
				if (minLegibleSize !== false && smallest < minLegibleSize) {
					diagnostics.push({
						code: "typography-below-legibility-floor",
						severity: "warning",
						path: stepPath,
						message: `Typography step ${stepPath} reaches ${px(smallest)}, below the ${px(minLegibleSize)} legibility floor. Raise minFontSize, lower the type scale or negativeSteps, or set the scale's settings.minLegibleSize.`,
					});
				}
				const key = `--${moduleKey}-${resolvedPrefix}-${resolvedLabel}`;
				const variable = `${key}: ${clamp};`;
				cssOutput.push(variable);
				resolveMap.set(stepPath, {
					variable,
					key,
					value: clamp,
					sourcePath: stepPath,
					type: "typography",
					tier: "primitive",
				});
			}

			// One static step is normal where a scale crosses over, so only a scale
			// that is static at every step is reported, once.
			const largestChange = Math.max(...scale.map(changeRatio));
			if (largestChange < MIN_FLUID_CHANGE) {
				diagnostics.push({
					code: "typography-static-scale",
					severity: "warning",
					path: scalePath,
					message: `Typography scale ${scalePath} changes by at most ${Number(((largestChange - 1) * 100).toFixed(1))}% across the viewport range, under the ${Math.round((MIN_FLUID_CHANGE - 1) * 100)}% a fluid size needs to be noticeable, so its clamp() values are effectively static. Widen the gap between minFontSize and maxFontSize or between minTypeScale and maxTypeScale, or use fixed sizes.`,
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
