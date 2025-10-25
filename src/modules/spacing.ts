import type { UtopiaSpaceConfig } from "utopia-core";
import { calculateSpaceScale } from "utopia-core";
import { pxToRem, validateName } from "../helpers.ts";
import type { Output, ResolveMap } from "../lib.ts";

export interface FluidSpaceConfig {
  value: UtopiaSpaceConfig & {
    /**
     * An optional prefix for the generated CSS variables.
     */
    prefix?: string;
  };
}

type SpacingValue = string;

interface SpacingScale {
  [key: string]: SpacingValue;
}

/**
 * Settings for pixel to rem conversion.
 */
export interface PixelSettings {
  /**
   * Whether to convert pixel values to rems.
   * @default true
   */
  pxToRem?: boolean;
  /**
   * The base rem value to use for conversion.
   * @default 16
   */
  rem?: number;
}

/**
 * The spacing configuration object.
 */
export interface SpacingConfig {
  /**
   * Fluid spacing scales powered by utopia `calculateSpaceScale`.
   * Each key defines one scale. Tokens are derived from the returned sizes' labels.
   */
  fluid?: {
    [key: string]: FluidSpaceConfig;
  };
  /**
   * Static spacing scales defined under the `custom` key.
   * Each scale's `value` map contains token -> size (string) pairs.
   */
  custom?: {
    [key: string]: { value: SpacingScale; settings?: PixelSettings };
  };
}

/**
 * Convert spacing configuration into CSS custom properties.
 *
 * Generated variable naming:
 * - Custom scale: `--spacing-{scale}-{token}` (renamed from --space-)
 * - Fluid scale:  `--spacing_fluid-{prefixOrScale}-{token}` (renamed from --fluidspace-)

 *
 * @example
 * // Static + fluid combined
 * const { css } = processSpacing({
 *   fluid: {
 *     base: { value: { minSize: 4, maxSize: 24, minWidth: 320, maxWidth: 1280, negativeSteps: 0, positiveSteps: 2, prefix: "space" } }
 *   },
 *   custom: {
 *     gap: { value: { 1: "4px", 2: "8px" } }
 *   }
 * });
 */
export function processSpacing(spacing: SpacingConfig): Output {
  const cssOutput: string[] = [];
  const resolveMap: ResolveMap = new Map();

  if (spacing.fluid) {
    const moduleKey = "spacing_fluid";
    for (const [scaleName, { value }] of Object.entries(spacing.fluid)) {
      validateName(scaleName);
      const { prefix, ...utopiaConfig } = value;
      if (prefix) validateName(prefix);

      const { sizes, customPairs, oneUpPairs } = calculateSpaceScale(utopiaConfig);

      const resolvedPrefix = prefix ? `${scaleName}-${prefix}` : scaleName;
      for (const { label, clamp } of [sizes, customPairs, oneUpPairs].flat()) {
        const variableName = `--${moduleKey}-${resolvedPrefix}-${label}`;
        const cssVar = `${variableName}: ${clamp};`;
        cssOutput.push(cssVar);
        resolveMap.set(`${moduleKey}.${scaleName}@${label}`, {
          variable: cssVar,
          key: variableName,
          value: clamp,
        });
      }
    }
  }

  if (spacing.custom) {
    const moduleKey = "spacing";
    for (
      const [scaleName, { value, settings = { pxToRem: true, rem: 16 } }] of Object
        .entries(spacing.custom)
    ) {
      validateName(scaleName);
      for (const [scaleKey, scaleValue] of Object.entries(value)) {
        validateName(scaleKey);
        const convertedValue = settings.pxToRem
          ? pxToRem({ value: scaleValue, rem: settings.rem })
          : scaleValue;
        const varName = `--${moduleKey}-${scaleName}-${scaleKey}`;
        const variable = `${varName}: ${convertedValue};`;
        cssOutput.push(variable);
        resolveMap.set(`${moduleKey}.custom.${scaleName}.${scaleKey}`, {
          variable,
          key: varName,
          value: convertedValue,
        });
      }
    }
  }

  return { css: cssOutput.join("\n"), resolveMap };
}
