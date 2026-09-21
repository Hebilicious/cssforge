import type { ColorConfig } from "./modules/colors.ts";
import type { PrimitiveConfig } from "./modules/primitive.ts";
import type { SpacingConfig } from "./modules/spacing.ts";
import type { TypographyConfig } from "./modules/typography.ts";

/**
 * Reporting options for the diagnostics CSS Forge emits alongside generation.
 */
export interface DiagnosticsConfig {
	/**
	 * Configuration paths whose scope diagnostics are not reported. A consumer
	 * path silences every scope diagnostic for that token; `"*"` silences all of
	 * them. Use it for a reference that is deliberately resolved outside the
	 * generated stylesheet.
	 */
	suppress?: string[];
}

/**
 * The main configuration object for CSSForge.
 */
export interface CSSForgeConfig {
	/**
	 * Color configuration, including palettes, gradients, and themes.
	 */
	colors: ColorConfig;
	/**
	 * Typography configuration, including type scales and weights.
	 */
	typography: TypographyConfig;
	/**
	 * Spacing configuration for creating spacing scales.
	 */
	spacing: SpacingConfig;
	/**
	 * Primitive configuration for creating custom design tokens.
	 */
	primitives: PrimitiveConfig;
	/**
	 * Diagnostics reporting options.
	 */
	diagnostics?: DiagnosticsConfig;
}

/**
 * Define a CSSForge configuration.
 * @example
 * ```ts
 *  export default defineConfig(
    {
      spacing: {
        size: {
          value: {
            1: "0.25rem",
            2: "0.5rem",
            3: "0.75rem",
            4: "1rem",
          },
        },
      },
      typography: {
        fluid: {
          base: {
            value: {
              minWidth: 320,
              minFontSize: 14,
              minTypeScale: 1.25,
              maxWidth: 1435,
              maxFontSize: 16,
              maxTypeScale: 1.25,
              positiveSteps: 5,
              negativeSteps: 3,
            },
          },
        },
        weight: {
          arial: { value: { regular: "400", bold: "700" } },
        },
      },
      colors: {
        palette: {
          value: {
            coral: {
              100: { hex: "#FF7F50" },
            },
            mint: {
              100: { hex: "#4ADE80" },
            },
            indigo: {
              100: { hex: "#4F46E5" },
            },
          },
        },
      },
    },
  );
 * ```
 */
export function defineConfig<C extends Partial<CSSForgeConfig>>(config: C): C {
	return config as C;
}
