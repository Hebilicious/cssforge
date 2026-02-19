import { calculateTypeScale, type UtopiaTypeConfig } from "utopia-core";
import type { Output, ResolveMap } from "../lib.ts";
import { validateName } from "../helpers.ts";

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

	if (config.fluid) {
		const moduleKey = "typography_fluid";
		for (const [scaleName, definition] of Object.entries(config.fluid)) {
			validateName(scaleName);
			const { value, settings } = definition;
			const { prefix, ...utopiaConfig } = value;
			if (prefix) validateName(prefix);

			const scale = calculateTypeScale({
				labelStyle: settings?.customLabel ? "utopia" : "tshirt",
				...utopiaConfig,
			});

			const resolvedPrefix = prefix ? `${scaleName}-${prefix}` : scaleName;
			for (const { label, clamp } of scale) {
				const resolvedLabel = settings?.customLabel
					? (settings.customLabel[label] ?? label)
					: label;
				const key = `--${moduleKey}-${resolvedPrefix}-${resolvedLabel}`;
				const variable = `${key}: ${clamp};`;
				cssOutput.push(variable);
				resolveMap.set(`${moduleKey}.${scaleName}@${resolvedLabel}`, {
					variable,
					key,
					value: clamp,
				});
			}
		}
	}

	// Weights
	if (config.weight) {
		const moduleKey = "typography";
		for (const [weightName, { value }] of Object.entries(config.weight)) {
			validateName(weightName);
			for (const [token, weightValue] of Object.entries(value)) {
				validateName(token);
				const key = `--${moduleKey}-weight-${weightName}-${token}`;
				const variable = `${key}: ${weightValue};`;
				cssOutput.push(variable);
				resolveMap.set(`${moduleKey}.weight.${weightName}.${token}`, {
					variable,
					key,
					value: weightValue,
				});
			}
		}
	}

	return { css: { root: cssOutput.join("\n") }, resolveMap };
}
