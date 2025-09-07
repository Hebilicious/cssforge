import Color from "npm:colorjs.io";
import { type Output, type ResolveMap, resolveVariable } from "../lib.ts";
import { validateName } from "../helpers.ts";

type ExactlyOne<T> = {
  [K in keyof T]:
    & {
      [P in K]: T[P];
    }
    & {
      [P in Exclude<keyof T, K>]?: never;
    };
}[keyof T];

type PossibleColorValues = {
  hex: string;
  rgb: readonly [number, number, number] | string;
  hsl: readonly [number, number, number] | string;
  oklch: readonly [number, number, number] | string;
};

type ColorValue = ExactlyOne<PossibleColorValues>;

type ColorValueOrString = ColorValue | string;

type ColorVariants = {
  [key: string]: ColorValueOrString;
};

export type ColorPalette = {
  [key: string]: ColorVariants;
};

type Variables = {
  [key: string]: string;
};

type GradientDefinition = {
  value: string;
  variables?: Variables;
  settings?: unknown;
};

type GradientValue = {
  [key: string]: GradientDefinition;
};

export type Gradient = {
  value: GradientValue;
  settings?: unknown;
};

export type GradientConfig = {
  [key: string]: Gradient;
};

type ColorInThemeValues = {
  [key: string]: string;
};

type ColorTheme = {
  [key: string]: {
    value: ColorInThemeValues;
    variables?: Variables;
    settings?: unknown;
  };
};

export type ColorConfig = {
  palette: {
    value: ColorPalette;
    settings?: unknown;
  };
  gradients?: {
    value: GradientConfig;
    settings?: unknown;
  };
  theme?: {
    value: {
      [key: string]: ColorTheme;
    };
    settings?: unknown;
  };
};

function getColorString(value: ColorValue): string {
  if ("hex" in value) {
    return value.hex as string;
  }

  if ("rgb" in value) {
    return Array.isArray(value.rgb)
      ? `rgb(${(value.rgb as number[]).join(",")})`
      : value.rgb as string;
  }

  if ("hsl" in value) {
    return Array.isArray(value.hsl)
      ? `hsl(${value.hsl[0]}deg ${value.hsl[1]}% ${value.hsl[2]}%)`
      : value.hsl as string;
  }

  if ("oklch" in value) {
    return Array.isArray(value.oklch)
      ? `oklch(${(value.oklch as number[]).join(" ")})`
      : value.oklch as string;
  }

  throw new Error("Invalid color value");
}

function colorValueToOklch(value: ColorValueOrString): string {
  const colorString = typeof value === "string" ? value : getColorString(value);
  const color = new Color(colorString);
  const oklchColor = color.to("oklch");

  const parsedCoords = oklchColor.coords.map((coord) => isNaN(coord) ? 0 : coord);
  const l = Number(parsedCoords[0].toFixed(5));
  const c = Number(parsedCoords[1].toFixed(5));
  const h = Number(parsedCoords[2].toFixed(5));
  const alpha = oklchColor.alpha === 1
    ? ""
    : ` / ${Number(oklchColor.alpha.toFixed(3)) * 100}%`;
  return `oklch(${Number((l * 100).toFixed(3))}% ${c} ${h}${alpha})`;
}

export function processColors(colors: ColorConfig): Output {
  const cssOutput: string[] = [];
  const resolveMap: ResolveMap = new Map();
  cssOutput.push(`/* Palette */`);
  for (const [colorName, variants] of Object.entries(colors.palette.value)) {
    validateName(colorName);
    for (const [variantId, colorValue] of Object.entries(variants)) {
      try {
        validateName(variantId);
        const key = `--color-${colorName}-${variantId}`;
        const value = colorValueToOklch(colorValue);
        const variable = `${key}: ${value};`;

        cssOutput.push(variable);
        resolveMap.set(
          `colors.palette.value.${colorName}.${variantId}`,
          { key, value, variable },
        );
      } catch (error) {
        console.error(
          `Error processing color ${colorName}-${variantId}:`,
          error,
        );
      }
    }
  }

  if (colors.gradients) {
    cssOutput.push(`/*  Gradients  */`);
    const palette = { css: cssOutput.join("\n"), resolveMap };
    for (const [gradientName, gradient] of Object.entries(colors.gradients.value)) {
      validateName(gradientName);
      for (
        const [variantName, { value, variables }] of Object.entries(
          gradient.value,
        )
      ) {
        validateName(variantName);
        try {
          const resolvedVariables = variables
            ? Object.entries(variables).map(
              ([varKey, varPath]) => {
                const resolved = resolveVariable({
                  varPath,
                  colors: palette,
                });
                return [`--${varKey}`, resolved] as const;
              },
            )
            : [];

          const resolvedMapForGradient = new Map(resolvedVariables);

          const gradientValue = value.replace(
            /var\(--(\w+)\)/g,
            (_, key: string) =>
              `var(${resolvedMapForGradient.get(`--${key}`) ?? `--${key}`})`,
          );

          const key = `--gradient-${gradientName}-${variantName}`;
          const variable = `${key}: ${gradientValue};`;
          cssOutput.push(variable);
          resolveMap.set(`colors.gradients.value.${gradientName}.${variantName}`, {
            variable,
            key,
            value: gradientValue,
          });
        } catch (error) {
          console.error(
            `Error processing gradient ${gradientName}-${variantName}:`,
            error,
          );
          throw error;
        }
      }
    }
  }

  if (colors.theme) {
    for (const [themeName, theme] of Object.entries(colors.theme.value)) {
      validateName(themeName);
      cssOutput.push(`/* Theme: ${themeName} */`);
      const palette = { css: cssOutput.join("\n"), resolveMap };
      for (
        const [colorName, { value: colorInThemeValues, variables }] of Object
          .entries(theme)
      ) {
        validateName(colorName);
        cssOutput.push(`/* ${colorName} */`);
        try {
          const resolvedVariables = variables
            ? Object.entries(variables).map(
              ([varKey, varPath]) => {
                const resolved = resolveVariable({
                  varPath,
                  colors: palette,
                });
                return [`--${varKey}`, resolved] as const;
              },
            )
            : [];

          const resolvedMap = new Map(resolvedVariables);

          for (
            const [variantName, variantValue] of Object.entries(
              colorInThemeValues,
            )
          ) {
            validateName(variantName);
            const resolvedValue = variantValue.replace(
              /var\(--(\w+)\)/g,
              (_, key: string) => `var(${resolvedMap.get(`--${key}`) ?? `--${key}`})`,
            );

            const key = `--theme-${themeName}-${colorName}-${variantName}`;
            const variable = `${key}: ${resolvedValue};`;
            cssOutput.push(`${key}: ${resolvedValue};`);
            resolveMap.set(
              `colors.theme.value.${themeName}.${colorName}.${variantName}`,
              { key, value: resolvedValue, variable },
            );
          }
        } catch (error) {
          console.error(
            `Error processing color ${themeName}-${colorName}:`,
            error,
          );
        }
      }
    }
  }

  const output = { css: cssOutput.join("\n"), resolveMap };
  // console.log(output);
  return output;
}
