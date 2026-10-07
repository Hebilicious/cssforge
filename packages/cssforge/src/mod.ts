/**
 * This module provides the core functionalities of CSSForge, a tool for generating
 * CSS variables from a configuration file. It exports functions for processing
 * different aspects of a design system, such as colors, typography, spacing, and motion,
 * as well as the main function to generate the final CSS.
 *
 * @module
 */

import type { CSSForgeConfig } from "./config.ts";
import { defineConfig } from "./config.ts";
import { generateCSS, generateStyleDictionaryJSON, getDiagnostics } from "./generator.ts";
import { InvalidNameError } from "./helpers.ts";
import { loadConfig } from "./loader.ts";
import { processColors } from "./modules/colors.ts";
import { goodCssEasings, processMotion } from "./modules/motion.ts";
import { processPrimitives } from "./modules/primitive.ts";
import { processSpacing } from "./modules/spacing.ts";
import { processTypography } from "./modules/typography.ts";
/**
 * The main configuration object for CSSForge.
 */
export type { CSSForgeConfig };
export type { StyleDictionaryJSONOptions } from "./generator.ts";
export type {
	ColorFormat,
	Diagnostic,
	DiagnosticCode,
	GenerateOptions,
	HexColorValues,
	RgbColorValues,
	TokenColorFormats,
} from "./lib.ts";
export type { LoadedConfig } from "./loader.ts";
export type {
	ColorFormatConfig,
	ColorMix,
	ColorSettings,
	ColorThemesSettings,
	HexFormatOutputs,
	LightDarkColorScheme,
	LightDarkSettings,
	PaletteColorSettings,
	RgbFormatOutputs,
} from "./modules/colors.ts";
export type { MotionConfig, MotionDurationSettings } from "./modules/motion.ts";

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
	 * Generates a Style Dictionary-readable JSON string from a CSSForge configuration.
	 * @param config The CSSForge configuration.
	 * @returns The generated Style Dictionary-readable JSON string.
	 */
	generateStyleDictionaryJSON,
	/**
	 * Reports the build warnings for a CSSForge configuration. Warnings never
	 * fail generation; a configuration that cannot be generated throws instead.
	 * @param config The CSSForge configuration.
	 * @param options The generation options.
	 * @returns The diagnostics, in module order.
	 */
	getDiagnostics,
	/**
	 * The two easing curves good-css recommends for UI motion, to spread into an
	 * easing group's `value`. They are not added unless a config spreads them.
	 * @example
	 * ```ts
	 * defineConfig({ motion: { easing: { ui: { value: { ...goodCssEasings } } } } });
	 * ```
	 */
	goodCssEasings,
	/**
	 * Thrown when a configuration name cannot produce a valid CSS custom property
	 * name or reference. Catch it with `instanceof` to handle a name validation
	 * failure by type instead of matching `error.name`.
	 * @example
	 * ```ts
	 * try {
	 *   generateCSS(config);
	 * } catch (error) {
	 *   if (error instanceof InvalidNameError) {
	 *     // report the offending configuration path
	 *   }
	 * }
	 * ```
	 */
	InvalidNameError,
	/**
	 * Loads a CSS Forge configuration file and reports the local files it
	 * loaded, so CLI watch mode and bundler plugins can watch them.
	 * @param configPath Path to the configuration file.
	 * @returns The configuration and its local dependencies.
	 */
	loadConfig,
	/**
	 * Processes the colors section of the configuration.
	 * @param colors The colors configuration.
	 * @returns A map of CSS variables for colors.
	 */
	processColors,
	/**
	 * Processes the motion section of the configuration.
	 * @param motion The motion configuration.
	 * @returns A map of CSS variables for motion, and its build warnings.
	 */
	processMotion,
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
