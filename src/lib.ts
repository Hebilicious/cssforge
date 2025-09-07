export type ResolveMap = Map<
  string,
  { key: string; value: string; variable: string }
>;

export interface Output {
  css: string;
  resolveMap: ResolveMap;
}

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
