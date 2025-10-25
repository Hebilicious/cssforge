import Color from "colorjs.io";
import { type Output, type ResolveMap, resolveValue } from "../lib.ts";
import { validateName } from "../helpers.ts";
import { getResolvedVariablesMap } from "../lib.ts";
import type { Variables } from "../lib.ts";

type ExactlyOne<T> = {
  [K in keyof T]:
    & {
      [P in K]: T[P];
    }
    & {
      [P in Exclude<keyof T, K>]?: never;
    };
}[keyof T];

interface PossibleColorValues {
  hex: string;
  rgb: readonly [number, number, number] | string;
  hsl: readonly [number, number, number] | string;
  oklch: readonly [number, number, number] | string;
}

type ColorValue = ExactlyOne<PossibleColorValues>;

type ColorValueOrString = ColorValue | string;

interface ColorVariants {
  [key: string]: ColorValueOrString;
}

export interface WithCondition {
  /**
   * CSS condition to wrap variables in (e.g., ".MyClass", "@media (prefers-color-scheme: dark)")
   */
  condition?: string;
}
/**
 * Settings for palette colors, including optional conditions like media queries.
 */
export interface PaletteColorSettings extends WithCondition {}

/**
 * Settings for gradients, including optional conditions like media queries.
 */
export interface GradientSettings extends WithCondition {}

/**
 * Settings for themes, including optional conditions like media queries.
 */
export interface ThemeSettings extends WithCondition {}

/**
 * A single palette color configuration with its values and optional settings.
 */
export interface PaletteColorConfig {
  value: ColorVariants;
  settings?: PaletteColorSettings;
}

/**
 * A palette of colors, organized by name and variants.
 */
export interface ColorPalette {
  [key: string]: PaletteColorConfig;
}

interface GradientDefinition {
  value: string;
  variables?: Variables;
  settings?: unknown;
}

interface GradientValue {
  [key: string]: GradientDefinition;
}

/**
 * A single gradient definition.
 */
export interface Gradient {
  value: GradientValue;
  settings?: GradientSettings;
}

/**
 * A collection of gradients.
 */
export interface GradientConfig {
  [key: string]: Gradient;
}

interface ColorInThemeValues {
  [key: string]: string;
}

interface ColorInTheme {
  value: ColorInThemeValues;
  variables?: Variables;
  settings?: {
    /**
     * Only include the variant name in the CSS variable name.
     * --theme-light-colors-primaryBackground => --primaryBackground
     */
    variantNameOnly?: boolean;
  };
}

export interface ThemeConfig {
  value: {
    [colorName: string]: ColorInTheme;
  };
  settings?: ThemeSettings;
}

export interface ColorTheme {
  [themeName: string]: ThemeConfig;
}

/**
 * The main color configuration object.
 */
export interface ColorConfig {
  /**
   * The color palette.
   */
  palette: {
    value: ColorPalette;
    settings?: unknown;
  };
  /**
   * A collection of gradients.
   */
  gradients?: {
    value: GradientConfig;
    settings?: unknown;
  };
  /**
   * A collection of themes.
   */
  theme?: {
    [themeName: string]: ThemeConfig;
  };
}

/**
 * Gets the color string from a color value object.
 * @example
 * ```ts
 * getColorString({ hex: "#ff0000" }); // "#ff0000"
 * getColorString({ rgb: [255, 0, 0] }); // "rgb(255,0,0)"
 * ```
 */
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

/**
 * Converts a color value to the OKLCH color space.
 * @example
 * ```ts
 * colorValueToOklch({ hex: "#ff0000" }); // "oklch(62.796% 0.25768 29.23388)"
 * colorValueToOklch("blue"); // "oklch(45.201% 0.31321 264.05202)"
 * ```
 */
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

/**
 * Processes the color configuration to generate CSS variables.
 * This includes palettes, gradients, and themes.
 * @example
 * ```ts
 * const colors = {
 *  palette: {
 *    value: {
 *      red: {
 *        100: { hex: "#ff0000" }
 *      }
 *    }
 *  }
 * };
 * const output = processColors(colors);
 * // output.css: "/* Palette * /;\n--color-red-100: oklch(62.796% 0.25768 29.23388);"
 * ```
 */
export function processColors(colors: ColorConfig): Output {
  const cssOutput: string[] = [];
  const resolveMap: ResolveMap = new Map();
  cssOutput.push(`/* Palette */`);
  const moduleKey = "palette";

  function conditionalBuilder(
    settings: WithCondition | undefined,
    initialComment: string,
  ) {
    const leadingComments: string[] = [];
    const innerComments: string[] = [];
    const vars: string[] = [];

    if (settings?.condition) {
      leadingComments.push(initialComment);
    } else {
      cssOutput.push(initialComment);
    }

    return {
      addComment(c: string) {
        if (settings?.condition) innerComments.push(c);
        else cssOutput.push(c);
      },
      pushVariable(v: string) {
        if (settings?.condition) vars.push(v);
        else cssOutput.push(v);
      },
      finalize() {
        if (settings?.condition && vars.length > 0) {
          cssOutput.push(...leadingComments);
          cssOutput.push(`${settings.condition} {`);
          cssOutput.push(...innerComments.map((c) => `  ${c}`));
          cssOutput.push(...vars.map((v) => `  ${v}`));
          cssOutput.push(`}`);
        }
      },
    };
  }

  for (const [colorName, colorConfig] of Object.entries(colors.palette.value)) {
    validateName(colorName);

    try {
      const handler = conditionalBuilder(
        colorConfig.settings,
        `/* ${colorName} */`,
      );

      for (const [variantId, colorValue] of Object.entries(colorConfig.value)) {
        validateName(variantId);
        const key = `--${moduleKey}-${colorName}-${variantId}`;
        const value = colorValueToOklch(colorValue);
        const variable = `${key}: ${value};`;

        handler.pushVariable(variable);

        resolveMap.set(
          `${moduleKey}.${colorName}.${variantId}`,
          { key, value, variable },
        );
      }

      handler.finalize();
    } catch (error) {
      console.error(`Error processing color ${colorName}:`, error);
    }
  }

  if (colors.gradients) {
    cssOutput.push(`/* Gradients */`);
    const moduleKey = "gradients";
    const palette = { css: cssOutput.join("\n"), resolveMap };

    for (const [gradientName, gradient] of Object.entries(colors.gradients.value)) {
      validateName(gradientName);
      const handler = conditionalBuilder(gradient.settings, `/* ${gradientName} */`);

      for (
        const [variantName, { value, variables }] of Object.entries(
          gradient.value,
        )
      ) {
        validateName(variantName);
        try {
          const resolvedMapForGradient = getResolvedVariablesMap({
            variables,
            colors: palette,
          });

          const gradientValue = resolveValue({ map: resolvedMapForGradient, value });

          const key = `--${moduleKey}-${gradientName}-${variantName}`;
          const variable = `${key}: ${gradientValue};`;

          handler.pushVariable(variable);

          resolveMap.set(`${moduleKey}.${gradientName}.${variantName}`, {
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

      handler.finalize();
    }
  }

  if (colors.theme) {
    cssOutput.push(`/* Themes */`);
    const moduleKey = "theme";
    const palette = { css: cssOutput.join("\n"), resolveMap };

    for (const [themeName, themeConfig] of Object.entries(colors.theme)) {
      validateName(themeName);
      const handler = conditionalBuilder(
        themeConfig.settings,
        `/* Theme: ${themeName} */`,
      );

      try {
        for (const [colorName, colorInTheme] of Object.entries(themeConfig.value)) {
          validateName(colorName);
          const colorComment = `/* ${colorName} */`;
          handler.addComment(colorComment);

          const resolvedMap = getResolvedVariablesMap({
            variables: colorInTheme.variables,
            colors: palette,
          });

          const variantNameOnly = colorInTheme.settings?.variantNameOnly ?? false;
          for (const [variantName, variantValue] of Object.entries(colorInTheme.value)) {
            validateName(variantName);
            const resolvedValue = resolveValue({
              map: resolvedMap,
              value: variantValue,
            });

            const key = variantNameOnly
              ? `--${variantName}`
              : `--${moduleKey}-${themeName}-${colorName}-${variantName}`;

            const variable = `${key}: ${resolvedValue};`;

            handler.pushVariable(variable);

            resolveMap.set(
              `${moduleKey}.${themeName}.${colorName}.${variantName}`,
              { key, value: resolvedValue, variable },
            );
          }
        }

        handler.finalize();
      } catch (error) {
        console.error(`Error processing theme ${themeName}:`, error);
      }
    }
  }

  const output = { css: cssOutput.join("\n"), resolveMap };
  // console.log(output);
  return output;
}
