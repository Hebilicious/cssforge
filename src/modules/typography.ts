import { calculateTypeScale, type UtopiaTypeConfig } from "npm:utopia-core";
import type { Output, ResolveMap } from "../lib.ts";
import { validateName } from "../helpers.ts";

export type TypeScaleDefinition = {
  value: UtopiaTypeConfig & { prefix?: string };
  settings?: {
    customLabel?: Record<string, string>;
  };
};

type TypographyWeight = {
  value: {
    [key: string]: string;
  };
};

export type TypographyConfig = {
  [key: string]: {
    weight?: TypographyWeight;
    typescale?: TypeScaleDefinition;
  };
};

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
