import { pxToRem, validateName } from "../helpers.ts";
import type { Output, ResolveMap } from "../lib.ts";

type SpacingValue = string;

type SpacingScale = {
  [key: string]: SpacingValue;
};

export type PixelSettings = { pxToRem?: boolean; rem?: number };

export type SpacingConfig = {
  [key: string]: { value: SpacingScale; settings?: PixelSettings };
};

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
