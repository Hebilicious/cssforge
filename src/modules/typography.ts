import { calculateTypeScale, type UtopiaTypeConfig } from "utopia-core";
import type { Output, ResolveMap } from "../lib.ts";
import { validateName } from "../helpers.ts";

/**
 * The definition for a type scale.
 */
export interface TypeScaleDefinition {
  /**
   * The configuration for the type scale generation.
   */
  value: UtopiaTypeConfig & {
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

/**
 * The typography configuration object.
 */
export interface TypographyConfig {
  [key: string]: {
    /**
     * A collection of font weights.
     */
    weight?: TypographyWeight;
    /**
     * The type scale definition.
     */
    typescale?: TypeScaleDefinition;
  };
}

/**
 * Processes the typography configuration to generate CSS variables for type scales and weights.
 * @example
 * ```ts
 * const typography = {
 *  default: {
 *    typescale: {
 *      value: {
 *        minWidth: 320,
 *        minFontSize: 14,
 *        minTypeScale: 1.25,
 *        maxWidth: 1435,
 *        maxFontSize: 16,
 *        maxTypeScale: 1.25,
 *        positiveSteps: 1,
 *        negativeSteps: 1,
 *      },
 *    },
 *    weight: {
 *      value: {
 *        regular: "400",
 *      },
 *    },
 *  },
 * };
 * const output = processTypography(typography);
 * // output.css: "--typography-default-lg: clamp(1.0938rem, 1.0489rem + 0.2242vw, 1.25rem);\n--typography-default-base: clamp(0.875rem, 0.8391rem + 0.1794vw, 1rem);\n--typography-default-sm: clamp(0.7rem, 0.6713rem + 0.1435vw, 0.8rem);\n--weight-default-regular: 400;"
 * ```
 */
export function processTypography(config: TypographyConfig): Output {
  const cssOutput: string[] = [];
  const resolveMap: ResolveMap = new Map();
  for (const [typography, { typescale, weight }] of Object.entries(config)) {
    validateName(typography);
    if (typescale) {
      const scale = calculateTypeScale({
        labelStyle: typescale.settings?.customLabel ? "utopia" : "tailwind",
        ...typescale.value,
      });
      const prefix = typescale.value.prefix || typography;
      for (const { label: baseLabel, clamp } of scale) {
        const label = typescale.settings?.customLabel
          ? typescale.settings.customLabel[baseLabel] ?? baseLabel
          : baseLabel;
        const key = `--typography-${prefix}-${label}`;
        const variable = `${key}: ${clamp};`;
        cssOutput.push(variable);
        resolveMap.set(`typography.${typography}.typescale@${label}`, {
          variable,
          key,
          value: clamp,
        });
      }
    }
    if (weight) {
      for (const [weightName, weightValue] of Object.entries(weight.value)) {
        validateName(weightName);
        const key = `--weight-${typography}-${weightName}`;
        const variable = `${key}: ${weightValue};`;
        cssOutput.push(variable);
        resolveMap.set(`typography.${typography}.weight.value.${weightName}`, {
          variable,
          key,
          value: weightValue,
        });
      }
    }
  }
  const output = { css: cssOutput.join("\n"), resolveMap };
  return output;
}
