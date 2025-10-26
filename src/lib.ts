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
  /** The generated CSS strings. */
  css: { root?: string; outside?: string };
  /** A map for resolving variable paths. */
  resolveMap: ResolveMap;
}

export interface Variables {
  [key: string]: string;
}

interface Modules {
  colors?: Output | null;
  typography?: Output | null;
  spacing?: Output | null;
}

interface ResolveVariableParams extends Modules {
  varPath: string;
}

interface GetResolvedVariablesMapParams extends Modules {
  variables: Variables | undefined;
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
function resolveVariable(
  { varPath, colors, typography, spacing }: ResolveVariableParams,
) {
  const path = varPath.split(".");
  const module = path[0];
  //TODO: Make this configurable
  const keyMap = {
    palette: "palette",
    gradients: "gradients",
    theme: "theme",
    typography: "typography",
    typography_fluid: "typography_fluid",
    spacing: "spacing",
    spacing_fluid: "spacing_fluid",
  };
  switch (module) {
    case keyMap.palette:
    case keyMap.gradients:
    case keyMap.theme: {
      if (!colors) throw new Error("The colors object must be passed.");
      const result = colors.resolveMap.get(varPath);
      if (!result) {
        throw new Error(
          `The color path ${varPath} could not be resolved. Map contains ${
            Array.from(colors.resolveMap.keys()).map((key) => `\n${key}`)
          }`,
        );
      }
      return result.key;
    }
    case keyMap.typography_fluid:
    case keyMap.typography: {
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
    case keyMap.spacing:
    case keyMap.spacing_fluid: {
      if (!spacing) throw new Error("The spacing object must be passed.");
      const result = spacing.resolveMap.get(varPath);
      if (!result) {
        throw new Error(
          `The spacing path ${varPath} could not be resolved.  Map contains ${
            Array.from(spacing.resolveMap.keys()).map((key) => `\n${key}`)
          }`,
        );
      }
      return result.key;
    }
    default:
      throw new Error(`${module} is not implemented and can't be resolved.`);
  }
}

/**
 * Generates a map of resolved CSS variable names from a variables object.
 * It uses the provided modules (colors, typography, spacing) to resolve the paths.
 */
export const getResolvedVariablesMap = (
  { variables, ...params }: GetResolvedVariablesMapParams,
): Map<`--${string}`, string> => {
  const resolvedVariables = variables
    ? Object.entries(variables).map(
      ([varKey, varPath]) => {
        const resolved = resolveVariable({ varPath, ...params });
        return [`--${varKey}`, resolved] as const;
      },
    )
    : [];

  const resolvedMap = new Map(resolvedVariables);
  return resolvedMap;
};

/**
 * Resolves a CSS variable value using a map of variable paths.
 * It replaces occurrences of `var(--key)` in the value with the corresponding
 * CSS variable from the map.
 */
export const resolveValue = (
  { map, value }: { map: Map<string, string>; value: string },
) =>
  value.replace(
    /var\(--(\w+)\)/g,
    (_, key: string) => `var(${map.get(`--${key}`) ?? `--${key}`})`,
  );
