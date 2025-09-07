/**
 * A map where keys are dot-separated paths and values are objects
 * containing the CSS variable key, its value, and the full variable declaration.
 */
export type ResolveMap = Map<
  string,
  { key: string; value: string; variable: string }
>;

/**
 * Represents the output of a processing function, containing the generated
 * CSS and a resolve map.
 */
export interface Output {
  /** The generated CSS string. */
  css: string;
  /** A map for resolving variable paths. */
  resolveMap: ResolveMap;
}

/**
 * Resolves a variable path to its corresponding CSS variable name.
 * This function is used to resolve references to other design tokens.
 * @example
 * ```ts
 * const colors = {
 *  css: "--color-red-100: oklch(62.796% 0.25768 29.23388);",
 *  resolveMap: new Map([["colors.palette.value.red.100", { key: "--color-red-100", value: "oklch(62.796% 0.25768 29.23388)", variable: "--color-red-100: oklch(62.796% 0.25768 29.23388);" }]])
 * };
 * const varPath = "colors.palette.value.red.100";
 * const resolved = resolveVariable({ varPath, colors });
 * // resolved: "--color-red-100"
 * ```
 */
export function resolveVariable(
  { varPath, colors, typography, spacing }: {
    varPath: string;
    colors?: Output | null;
    typography?: Output | null;
    spacing?: Output | null;
  },
) {
  const path = varPath.split(".");
  const module = path[0];

  switch (module) {
    case "colors": {
      if (!colors) throw new Error("The colors object must be passed.");
      const result = colors.resolveMap.get(varPath);
      if (!result) {
        throw new Error(`The color path ${varPath} could not be resolved.`);
      }
      return result.key;
    }
    case "typography": {
      if (!typography) throw new Error("The typography object must be passed.");
      const result = typography.resolveMap.get(varPath);
      if (!result) {
        throw new Error(
          `The typography path ${varPath} could not be resolved. Map contains ${
            Array.from(typography.resolveMap.keys()).map((key) => `\n${key}`)
          }`,
        );
      }
      return result.key;
    }
    case "spacing": {
      if (!spacing) throw new Error("The spacing object must be passed.");
      const result = spacing.resolveMap.get(varPath);
      if (!result) {
        throw new Error(`The spacing path ${varPath} could not be resolved.`);
      }
      return result.key;
    }
    default:
      throw new Error(`${module} is not implemented and can't be resolved.`);
  }
}
