import Color from "colorjs.io";
import { InvalidNameError, validateName, validateVariableAliases } from "../helpers.ts";
import type {
	ColorFormat,
	HexColorValues,
	RgbColorValues,
	TokenColorFormats,
	Variables,
} from "../lib.ts";
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
 * The values one color format can produce.
 *
 * `hex` writes `#rrggbb` (or `#rrggbbaa` with alpha), the same digits without
 * `#`, and the digits as a 32-bit number in RGBA byte order (`0xff7f50aa`).
 * `rgb` writes `rgb(r g b)` (or `rgb(r g b / a)` with alpha) and the channels as
 * an array, with a fourth element holding the alpha when the color has one.
 */
export interface HexFormatOutputs {
	/** The CSS value, such as `"#ff7f50"`. */
	string?: boolean;
	/** The digits without `#`, such as `"ff7f50"`. */
	digits?: boolean;
	/** The digits as a number, such as `0xff7f50`. */
	number?: boolean;
	/**
	 * Alpha handling for this format. `true` (the default) keeps the alpha the
	 * color carries, a number between 0 and 1 generates the format at that
	 * opacity, and `false` rejects a color that carries alpha, with no alpha
	 * byte in the digits.
	 */
	alpha?: boolean | number;
}

/** The values `rgb` can produce. */
export interface RgbFormatOutputs {
	/** The CSS value, such as `"rgb(255 127 80)"`. */
	string?: boolean;
	/** The channels, such as `[255, 127, 80]`. */
	array?: boolean;
	/**
	 * Alpha handling for this format. `true` (the default) keeps the alpha the
	 * color carries, a number between 0 and 1 generates the format at that
	 * opacity, and `false` rejects a color that carries alpha, with no alpha
	 * channel in the array.
	 */
	alpha?: boolean | number;
}

/**
 * Settings for the color values generated next to `oklch()`, shared by the
 * palette and its colors.
 */
export interface ColorFormatConfig {
	/**
	 * Formats generated alongside `oklch()`, keyed by format. A format set to
	 * `true` produces its CSS value; an object selects the representations to
	 * include, so `{ hex: { digits: true } }` produces only `"ff7f50"`, and
	 * `alpha` controls the alpha of that format alone.
	 *
	 * The palette setting covers every color, and a color replaces it in its own
	 * `settings`.
	 *
	 * @example
	 * ```ts
	 * colors: {
	 *   palette: {
	 *     value: { coral: { 100: { hex: "#FF7F50" } } },
	 *     settings: {
	 *       color: {
	 *         formats: { hex: { string: true, digits: true }, rgb: true },
	 *         fallback: "hex",
	 *       },
	 *     },
	 *   },
	 * }
	 * ```
	 */
	formats?: {
		hex?: boolean | HexFormatOutputs;
		rgb?: boolean | RgbFormatOutputs;
	};
	/**
	 * The format emitted as the CSS declaration for browsers without `oklch()`
	 * support, gated by `@supports not (color: oklch(0% 0 0))`. The format has to
	 * be generated, and to include its `string` value.
	 *
	 * Defaults to the first generated format. `false` emits no declaration, so
	 * the formats only reach the JSON, TypeScript and Style Dictionary tokens.
	 */
	fallback?: ColorFormat | false;
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

/** The condition a format declaration is gated by. */
const OKLCH_SUPPORT_CONDITION = "@supports not (color: oklch(0% 0 0))";

/**
 * The representations a format can produce, keyed by the name a configuration
 * enables. The accepted representations and the values they generate come from
 * this one table, so a representation cannot be validated without also being
 * implemented.
 */
type ColorFormatValue = string | number | number[];

/** The CSS value of one format, which is the declaration a browser without `oklch()` support reads. */
const colorFormatDeclarations: Record<ColorFormat, (color: Color) => string> = {
	hex: (color) => `#${hexDigits(color)}`,
	rgb: (color) => `rgb(${srgbBytes(color).join(" ")}${alphaSuffix(color)})`,
};

const colorFormatOutputs: Record<
	ColorFormat,
	Record<string, (color: Color) => ColorFormatValue>
> = {
	hex: {
		string: colorFormatDeclarations.hex,
		digits: (color) => hexDigits(color),
		number: (color) => Number.parseInt(hexDigits(color), 16),
	},
	rgb: {
		string: colorFormatDeclarations.rgb,
		array: (color) =>
			alphaValue(color) === 1
				? srgbBytes(color)
				: [...srgbBytes(color), alphaValue(color)],
	},
};

type ColorFormatOutput = string;

/** Every accepted format name, in the order error messages and the CLI list them. */
export const supportedColorFormats = Object.keys(colorFormatOutputs) as ColorFormat[];

/** Whether a runtime value is one of the accepted format names. */
export const isColorFormat = (value: unknown): value is ColorFormat =>
	typeof value === "string" && Object.hasOwn(colorFormatOutputs, value);

/** The accepted format names as the configuration errors list them. */
const colorFormatList = supportedColorFormats.map((format) => `"${format}"`).join(", ");

/** The representations `format` accepts, in the order they are generated. */
const outputsOf = (format: ColorFormat): readonly ColorFormatOutput[] =>
	Object.keys(colorFormatOutputs[format]);

const toChannelByte = (coord: number) =>
	Math.round(Math.min(Math.max(Number.isNaN(coord) ? 0 : coord, 0), 1) * 255);

const toHexByte = (byte: number) => byte.toString(16).padStart(2, "0");

/**
 * The color channels mapped into the sRGB gamut. The conversion uses the CSS
 * gamut mapping algorithm, which is how a browser maps an out-of-gamut
 * `oklch()` color, so a saturated value stays as close to the modern one as
 * sRGB allows.
 */
const srgbBytes = (color: Color): number[] =>
	color.to("srgb").toGamut().coords.map(toChannelByte);

/** The alpha the generated values carry, clamped to 0-1 and rounded to three decimals. */
const alphaValue = (color: Color): number =>
	Math.round(
		Math.min(Math.max(Number.isNaN(color.alpha) ? 1 : color.alpha, 0), 1) * 1000,
	) / 1000;

/** `" / 0.12"`, or an empty string for an opaque color. */
const alphaSuffix = (color: Color) =>
	alphaValue(color) === 1 ? "" : ` / ${alphaValue(color)}`;

/** The hex digits of the color, with the alpha byte when it carries alpha. */
const hexDigits = (color: Color) => {
	const digits = srgbBytes(color).map(toHexByte).join("");
	return alphaValue(color) === 1
		? digits
		: `${digits}${toHexByte(Math.round(alphaValue(color) * 255))}`;
};

/** The color a palette value resolves to. */
const readColor = (value: ColorValueOrString): Color =>
	new Color(typeof value === "string" ? value : getColorString(value));

/**
 * The color as one format generates it. The `oklch()` value keeps the alpha the
 * color carries, and a format applies its own alpha policy on top of it.
 */
const colorForFormat = (
	color: Color,
	{ format, alpha }: GeneratedFormat,
	path: string,
): Color => {
	if (alpha === true || color.alpha === alpha) return color;

	if (alpha === false) {
		// An opaque color has no alpha to represent. A color that carries one is
		// rejected before generation, so this guard only covers a direct call.
		if (color.alpha === 1) return color;
		throw new Error(
			`Invalid color at "${path}": the color carries alpha, but the "${format}" format sets "alpha" to false.`,
		);
	}

	const generated = color.clone();
	generated.alpha = alpha;
	return generated;
};

/** The alpha a color value carries, or undefined when the value is not a color. */
const colorAlpha = (value: ColorValueOrString): number | undefined => {
	try {
		const colorString = typeof value === "string" ? value : getColorString(value);
		return new Color(colorString).alpha;
	} catch {
		// The emission pass reports a value it cannot parse.
		return undefined;
	}
};

/**
 * Rejects a variant that carries alpha while one of its formats rejects alpha,
 * before generation, so the mistake fails loudly instead of skipping the color
 * with a log line.
 */
const assertOpaqueVariants = (
	variants: Record<string, ColorValueOrString>,
	formats: readonly GeneratedFormat[],
	path: string,
): void => {
	const opaque = formats.filter((format) => format.alpha === false);
	if (opaque.length === 0) return;

	for (const [variantId, value] of Object.entries(variants)) {
		const alpha = colorAlpha(value);
		if (alpha === undefined || alpha === 1) continue;

		throw new Error(
			`Invalid color at "${path}.${variantId}": the color carries alpha, but the "${opaque[0].format}" format sets "alpha" to false.`,
		);
	}
};

/**
 * Converts a color to the OKLCH value of a generated token.
 * @example
 * ```ts
 * colorToOklch(new Color("#ff0000")); // "oklch(62.796% 0.25768 29.23388)"
 * ```
 */
function colorToOklch(color: Color): string {
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

/** One generated format: the format, the representations it produces, and its alpha policy. */
interface GeneratedFormat {
	format: ColorFormat;
	outputs: readonly ColorFormatOutput[];
	alpha: boolean | number;
}

/**
 * Converts a color to every requested representation of every requested format,
 * in the order they are generated.
 */
const colorToFormats = (
	color: Color,
	formats: readonly GeneratedFormat[],
	path: string,
): TokenColorFormats => {
	const values: TokenColorFormats = {};

	for (const entry of formats) {
		const generated: Record<string, ColorFormatValue> = {};
		const formatColor = colorForFormat(color, entry, path);
		for (const output of entry.outputs) {
			generated[output] = colorFormatOutputs[entry.format][output](formatColor);
		}
		if (entry.format === "hex") values.hex = generated as HexColorValues;
		else values.rgb = generated as RgbColorValues;
	}

	return values;
};

/** The CSS value of one format, which is the declaration a browser without `oklch()` support reads. */
const colorToDeclaration = (
	color: Color,
	format: GeneratedFormat,
	path: string,
): string => colorFormatDeclarations[format.format](colorForFormat(color, format, path));

/**
 * The color settings of one level, normalized. A field the level does not set is
 * inherited from the level above it, so a color that only names a fallback keeps
 * the palette's formats.
 */
interface ColorFormatSettings {
	formats?: GeneratedFormat[];
	fallback?: ColorFormat | false;
}

/** The settings of one generated color, with every field resolved. */
interface ResolvedColorFormatSettings {
	formats: GeneratedFormat[];
	fallback?: ColorFormat | false;
}

const defaultFormats = (format: ColorFormat): GeneratedFormat => ({
	format,
	outputs: ["string"],
	alpha: true,
});

/**
 * Reads and validates the `color` settings of one palette level. The values come
 * from a JavaScript object at runtime, so a setting generation would ignore has
 * to fail loudly instead of quietly producing nothing.
 */
function readColorFormatSettings(
	entry: object,
	settings: unknown,
	path: string,
): ColorFormatSettings | undefined {
	if ("color" in entry) {
		throw new Error(
			`Invalid configuration at "${path}": "color" belongs inside "${path}.settings".`,
		);
	}
	if ("formats" in entry || "fallback" in entry || "alpha" in entry) {
		throw new Error(
			`Invalid configuration at "${path}": color settings belong inside "${path}.settings.color".`,
		);
	}

	if (settings === undefined) return undefined;
	if (!isRecord(settings)) {
		throw new Error(
			`Invalid configuration at "${path}.settings": settings must be an object.`,
		);
	}

	const settingsPath = `${path}.settings`;
	if ("formats" in settings || "fallback" in settings || "alpha" in settings) {
		throw new Error(
			`Invalid configuration at "${settingsPath}": color settings belong inside "${settingsPath}.color".`,
		);
	}

	const color = settings.color;
	if (color === undefined) return undefined;
	if (!isRecord(color)) {
		throw new Error(
			`Invalid configuration at "${settingsPath}.color": color must be an object.`,
		);
	}

	if ("alpha" in color) {
		throw new Error(
			`Invalid configuration at "${settingsPath}.color": "alpha" belongs inside a format, as in "${settingsPath}.color.formats.hex.alpha".`,
		);
	}

	const colorSettings: ColorFormatSettings = {};
	if (color.formats !== undefined) {
		colorSettings.formats = readFormats(color.formats, `${settingsPath}.color.formats`);
	}
	if (color.fallback !== undefined) {
		colorSettings.fallback = readFallback(
			color.fallback,
			`${settingsPath}.color.fallback`,
		);
	}

	return colorSettings;
}

const readFormats = (value: unknown, path: string): GeneratedFormat[] => {
	if (value === undefined || value === false) return [];
	if (!isRecord(value)) {
		throw new Error(
			`Invalid configuration at "${path}": expected formats such as { hex: true }, or omit it.`,
		);
	}

	const formats: GeneratedFormat[] = [];
	for (const [name, outputs] of Object.entries(value)) {
		if (!isColorFormat(name)) {
			throw new Error(
				`Invalid color format at configuration path "${path}": ${JSON.stringify(
					name,
				)}. Use ${colorFormatList}.`,
			);
		}

		formats.push(readFormat(name, outputs, `${path}.${name}`));
	}

	return formats;
};

/**
 * Reads one format entry: the outputs it produces, and its alpha policy.
 */
const readFormat = (
	format: ColorFormat,
	value: unknown,
	path: string,
): GeneratedFormat => {
	if (value === true) return { format, outputs: ["string"], alpha: true };
	if (value === undefined || value === false) return { format, outputs: [], alpha: true };
	if (!isRecord(value)) {
		throw new Error(
			`Invalid configuration at "${path}": expected true or an object of outputs such as { string: true }.`,
		);
	}

	const allowed = outputsOf(format);
	const outputs: ColorFormatOutput[] = [];
	const alpha: boolean | number = true;

	for (const [name, enabled] of Object.entries(value)) {
		if (name === "alpha") continue;
		if (!allowed.includes(name as ColorFormatOutput)) {
			throw new Error(
				`Invalid ${format} output at configuration path "${path}": ${JSON.stringify(
					name,
				)}. Use ${[...allowed, "alpha"].map((output) => `"${output}"`).join(", ")}.`,
			);
		}
		if (enabled !== true && enabled !== false) {
			throw new Error(
				`Invalid configuration at "${path}.${name}": expected true or false, received ${JSON.stringify(
					enabled,
				)}.`,
			);
		}
		if (enabled) outputs.push(name as ColorFormatOutput);
	}

	if (outputs.length === 0) {
		throw new Error(
			`Invalid configuration at "${path}": enable at least one output, such as { string: true }.`,
		);
	}

	return {
		format,
		outputs,
		alpha: "alpha" in value ? readFormatAlpha(value.alpha, `${path}.alpha`) : alpha,
	};
};

const readFallback = (value: unknown, path: string): ColorFormat | false | undefined => {
	if (value === undefined || value === false) return value;
	if (!isColorFormat(value)) {
		throw new Error(
			`Invalid fallback format at configuration path "${path}": ${JSON.stringify(
				value,
			)}. Use ${colorFormatList}, or false.`,
		);
	}

	return value;
};

/** Reads the alpha policy of one format. */
const readFormatAlpha = (value: unknown, path: string): boolean | number => {
	if (typeof value === "boolean") return value;
	if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
		throw new Error(
			`Invalid alpha at configuration path "${path}": ${JSON.stringify(
				value,
			)}. Use true, false, or a number between 0 and 1.`,
		);
	}

	return value;
};

/**
 * Resolves the settings of one palette color: the color's own settings replace
 * the palette's, and the formats a caller adds are appended to the result.
 */
const resolveColorFormatSettings = (
	settings: ColorFormatSettings | undefined,
	paletteSettings: ColorFormatSettings | undefined,
	extraFormats: readonly ColorFormat[] = [],
): ResolvedColorFormatSettings => {
	const formats = [...(settings?.formats ?? paletteSettings?.formats ?? [])];
	for (const format of extraFormats) {
		if (!formats.some((entry) => entry.format === format)) {
			formats.push(defaultFormats(format));
		}
	}

	return {
		formats,
		fallback: settings?.fallback ?? paletteSettings?.fallback,
	};
};

/**
 * The format whose `string` output becomes the CSS declaration. A named fallback
 * has to be generated and to include that output, and the default is the first
 * generated format.
 */
const resolveDeclarationFormat = ({
	formats,
	fallback,
}: ResolvedColorFormatSettings): GeneratedFormat | undefined => {
	if (fallback === false) return undefined;

	const generated =
		fallback === undefined
			? formats.at(0)
			: formats.find((entry) => entry.format === fallback);

	if (fallback !== undefined && !generated) {
		throw new Error(
			`Invalid fallback format: "${fallback}" is not generated. Add it to "settings.color.formats", or use false.`,
		);
	}
	if (generated && !generated.outputs.includes("string")) {
		throw new Error(
			`Invalid fallback format: "${generated.format}" does not generate its "string" output. Enable it, or use false.`,
		);
	}

	return generated;
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

	const paletteSettings = readColorFormatSettings(
		colors.palette,
		colors.palette.settings,
		"palette",
	);

	for (const [colorName, colorConfig] of Object.entries(colors.palette.value)) {
		validateName(colorName, `palette.${colorName}`);

		const normalizedColorConfig = getPaletteColorConfig(colorConfig);
		// Read before the try block: a configuration mistake has to fail loudly
		// instead of being logged and skipped per color. A color entry written in
		// the shorthand form has no settings to read, and its keys are variant
		// names that may legitimately include "color".
		const colorSettings = resolveColorFormatSettings(
			isPaletteColorConfig(colorConfig)
				? readColorFormatSettings(
						colorConfig,
						normalizedColorConfig.settings,
						`palette.${colorName}`,
					)
				: undefined,
			paletteSettings,
			options.colorFormats,
		);
		assertOpaqueVariants(
			normalizedColorConfig.value,
			colorSettings.formats,
			`palette.${colorName}`,
		);

		const declarationFormat = resolveDeclarationFormat(colorSettings);
		const fallback = declarationFormat
			? { declarationFormat, group: getFallbackGroup(normalizedColorConfig.settings) }
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
				const path = `palette.${colorName}.${variantId}`;
				const color = readColor(colorValue);
				const value = colorToOklch(color);
				const variable = `${key}: ${value};`;
				const colorValues =
					colorSettings.formats.length > 0
						? colorToFormats(color, colorSettings.formats, path)
						: undefined;
				if (fallback) {
					const cssValue = colorToDeclaration(color, fallback.declarationFormat, path);
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
