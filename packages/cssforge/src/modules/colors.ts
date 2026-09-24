import Color from "colorjs.io";
import { InvalidNameError, validateName, validateVariableAliases } from "../helpers.ts";
import type { Variables } from "../lib.ts";
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
 * The wrapper chain a declaration is emitted into, canonicalized: the color's
 * at-rule and selector with surrounding whitespace removed, and an explicit
 * `:root` selector dropped because a `:root` selector block and the implicit
 * `:root` block declare the same properties on the same element.
 *
 * This is the single reading of `WithCondition` in this module: the scope
 * identity that feeds collision detection and the fallback wrapper chain both
 * consume it, so a fallback always mirrors a declaration from the same scope.
 */
const resolveWrapperChain = (settings: WithCondition | undefined) => {
	const atRule = settings?.atRule?.trim() ?? "";
	const rawSelector = settings?.selector?.trim() ?? "";

	return { atRule, selector: rawSelector === ROOT_SCOPE ? "" : rawSelector };
};

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
	const { atRule, selector } = resolveWrapperChain(settings);

	if (!atRule && !selector) return ROOT_SCOPE;
	return `${atRule}|${selector}`;
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
 * Syntax used for the fallback declaration emitted for browsers without
 * `oklch()` support. `"hex"` writes `#rrggbb`, or `#rrggbbaa` for a color with
 * alpha. `"rgb"` writes `rgb(r g b)`, or `rgb(r g b / a)` for a color with alpha.
 */
export type ColorFallbackFormat = "hex" | "rgb";

/**
 * Settings for the sRGB fallback that keeps a color usable where `oklch()` is
 * not supported.
 */
export interface ColorFallbackSettings {
	/**
	 * Emit an sRGB fallback declaration for every color, so a browser without
	 * `oklch()` support still renders the palette. The fallback is gated by
	 * `@supports not (color: oklch(0% 0 0))` and emitted after the generated
	 * root block, because a custom property accepts any token stream and the
	 * later declaration wins wherever the modern value is unsupported.
	 *
	 * Set it on the palette to cover every color, and on a single color to
	 * override it or opt out with `false`.
	 *
	 * @example
	 * ```ts
	 * colors: {
	 *   palette: {
	 *     value: { coral: { 100: { hex: "#FF7F50" } } },
	 *     settings: { fallback: "hex" },
	 *   },
	 * }
	 * ```
	 */
	fallback?: ColorFallbackFormat | false;
}

/**
 * Settings for palette colors, including optional conditions like media queries.
 */
export interface PaletteColorSettings extends WithCondition, ColorFallbackSettings {}

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
		settings?: ColorFallbackSettings;
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

const getPaletteColorConfig = (entry: PaletteColorEntry): PaletteColorConfig => {
	if (isRecord(entry) && isRecord(entry.value) && !isColorValueObject(entry.value)) {
		return entry as unknown as PaletteColorConfig;
	}

	return { value: entry as unknown as ColorVariants };
};

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
 * Serializers for the supported fallback formats. The accepted formats and the
 * syntax they emit come from this one table, so a format cannot be validated
 * without also being implemented.
 */
const fallbackSerializers: Record<
	ColorFallbackFormat,
	(red: number, green: number, blue: number, alpha: number) => string
> = {
	hex: (red, green, blue, alpha) =>
		`#${toHexByte(red)}${toHexByte(green)}${toHexByte(blue)}${
			alpha === 1 ? "" : toHexByte(Math.round(alpha * 255))
		}`,
	rgb: (red, green, blue, alpha) =>
		`rgb(${red} ${green} ${blue}${alpha === 1 ? "" : ` / ${Number(alpha.toFixed(3))}`})`,
};

const isFallbackFormat = (value: unknown): value is ColorFallbackFormat =>
	typeof value === "string" && Object.hasOwn(fallbackSerializers, value);

/**
 * Converts a color value to the sRGB syntax a browser without `oklch()` support
 * can render.
 *
 * The conversion uses the CSS gamut mapping algorithm, which is how a browser
 * maps an out-of-gamut `oklch()` color, so a saturated fallback stays as close
 * to the modern value as sRGB allows.
 *
 * @example
 * ```ts
 * colorValueToFallback({ hex: "#ff7f50" }, "hex"); // "#ff7f50"
 * colorValueToFallback({ hex: "#ff7f50" }, "rgb"); // "rgb(255 127 80)"
 * ```
 */
function colorValueToFallback(
	value: ColorValueOrString,
	format: ColorFallbackFormat,
): string {
	const colorString = typeof value === "string" ? value : getColorString(value);
	const mapped = new Color(colorString).to("srgb").toGamut();
	const alpha = Math.min(Math.max(Number.isNaN(mapped.alpha) ? 1 : mapped.alpha, 0), 1);
	const [red, green, blue] = mapped.coords.map(toChannelByte);

	return fallbackSerializers[format](red, green, blue, alpha);
}

/**
 * Rejects a fallback setting that is neither a supported format nor `false`.
 * The value comes from a JavaScript object at runtime, so a typo would
 * otherwise generate no fallback and fail silently.
 */
function validateFallbackSetting(value: unknown, path: string): void {
	if (value === undefined || value === false || isFallbackFormat(value)) return;

	throw new Error(
		`Invalid fallback format at configuration path "${path}": ${JSON.stringify(
			value,
		)}. Use "hex", "rgb", or false.`,
	);
}

/**
 * Resolves the fallback format for one palette color. A color's own setting wins
 * over the palette setting, and `false` opts out of an inherited fallback.
 */
const resolveFallbackFormat = (
	settings: ColorFallbackSettings | undefined,
	paletteSettings: ColorFallbackSettings | undefined,
): ColorFallbackFormat | undefined => {
	const fallback = settings?.fallback ?? paletteSettings?.fallback;
	return isFallbackFormat(fallback) ? fallback : undefined;
};

/**
 * The wrapper chain a fallback declaration is emitted into. The `@supports`
 * condition sits between the color's own at-rule and its selector, mirroring the
 * chain of the declaration it overrides, and an unnamed selector falls back to
 * `:root`, which is where the overridden declaration lives.
 */
const fallbackWrappers = (settings: WithCondition | undefined): string[] => {
	const { atRule, selector } = resolveWrapperChain(settings);

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
export function processColors(colors: ColorConfig): Output {
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

		const hasSelector = Boolean(settings?.selector);
		const hasAtRule = Boolean(settings?.atRule);

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
				if (!settings) return;
				if (hasSelector && hasAtRule) {
					outsideOutput.push(initialComment);
					outsideOutput.push(`${settings.atRule} {`);
					outsideOutput.push(`  ${settings.selector} {`);
					outsideOutput.push(...innerComments.map((c) => `    ${c}`));
					outsideOutput.push(...vars.map((v) => `    ${v}`));
					outsideOutput.push(`  }`);
					outsideOutput.push(`}`);
					return;
				}

				if (hasSelector) {
					outsideOutput.push(initialComment);
					outsideOutput.push(`${settings.selector} {`);
					outsideOutput.push(...innerComments.map((c) => `  ${c}`));
					outsideOutput.push(...vars.map((v) => `  ${v}`));
					outsideOutput.push(`}`);
					return;
				}

				if (hasAtRule) {
					rootOutput.push(initialComment);
					rootOutput.push(`${settings.atRule} {`);
					rootOutput.push(...innerComments.map((c) => `  ${c}`));
					rootOutput.push(...vars.map((v) => `  ${v}`));
					rootOutput.push(`}`);
					return;
				}
			},
		};
	}

	validateFallbackSetting(colors.palette.settings?.fallback, "palette.settings");

	for (const [colorName, colorConfig] of Object.entries(colors.palette.value)) {
		validateName(colorName, `palette.${colorName}`);

		const normalizedColorConfig = getPaletteColorConfig(colorConfig);
		// Validated before the try block: a configuration mistake has to fail
		// loudly instead of being logged and skipped per color.
		validateFallbackSetting(
			normalizedColorConfig.settings?.fallback,
			`palette.${colorName}.settings`,
		);
		const fallbackFormat = resolveFallbackFormat(
			normalizedColorConfig.settings,
			colors.palette.settings,
		);
		const fallback = fallbackFormat
			? {
					format: fallbackFormat,
					group: getFallbackGroup(normalizedColorConfig.settings),
				}
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
				const fallbackValue = fallback
					? colorValueToFallback(colorValue, fallback.format)
					: undefined;
				if (fallbackValue) fallback?.group.declarations.push(`${key}: ${fallbackValue};`);

				handler.pushVariable(variable);

				resolveMap.set(
					`${moduleKey}.${colorName}.${variantId}`,
					withTokenScope(
						{
							key,
							value,
							variable,
							...(fallbackValue ? { fallback: fallbackValue } : {}),
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
