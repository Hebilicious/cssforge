import { pxToRem, validateName } from "../helpers.ts";
import type { Output, ResolveMap } from "../lib.ts";

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
  [key: string]: { value: SpacingScale; settings?: PixelSettings };
}

/**
 * Processes the spacing configuration to generate CSS variables.
 * @example
 * ```ts
 * const spacing = {
 *  size: {
 *    value: {
 *      1: "0.25rem",
 *      2: "0.5rem",
 *    },
 *  },
 * };
 * const output = processSpacing(spacing);
 * // output.css: "--size-1: 0.25rem;\n--size-2: 0.5rem;"
 * ```
 */
export function processSpacing(spacing: SpacingConfig): Output {
  const cssOutput: string[] = [];
  const resolveMap: ResolveMap = new Map();

  for (
    const [scaleName, { value, settings = { pxToRem: true, rem: 16 } }] of Object.entries(
      spacing,
    )
  ) {
    validateName(scaleName);
    for (const [scaleKey, scaleValue] of Object.entries(value)) {
      validateName(scaleKey);

      const convertedValue = settings.pxToRem
        ? pxToRem({ value: scaleValue, rem: settings.rem })
        : scaleValue;

      const key = `--${scaleName}-${scaleKey}`;
      const variable = `${key}: ${convertedValue};`;

      cssOutput.push(variable);
      resolveMap.set(`spacing.${scaleName}.value.${scaleKey}`, {
        variable,
        key,
        value: convertedValue,
      });
    }
  }

  return { css: cssOutput.join("\n"), resolveMap };
}
