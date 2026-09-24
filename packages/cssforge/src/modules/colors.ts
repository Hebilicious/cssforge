import Color from "colorjs.io";
import { InvalidNameError, validateName, validateVariableAliases } from "../helpers.ts";
import type { ColorFormat, TokenColorFormats, Variables } from "../lib.ts";
import {
	getReferencePaths,
	getResolvedVariablesMap,
	type Output,
	type ResolveMap,
	ROOT_SCOPE,
	resolveValue,
	withTokenScope,
} from "../lib.ts";

/**
 * The color's own `atRule` and `selector`, with surrounding whitespace removed.
 * This is the module's single reading of `WithCondition`: the declaration
 * emitter, the scope identity that feeds collision detection, and the fallback
 * emitter all consume it, so a fallback always mirrors a declaration emitted
 * into the same chain. An empty chain means the declaration lands in `:root`.
 */
const readCondition = (settings: WithCondition | undefined) => ({
	atRule: settings?.atRule?.trim() ?? "",
	selector: settings?.selector?.trim() ?? "",
});

/**
 * Describes the wrapper chain a declaration is emitted into. `selector` and
 * `atRule` are both part of the identity, because two declarations only
 * overwrite each other when they share the same wrapper chain. With no wrapper
 * the declaration lands in `:root`.
 *
 * An explicit `selector: ":root"` is canonicalized to the root scope, because a
 * `:root` selector block and the implicit `:root` block declare the same
 * properties on the same element. `{ atRule, selector: ":root" }` therefore has
 * the same scope as that atRule alone.
 */
const describeScope = (settings: WithCondition | undefined): string => {
	const { atRule, selector } = readCondition(settings);
	const scopedSelector = selector === ROOT_SCOPE ? "" : selector;

	if (!atRule && !scopedSelector) return ROOT_SCOPE;
	return `${atRule}|${scopedSelector}`;
};

type ExactlyOne<T> = {
	[K in keyof T]: {
		[P in K]: T[P];
	} & {
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
	 * CSS selector to wrap variables in (e.g., ".MyClass"). This will be extracted out of the root.
	 */
	selector?: string;
	/**
	 * CSS at-rule to wrap variables in (e.g., "@supports (display: grid)")
	 */
	atRule?: string;
}
/**
 * A color value format emitted alongside the generated `oklch()` value.
 * `"hex"` writes `#rrggbb`, or `#rrggbbaa` for a color with alpha. `"rgb"`
 * writes `rgb(r g b)`, or `rgb(r g b / a)` for a color with alpha.
 */
export type { ColorFormat } from "../lib.ts";

/**
 * Settings for the extra color formats generated next to `oklch()`.
 */
export interface ColorFormatConfig {
	/**
	 * Formats to generate alongside `oklch()`, in order. A CSS declaration
	 * cannot hold two values, so the first format is the one emitted for
	 * browsers without `oklch()` support, gated by
	 * `@supports not (color: oklch(0% 0 0))`. The JSON, TypeScript and Style
	 * Dictionary tokens carry every requested format.
	 *
	 * The palette setting covers every color; a color overrides it in its own
	 * `settings`, and `[]` or `false` opts out of an inherited value.
	 *
	 * @example
	 * ```ts
	 * colors: {
	 *   palette: {
	 *     value: { coral: { 100: { hex: "#FF7F50" } } },
	 *     settings: { color: { formats: ["hex", "rgb"] } },
	 *   },
	 * }
	 * ```
	 */
	formats?: readonly ColorFormat[] | false;
}

/**
 * Settings for the color values themselves, shared by the palette and its
 * colors.
 */
export interface ColorSettings {
	/** Extra color formats generated alongside `oklch()`. */
	color?: ColorFormatConfig;
}

/**
 * Settings for palette colors, including optional conditions like media queries.
 */
export interface PaletteColorSettings extends WithCondition, ColorSettings {}

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

type PaletteColorEntry = PaletteColorConfig | ColorVariants;

/**
 * A palette of colors, organized by name and variants.
 */
export interface ColorPalette {
	[key: string]: PaletteColorEntry;
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
		/**
		 * Settings shared by every palette color. A color's own settings take
		 * precedence.
		 */
		settings?: ColorSettings;
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
	theme?:
		| {
				[themeName: string]: ThemeConfig;
		  }
		| {
				value: {
					[themeName: string]: ThemeConfig | ThemeConfig["value"];
				};
		  };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const isColorValueObject = (value: unknown): value is ColorValue =>
	isRecord(value) &&
	("hex" in value || "rgb" in value || "hsl" in value || "oklch" in value);

/**
 * Whether a palette entry is written in the explicit form, with a `value` map
 * and optional `settings`, rather than as a bare map of variants.
 */
const isPaletteColorConfig = (entry: PaletteColorEntry): entry is PaletteColorConfig =>
	isRecord(entry) && isRecord(entry.value) && !isColorValueObject(entry.value);

const getPaletteColorConfig = (entry: PaletteColorEntry): PaletteColorConfig =>
	isPaletteColorConfig(entry) ? entry : { value: entry as unknown as ColorVariants };

const getThemeConfig = (theme: ColorConfig["theme"]): ColorTheme | undefined => {
	if (!theme) return undefined;
	const themes = "value" in theme ? theme.value : theme;
	return Object.fromEntries(
		Object.entries(themes).map(([themeName, themeConfig]) => [
			themeName,
			"value" in themeConfig
				? themeConfig
				: { value: themeConfig as ThemeConfig["value"] },
		]),
	);
};

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
			: (value.rgb as string);
	}

	if ("hsl" in value) {
		return Array.isArray(value.hsl)
			? `hsl(${value.hsl[0]}deg ${value.hsl[1]}% ${value.hsl[2]}%)`
			: (value.hsl as string);
	}

	if ("oklch" in value) {
		return Array.isArray(value.oklch)
			? `oklch(${(value.oklch as number[]).join(" ")})`
			: (value.oklch as string);
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

	const parsedCoords = oklchColor.coords.map((coord) =>
		Number.isNaN(coord) ? 0 : coord,
	);
	const l = Number(parsedCoords[0].toFixed(5));
	const c = Number(parsedCoords[1].toFixed(5));
	const h = Number(parsedCoords[2].toFixed(5));
	const alpha =
		oklchColor.alpha === 1 ? "" : ` / ${Number(oklchColor.alpha.toFixed(3)) * 100}%`;
	return `oklch(${Number((l * 100).toFixed(3))}% ${c} ${h}${alpha})`;
}

/**
 * The condition every fallback declaration is gated by. A browser without
 * `oklch()` support parses the feature as unsupported, so the negation matches
 * there and only there.
 */
const OKLCH_SUPPORT_CONDITION = "@supports not (color: oklch(0% 0 0))";

const toChannelByte = (coord: number) =>
	Math.round(Math.min(Math.max(Number.isNaN(coord) ? 0 : coord, 0), 1) * 255);

const toHexByte = (byte: number) => byte.toString(16).padStart(2, "0");

/**
 * Serializers for the supported color formats. The accepted formats and the
 * syntax they emit come from this one table, so a format cannot be validated
 * without also being implemented.
 */
const colorFormatSerializers: Record<
	ColorFormat,
	(red: number, green: number, blue: number, alpha: number) => string
> = {
	hex: (red, green, blue, alpha) =>
		`#${toHexByte(red)}${toHexByte(green)}${toHexByte(blue)}${
			alpha === 1 ? "" : toHexByte(Math.round(alpha * 255))
		}`,
	rgb: (red, green, blue, alpha) =>
		`rgb(${red} ${green} ${blue}${alpha === 1 ? "" : ` / ${Number(alpha.toFixed(3))}`})`,
};

/** Every accepted color format, in the order error messages and the CLI list them. */
export const supportedColorFormats = Object.keys(colorFormatSerializers) as ColorFormat[];

/** Whether a runtime value is one of the accepted color formats. */
export const isColorFormat = (value: unknown): value is ColorFormat =>
	typeof value === "string" && Object.hasOwn(colorFormatSerializers, value);

/**
 * Converts a color value to the sRGB syntax of one format, which is what a
 * browser without `oklch()` support can render.
 *
 * The conversion uses the CSS gamut mapping algorithm, which is how a browser
 * maps an out-of-gamut `oklch()` color, so a saturated value stays as close to
 * the modern one as sRGB allows.
 *
 * @example
 * ```ts
 * colorValueToFormat({ hex: "#ff7f50" }, "hex"); // "#ff7f50"
 * colorValueToFormat({ hex: "#ff7f50" }, "rgb"); // "rgb(255 127 80)"
 * ```
 */
function colorValueToFormat(value: ColorValueOrString, format: ColorFormat): string {
	const colorString = typeof value === "string" ? value : getColorString(value);
	const mapped = new Color(colorString).to("srgb").toGamut();
	const alpha = Math.min(Math.max(Number.isNaN(mapped.alpha) ? 1 : mapped.alpha, 0), 1);
	const [red, green, blue] = mapped.coords.map(toChannelByte);

	return colorFormatSerializers[format](red, green, blue, alpha);
}

/**
 * Converts a color value to every requested format, in the requested order.
 */
const colorValueToFormats = (
	value: ColorValueOrString,
	formats: readonly ColorFormat[],
): TokenColorFormats =>
	Object.fromEntries(
		formats.map((format) => [format, colorValueToFormat(value, format)]),
	) as TokenColorFormats;

/** The accepted formats as the configuration errors list them. */
const colorFormatList = supportedColorFormats.map((format) => `"${format}"`).join(", ");

/**
 * Reads the configured formats from one level's `color` settings, rejecting a
 * shape generation would otherwise ignore.
 */
function readColorFormats(
	settings: unknown,
	path: string,
): readonly ColorFormat[] | false {
	if (settings === undefined) return false;
	if (!isRecord(settings)) {
		throw new Error(`Invalid configuration at "${path}": settings must be an object.`);
	}

	const color = settings.color;
	if (color === undefined) return false;
	if (!isRecord(color)) {
		throw new Error(`Invalid configuration at "${path}.color": color must be an object.`);
	}

	const formats = color.formats;
	if (formats === undefined || formats === false) return false;
	if (!Array.isArray(formats)) {
		throw new Error(
			`Invalid configuration at "${path}.color.formats": expected an array of formats such as ["hex"], or false.`,
		);
	}

	for (const format of formats) {
		if (!isColorFormat(format)) {
			throw new Error(
				`Invalid color format at configuration path "${path}.color.formats": ${JSON.stringify(
					format,
				)}. Use ${colorFormatList}.`,
			);
		}
	}

	return formats as readonly ColorFormat[];
}

/**
 * Validates the color settings of one palette level, which is where the extra
 * formats belong. The values come from a JavaScript object at runtime, so a
 * setting generation would ignore has to fail loudly instead of quietly
 * producing no extra format.
 *
 * `entry` is the palette or the palette color itself, so a format written one
 * level too high is reported with the path that holds it.
 */
function validateColorSettings(entry: object, settings: unknown, path: string): void {
	if ("color" in entry) {
		throw new Error(
			`Invalid configuration at "${path}": "color" belongs inside "${path}.settings".`,
		);
	}
	if ("formats" in entry) {
		throw new Error(
			`Invalid configuration at "${path}": "formats" belongs inside "${path}.settings.color".`,
		);
	}
	if (isRecord(settings) && "formats" in settings) {
		throw new Error(
			`Invalid configuration at "${path}.settings": "formats" belongs inside "${path}.settings.color".`,
		);
	}

	readColorFormats(settings, `${path}.settings`);
}

/**
 * Resolves the formats generated for one palette color: the color's own list
 * wins over the palette's, `false` and `[]` opt out of an inherited list, and
 * the formats a caller adds are appended.
 */
const resolveColorFormats = (
	settings: ColorSettings | undefined,
	paletteSettings: ColorSettings | undefined,
	extraFormats: readonly ColorFormat[] = [],
): ColorFormat[] => {
	const configured = settings?.color?.formats ?? paletteSettings?.color?.formats;
	const formats = Array.isArray(configured) ? [...configured] : [];

	return [...new Set([...formats, ...extraFormats])];
};

/**
 * The wrapper chain a fallback declaration is emitted into. The `@supports`
 * condition sits between the color's own at-rule and its selector, mirroring the
 * chain of the declaration it overrides, and an unnamed selector falls back to
 * `:root`, which is where the overridden declaration lives.
 */
const fallbackWrappers = (settings: WithCondition | undefined): string[] => {
	const { atRule, selector } = readCondition(settings);

	return [...(atRule ? [atRule] : []), OKLCH_SUPPORT_CONDITION, selector || ROOT_SCOPE];
};

/**
 * Renders one `@supports` block for every fallback declaration that shares a
 * wrapper chain. The block is emitted at the top level rather than inside the
 * root block, because a browser without `oklch()` support predates CSS nesting
 * and would drop a nested at-rule together with its fallback.
 */
const renderFallbackBlock = (wrappers: string[], declarations: string[]): string[] => {
	// A palette color without variants contributes only its comment, and a block
	// holding no declaration would be empty output.
	if (!declarations.some((line) => line.startsWith("--"))) return [];

	const lines: string[] = [];

	wrappers.forEach((wrapper, index) => {
		lines.push(`${"  ".repeat(index)}${wrapper} {`);
	});
	lines.push(...declarations.map((line) => `${"  ".repeat(wrappers.length)}${line}`));
	for (let index = wrappers.length - 1; index >= 0; index -= 1) {
		lines.push(`${"  ".repeat(index)}}`);
	}

	return lines;
};

/**
 * Extra color formats generated on top of the ones a configuration declares.
 */
export interface ColorFormatOptions {
	/**
	 * Formats added to the configured ones, so a caller such as the CLI
	 * `--color-formats` flag generates them without editing the configuration.
	 */
	colorFormats?: readonly ColorFormat[];
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
export function processColors(
	colors: ColorConfig,
	options: ColorFormatOptions = {},
): Output {
	const rootOutput: string[] = [];
	const outsideOutput: string[] = [];
	const resolveMap: ResolveMap = new Map();
	rootOutput.push(`/* Palette */`);
	const moduleKey = "palette";
	// Fallback declarations are collected per wrapper chain, so colors under the
	// same condition share one `@supports` block. The key is the rendered chain.
	const fallbackGroups = new Map<
		string,
		{ wrappers: string[]; declarations: string[] }
	>();

	const getFallbackGroup = (settings: WithCondition | undefined) => {
		const wrappers = fallbackWrappers(settings);
		const key = wrappers.join("\u0000");
		const existing = fallbackGroups.get(key);
		if (existing) return existing;

		const group = { wrappers, declarations: [] as string[] };
		fallbackGroups.set(key, group);
		return group;
	};

	function conditionalBuilder(
		settings: WithCondition | undefined,
		initialComment: string,
	) {
		const innerComments: string[] = [];
		const vars: string[] = [];

		const { atRule, selector } = readCondition(settings);
		const hasSelector = Boolean(selector);
		const hasAtRule = Boolean(atRule);

		// If no settings provided, emit comment immediately into root output
		if (!hasSelector && !hasAtRule) rootOutput.push(initialComment);

		return {
			/**
			 * The effective wrapper chain these declarations are emitted into, so
			 * callers can record which scope a token belongs to. Declarations
			 * without a wrapper land in `:root`.
			 */
			scope: describeScope(settings),
			addComment(c: string) {
				if (hasSelector || hasAtRule) innerComments.push(c);
				else rootOutput.push(c);
			},
			pushVariable(v: string) {
				if (hasSelector || hasAtRule) vars.push(v);
				else rootOutput.push(v);
			},
			finalize() {
				if (!hasSelector && !hasAtRule) return;
				if (vars.length === 0 && innerComments.length === 0) return;
				if (hasSelector && hasAtRule) {
					outsideOutput.push(initialComment);
					outsideOutput.push(`${atRule} {`);
					outsideOutput.push(`  ${selector} {`);
					outsideOutput.push(...innerComments.map((c) => `    ${c}`));
					outsideOutput.push(...vars.map((v) => `    ${v}`));
					outsideOutput.push(`  }`);
					outsideOutput.push(`}`);
					return;
				}

				if (hasSelector) {
					outsideOutput.push(initialComment);
					outsideOutput.push(`${selector} {`);
					outsideOutput.push(...innerComments.map((c) => `  ${c}`));
					outsideOutput.push(...vars.map((v) => `  ${v}`));
					outsideOutput.push(`}`);
					return;
				}

				if (hasAtRule) {
					rootOutput.push(initialComment);
					rootOutput.push(`${atRule} {`);
					rootOutput.push(...innerComments.map((c) => `  ${c}`));
					rootOutput.push(...vars.map((v) => `  ${v}`));
					rootOutput.push(`}`);
					return;
				}
			},
		};
	}

	validateColorSettings(colors.palette, colors.palette.settings, "palette");

	for (const [colorName, colorConfig] of Object.entries(colors.palette.value)) {
		validateName(colorName, `palette.${colorName}`);

		const normalizedColorConfig = getPaletteColorConfig(colorConfig);
		// Validated before the try block: a configuration mistake has to fail
		// loudly instead of being logged and skipped per color. A color entry
		// written in the shorthand form has no settings to validate, and its
		// keys are variant names that may legitimately include "color".
		if (isPaletteColorConfig(colorConfig)) {
			validateColorSettings(
				colorConfig,
				normalizedColorConfig.settings,
				`palette.${colorName}`,
			);
		}
		const formats = resolveColorFormats(
			normalizedColorConfig.settings,
			colors.palette.settings,
			options.colorFormats,
		);
		// One CSS declaration cannot hold two values, so the first format is the
		// one a browser without `oklch()` support reads.
		const cssFormat = formats.at(0);
		const fallback = cssFormat
			? { cssFormat, group: getFallbackGroup(normalizedColorConfig.settings) }
			: undefined;
		if (fallback) fallback.group.declarations.push(`/* ${colorName} */`);

		try {
			const handler = conditionalBuilder(
				normalizedColorConfig.settings,
				`/* ${colorName} */`,
			);

			for (const [variantId, colorValue] of Object.entries(normalizedColorConfig.value)) {
				validateName(variantId, `palette.${colorName}.${variantId}`);
				const key = `--${moduleKey}-${colorName}-${variantId}`;
				const value = colorValueToOklch(colorValue);
				const variable = `${key}: ${value};`;
				const colorValues =
					formats.length > 0 ? colorValueToFormats(colorValue, formats) : undefined;
				const cssValue = fallback ? colorValues?.[fallback.cssFormat] : undefined;
				if (fallback && cssValue) {
					fallback.group.declarations.push(`${key}: ${cssValue};`);
				}

				handler.pushVariable(variable);

				resolveMap.set(
					`${moduleKey}.${colorName}.${variantId}`,
					withTokenScope(
						{
							key,
							value,
							variable,
							...(colorValues ? { color: colorValues } : {}),
							sourcePath: `${moduleKey}.${colorName}.${variantId}`,
							type: "color",
							tier: "primitive",
						},
						handler.scope,
					),
				);
			}

			handler.finalize();
		} catch (error) {
			if (error instanceof InvalidNameError) throw error;
			console.error(`Error processing color ${colorName}:`, error);
		}
	}

	if (colors.gradients) {
		rootOutput.push(`/* Gradients */`);
		const moduleKey = "gradients";
		const palette = {
			css: { root: rootOutput.join("\n"), outside: outsideOutput.join("\n") },
			resolveMap,
		};

		for (const [gradientName, gradient] of Object.entries(colors.gradients.value)) {
			validateName(gradientName, `gradients.${gradientName}`);
			const handler = conditionalBuilder(gradient.settings, `/* ${gradientName} */`);

			for (const [variantName, { value, variables }] of Object.entries(gradient.value)) {
				validateName(variantName, `gradients.${gradientName}.${variantName}`);
				try {
					validateVariableAliases({
						aliases: variables,
						path: `gradients.${gradientName}.${variantName}`,
					});
					const resolvedMapForGradient = getResolvedVariablesMap({
						variables,
						colors: palette,
					});

					const gradientValue = resolveValue({ map: resolvedMapForGradient, value });
					const referencePaths = getReferencePaths({ value, variables });

					const key = `--${moduleKey}-${gradientName}-${variantName}`;
					const variable = `${key}: ${gradientValue};`;

					handler.pushVariable(variable);

					resolveMap.set(
						`${moduleKey}.${gradientName}.${variantName}`,
						withTokenScope(
							{
								variable,
								key,
								value: gradientValue,
								sourcePath: `${moduleKey}.${gradientName}.${variantName}`,
								...(referencePaths ? { referencePaths } : {}),
								type: "gradient",
								tier: referencePaths ? "semantic" : "primitive",
							},
							handler.scope,
						),
					);
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

	const themes = getThemeConfig(colors.theme);

	if (themes) {
		rootOutput.push(`/* Themes */`);
		const moduleKey = "theme";
		const palette = {
			css: { root: rootOutput.join("\n"), outside: outsideOutput.join("\n") },
			resolveMap,
		};

		for (const [themeName, themeConfig] of Object.entries(themes)) {
			validateName(themeName, `theme.${themeName}`);
			const handler = conditionalBuilder(
				themeConfig.settings,
				`/* Theme: ${themeName} */`,
			);

			try {
				for (const [colorName, colorInTheme] of Object.entries(themeConfig.value)) {
					validateName(colorName, `theme.${themeName}.${colorName}`);
					const colorComment = `/* ${colorName} */`;
					handler.addComment(colorComment);

					validateVariableAliases({
						aliases: colorInTheme.variables,
						path: `theme.${themeName}.${colorName}`,
					});

					const resolvedMap = getResolvedVariablesMap({
						variables: colorInTheme.variables,
						colors: palette,
					});

					const variantNameOnly = colorInTheme.settings?.variantNameOnly ?? false;
					for (const [variantName, variantValue] of Object.entries(colorInTheme.value)) {
						validateName(variantName, `theme.${themeName}.${colorName}.${variantName}`);
						const resolvedValue = resolveValue({
							map: resolvedMap,
							value: variantValue,
						});
						const referencePaths = getReferencePaths({
							value: variantValue,
							variables: colorInTheme.variables,
						});

						const key = variantNameOnly
							? `--${variantName}`
							: `--${moduleKey}-${themeName}-${colorName}-${variantName}`;

						const variable = `${key}: ${resolvedValue};`;

						handler.pushVariable(variable);

						resolveMap.set(
							`${moduleKey}.${themeName}.${colorName}.${variantName}`,
							withTokenScope(
								{
									key,
									value: resolvedValue,
									variable,
									sourcePath: `${moduleKey}.${themeName}.${colorName}.${variantName}`,
									...(referencePaths ? { referencePaths } : {}),
									type: "color",
									tier: referencePaths ? "semantic" : "primitive",
								},
								handler.scope,
							),
						);
					}
				}

				handler.finalize();
			} catch (error) {
				if (error instanceof InvalidNameError) throw error;
				console.error(`Error processing theme ${themeName}:`, error);
			}
		}
	}

	// Emitted last so the fallback overrides the modern declaration it mirrors
	// wherever `oklch()` is unsupported.
	for (const { wrappers, declarations } of fallbackGroups.values()) {
		outsideOutput.push(...renderFallbackBlock(wrappers, declarations));
	}

	const output = {
		css: { root: rootOutput.join("\n"), outside: outsideOutput.join("\n") },
		resolveMap,
	};
	return output;
}
