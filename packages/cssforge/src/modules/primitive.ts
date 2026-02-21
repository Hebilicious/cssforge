import { pxToRem, validateName } from "../helpers.ts";
import {
	getResolvedVariablesMap,
	type Output,
	resolveValue,
	type Variables,
} from "../lib.ts";
import type { ColorConfig } from "./colors.ts";
import { processColors } from "./colors.ts";
import type { PixelSettings, SpacingConfig } from "./spacing.ts";
import { processSpacing } from "./spacing.ts";
import type { TypographyConfig } from "./typography.ts";
import { processTypography } from "./typography.ts";

interface PrimitiveProperties {
	[key: string]: string;
}

interface PrimitiveDefinition {
	value: PrimitiveProperties;
	variables?: Variables;
	settings?: PixelSettings;
}

interface PrimitiveValue {
	[key: string]: PrimitiveDefinition;
}

/**
 * A single primitive definition.
 */
export interface Primitive {
	value: PrimitiveValue;
	settings?: unknown;
}

/**
 * A collection of primitives.
 */
export interface PrimitiveConfig {
	[key: string]: Primitive;
}

/**
 * Processes the primitive configuration to generate CSS variables.
 * Primitives can reference other design tokens from colors, typography, and spacing.
 * @example
 * ```ts
 * const config = {
 *  primitives: {
 *    button: {
 *      value: {
 *        default: {
 *          value: {
 *            "background-color": "var(--bg)",
 *          },
 *          variables: {
 *            "bg": "colors.palette.value.red.100",
 *          },
 *        },
 *      },
 *    },
 *  },
 *  colors: {
 *    palette: {
 *      value: {
 *        red: {
 *          100: { hex: "#ff0000" },
 *        },
 *      },
 *    },
 *  },
 * };
 * const output = processPrimitives(config);
 * // output.css: "/* button * / ;\n--button-default-background-color: var(--color-red-100);"
 * ```
 */
export function processPrimitives(config: {
	primitives: PrimitiveConfig;
	colors?: ColorConfig;
	typography?: TypographyConfig;
	spacing?: SpacingConfig;
}): Output {
	const cssOutput: string[] = [];
	const resolveMap = new Map();
	const moduleKey = "primitives";
	const colorVariables = config.colors ? processColors(config.colors) : null;
	const typographyVariables = config.typography
		? processTypography(config.typography)
		: null;
	const spacingVariables = config.spacing ? processSpacing(config.spacing) : null;
	for (const [primitiveName, primitive] of Object.entries(config.primitives)) {
		validateName(primitiveName);
		cssOutput.push(`/* ${primitiveName} */`);
		for (const [
			variantName,
			{ value: properties, variables, settings = { pxToRem: true, rem: 16 } },
		] of Object.entries(primitive.value)) {
			validateName(variantName);
			try {
				const resolvedMap = getResolvedVariablesMap({
					variables,
					colors: colorVariables,
					typography: typographyVariables,
					spacing: spacingVariables,
				});

				for (const [propName, propValue] of Object.entries(properties)) {
					validateName(propName);

					const convertedValue = settings.pxToRem
						? pxToRem({ value: propValue, rem: settings.rem })
						: propValue;

					const resolvedValue = resolveValue({ map: resolvedMap, value: convertedValue });

					const key = `--${primitiveName}-${variantName}-${propName}`;
					const variable = `${key}: ${resolvedValue};`;
					cssOutput.push(variable);
					resolveMap.set(`${moduleKey}.${primitiveName}.${variantName}.${propName}`, {
						key,
						value: resolvedValue,
						variable,
					});
				}
			} catch (error) {
				console.error(
					`Error processing primitive ${primitiveName}-${variantName}:`,
					error,
				);
				throw error;
			}
		}
	}

	return { css: { root: cssOutput.join("\n") }, resolveMap };
}
