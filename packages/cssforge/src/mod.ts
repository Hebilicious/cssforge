/**
 * This module provides the core functionalities of CSSForge, a tool for generating
 * CSS variables from a configuration file. It exports functions for processing
 * different aspects of a design system, such as colors, typography, and spacing,
 * as well as the main function to generate the final CSS.
 *
 * @module
 */

import type { CSSForgeConfig } from "./config.ts";
import { defineConfig } from "./config.ts";
import { generateCSS } from "./generator.ts";
import { processColors } from "./modules/colors.ts";
import { processPrimitives } from "./modules/primitive.ts";
import { processSpacing } from "./modules/spacing.ts";
import { processTypography } from "./modules/typography.ts";
/**
 * The main configuration object for CSSForge.
 */
export type { CSSForgeConfig };

export {
	/**
	 * A helper function to define the CSSForge configuration with type inference.
	 * @param config The CSSForge configuration.
	 * @returns The configuration object.
	 */
	defineConfig,
	/**
	 * Generates the CSS string from a CSSForge configuration.
	 * @param config The CSSForge configuration.
	 * @returns The generated CSS string.
	 */
	generateCSS,
	/**
	 * Processes the colors section of the configuration.
	 * @param colors The colors configuration.
	 * @returns A map of CSS variables for colors.
	 */
	processColors,
	/**
	 * Processes the primitives section of the configuration.
	 * @param primitives The primitives configuration.
	 * @returns A map of CSS variables for primitives.
	 */
	processPrimitives,
	/**
	 * Processes the spacing section of the configuration.
	 * @param spacing The spacing configuration.
	 * @returns A map of CSS variables for spacing.
	 */
	processSpacing,
	/**
	 * Processes the typography section of the configuration.
	 * @param typography The typography configuration.
	 * @returns A map of CSS variables for typography.
	 */
	processTypography,
};
