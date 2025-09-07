import type { ColorConfig } from "./modules/colors.ts";
import type { PrimitiveConfig } from "./modules/primitive.ts";
import type { SpacingConfig } from "./modules/spacing.ts";
import type { TypographyConfig } from "./modules/typography.ts";

export type CSSForgeConfig = {
  colors: ColorConfig;
  typography: TypographyConfig;
  spacing: SpacingConfig;
  primitives: PrimitiveConfig;
};

export function defineConfig<C extends CSSForgeConfig>(
  config: Partial<C>,
): C {
  return config as C;
}
