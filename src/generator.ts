import {
  type CSSForgeConfig,
  processColors,
  processPrimitives,
  processSpacing,
  processTypography,
} from "./mod.ts";

import { deepMerge } from "jsr:@std/collections/deep-merge";
import type { ResolveMap } from "./lib.ts";

type CssValue = {
  value: string;
  key: string;
  variable: string;
};

type ForgeValue = {
  [key: string]: ForgeValue | CssValue;
};

export function createForgeValues(config: Partial<CSSForgeConfig>) {
  type Input = readonly [string, CssValue];

  function createNestedObject(path: string[], value: CssValue | ForgeValue): ForgeValue {
    if (path.length === 0) {
      return value as ForgeValue;
    }
    // Take the first segment of the path
    const [currentKey, ...remainingPath] = path;

    // Recursively build the nested object
    return {
      [currentKey]: createNestedObject(remainingPath, value),
    };
  }

  function createForgeValuesFromKeys(input: Input[]): ForgeValue {
    // Reduce the input array into a single merged object
    return input.reduce((acc, [pathString, cssValues]) => {
      // Split the path string into segments
      const pathSegments = pathString.split(".");

      // Create a nested object for this input
      const nestedObject = createNestedObject(pathSegments, cssValues);

      // Deep merge the new object with the accumulator
      return deepMerge(acc, nestedObject);
    }, {} as ForgeValue);
  }

  const forge = {
    colors: config.colors ? processColors(config.colors) : undefined,
    spacing: config.spacing ? processSpacing(config.spacing) : undefined,
    typography: config.typography ? processTypography(config.typography) : undefined,
    primitives: config.primitives
      ? processPrimitives({
        primitives: config.primitives,
        colors: config.colors,
        typography: config.typography,
        spacing: config.spacing,
      })
      : undefined,
  };
  const jsonKeys = [];
  for (const [_, value] of Object.entries(forge)) {
    if (value) {
      const mapArray = [...value.resolveMap.entries()];
      jsonKeys.push(...mapArray);
    }
  }
  const forgeValues = createForgeValuesFromKeys(jsonKeys);
  return forgeValues;
}

export function generateJSON(config: Partial<CSSForgeConfig>): string {
  const forgeValues = createForgeValues(config);
  return JSON.stringify(forgeValues, null, 2);
}

export function generateTS(config: Partial<CSSForgeConfig>): string {
  const forgeValues = createForgeValues(config);
  const forgeValuesString = JSON.stringify(forgeValues, null, 2);
  return `export const cssForge = ${forgeValuesString} as const;`;
}

export function generateCSS(config: Partial<CSSForgeConfig>): string {
  const chunks: string[] = ["/*____ CSSForge ____*/", ":root {"];
  const processedConfig: {
    [key: string]: { css: string; resolveMap: ResolveMap } | undefined;
  } = {};

  // Process colors if present
  if (config.colors) {
    processedConfig.colors = processColors(config.colors);
    if (processedConfig.colors) {
      chunks.push("/*____ Colors ____*/");
      chunks.push(processedConfig.colors.css);
    }
  }

  // Process spacing if present
  if (config.spacing) {
    processedConfig.spacing = processSpacing(config.spacing);
    if (processedConfig.spacing) {
      chunks.push("/*____ Spacing ____*/");
      chunks.push(processedConfig.spacing.css);
    }
  }

  // Process Typography if present
  if (config.typography) {
    processedConfig.typography = processTypography(config.typography);
    if (processedConfig.typography) {
      chunks.push("/*____ Typography ____*/");
      chunks.push(processedConfig.typography.css);
    }
  }

  if (config.primitives) {
    const primitiveVars = processPrimitives({
      primitives: config.primitives,
      colors: config.colors,
      typography: config.typography,
      spacing: config.spacing,
    });
    if (primitiveVars) {
      chunks.push("/*____ Primitives ____*/");
      chunks.push(primitiveVars.css);
    }
  }

  chunks.push("}");
  // Join all chunks with double newline for readability
  return chunks.join("\n");
}
