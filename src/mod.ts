import { generateCSS } from "./generator.ts";
import { defineConfig } from "./config.ts";
import { processColors } from "./modules/colors.ts";
import { processTypography } from "./modules/typography.ts";
import { processPrimitives } from "./modules/primitive.ts";
import { processSpacing } from "./modules/spacing.ts";

import type { CSSForgeConfig } from "./config.ts";
export type { CSSForgeConfig };

export {
  defineConfig,
  generateCSS,
  processColors,
  processPrimitives,
  processSpacing,
  processTypography,
};
