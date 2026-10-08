import Color from "colorjs.io";
import {
	assertKnownKeys,
	assertSettingsKeys,
	InvalidNameError,
	unreadSettings,
	validateName,
	validateVariableAliases,
} from "../helpers.ts";
import type {
	ColorFormat,
	GenerateOptions,
	HexColorValues,
	RgbColorValues,
	TokenColorFormats,
	Variables,
} from "../lib.ts";
import {
	getReferencePaths,
	getResolvedVariablesMap,
	normalizeTokenPath,
	type Output,
	type ResolveMap,
	ROOT_SCOPE,
	resolveValue,
	resolveVariable,
	withTokenScope,
} from "../lib.ts";

/** The color's own `atRule` and `selector`, trimmed. The only reading of `WithCondition`. */
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

/**
 * A color derived from two colors, emitted as
 * `color-mix(in oklch, <from>, <with> <amount>%)`. An operand written as a dotted
 * token path, such as `"palette.brand.500"`, is emitted as its `var()` reference;
 * any other operand is a CSS color, such as `"black"` or `"transparent"`.
 */
export interface ColorMix {
	mix: {
		/** The base color: a token path declared before this color, or a CSS color. */
		from: string;
		/** The color mixed in: a token path declared before this color, or a CSS color. */
		with: string;
		/** The percentage of `with`, from 0 to 100. */
		amount: number;
		/**
		 * The interpolation color space.
		 * @default "oklch"
		 */
		in?: "oklch";
	};
}

interface ColorVariants {
	[key: string]: ColorValueOrString | ColorMix;
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
/** A color format generated alongside `oklch()`. */
export type { ColorFormat } from "../lib.ts";

/** The values `hex` can produce, with the alpha byte when the color has one. */
export interface HexFormatOutputs {
	/** The CSS value, such as `"#ff7f50"`. */
	string?: boolean;
	/** The digits without `#`, such as `"ff7f50"`. */
	digits?: boolean;
	/** The digits as a number, such as `0xff7f50`. */
	number?: boolean;
	/** `true` keeps the color's alpha, a 0-1 number sets it, `false` rejects it. @default true */
	alpha?: boolean | number;
}

/** The values `rgb` can produce. */
export interface RgbFormatOutputs {
	/** The CSS value, such as `"rgb(255 127 80)"`. */
	string?: boolean;
	/** The channels, such as `[255, 127, 80]`. */
	array?: boolean;
	/** `true` keeps the color's alpha, a 0-1 number sets it, `false` rejects it. @default true */
	alpha?: boolean | number;
}

/** Settings for the color values generated next to `oklch()`. */
export interface ColorFormatConfig {
	/**
	 * Formats to generate, keyed by format. `true` generates the format's CSS
	 * value; an object picks the outputs. A color's entry merges into the
	 * palette's, and `false` removes an inherited format.
	 */
	formats?: {
		hex?: boolean | HexFormatOutputs;
		rgb?: boolean | RgbFormatOutputs;
	};
	/**
	 * The format whose `string` output becomes the CSS declaration, or `false`
	 * for none.
	 * @default the first format that produces a CSS value
	 */
	fallback?: ColorFormat | false;
}

/** Settings for the color values themselves, shared by the palette and its colors. */
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
	[key: string]: string | ColorMix;
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

const isColorMix = (value: unknown): value is ColorMix =>
	isRecord(value) && "mix" in value;

/** Whether a palette entry uses the `{ value, settings }` form. */
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

/** The representations each format accepts, and the value each produces. */
type ColorFormatValue = string | number | number[];

/** A color in the sRGB gamut, and whether reaching it took gamut mapping. */
interface SrgbColor {
	bytes: number[];
	alpha: number;
	mapped: boolean;
}

/** The outputs one format produces, one entry per value the token carries. */
type ColorFormatOutputTable<Values> = {
	[K in keyof Values]-?: (color: SrgbColor) => NonNullable<Values[K]>;
};

const colorFormatOutputs: {
	hex: ColorFormatOutputTable<HexColorValues>;
	rgb: ColorFormatOutputTable<RgbColorValues>;
} = {
	hex: {
		string: (color) => `#${hexDigits(color)}`,
		digits: (color) => hexDigits(color),
		number: (color) => Number.parseInt(hexDigits(color), 16),
	},
	rgb: {
		string: (color) => `rgb(${color.bytes.join(" ")}${alphaSuffix(color)})`,
		array: (color) =>
			color.alpha === 1 ? color.bytes : [...color.bytes, Number(color.alpha.toFixed(3))],
	},
};

/** The CSS value of one format, which is the declaration a browser without `oklch()` support reads. */
const colorFormatDeclarations: Record<ColorFormat, (color: SrgbColor) => string> = {
	hex: colorFormatOutputs.hex.string,
	rgb: colorFormatOutputs.rgb.string,
};

type ColorFormatOutput = keyof HexColorValues | keyof RgbColorValues;

/** Every accepted format name, in the order error messages and the CLI list them. */
export const supportedColorFormats = Object.keys(colorFormatOutputs) as ColorFormat[];

/** Whether a runtime value is one of the accepted format names. */
export const isColorFormat = (value: unknown): value is ColorFormat =>
	typeof value === "string" && Object.hasOwn(colorFormatOutputs, value);

/** The accepted format names as the configuration errors list them. */
const colorFormatList = supportedColorFormats.map((format) => `"${format}"`).join(", ");

/** The representations `format` accepts, in the order they are generated. */
const outputsOf = (format: ColorFormat): readonly ColorFormatOutput[] =>
	Object.keys(colorFormatOutputs[format]) as ColorFormatOutput[];

/** One output of one format. The registry types the pair; `readFormat` validates it. */
const formatOutput = (
	format: ColorFormat,
	output: ColorFormatOutput,
	color: SrgbColor,
): string | number | number[] => {
	const table = colorFormatOutputs[format] as Record<
		ColorFormatOutput,
		(color: SrgbColor) => string | number | number[]
	>;

	return table[output](color);
};

const toChannelByte = (coord: number) =>
	Math.round(Math.min(Math.max(Number.isNaN(coord) ? 0 : coord, 0), 1) * 255);

const toHexByte = (byte: number) => byte.toString(16).padStart(2, "0");

/** The color channels in the sRGB gamut, through the CSS gamut mapping algorithm. */
const toSrgb = (color: Color): SrgbColor => {
	const srgb = color.to("srgb");
	const mapped = !srgb.inGamut("srgb");

	return {
		bytes: srgb.toGamut().coords.map(toChannelByte),
		alpha: alphaValue(color),
		mapped,
	};
};

/** The alpha clamped to 0-1, without rounding: every output rounds once. */
const alphaValue = (color: Color): number =>
	Math.min(Math.max(Number.isNaN(color.alpha) ? 1 : color.alpha, 0), 1);

/** `" / 0.12"`, or an empty string for an opaque color. */
const alphaSuffix = (color: SrgbColor) =>
	color.alpha === 1 ? "" : ` / ${Number(color.alpha.toFixed(3))}`;

/** The hex digits of the color, with the alpha byte when it carries alpha. */
const hexDigits = (color: SrgbColor) =>
	`${color.bytes.map(toHexByte).join("")}${
		color.alpha === 1 ? "" : toHexByte(Math.round(color.alpha * 255))
	}`;

/** The color a palette value resolves to. */
const readColor = (value: ColorValueOrString): Color =>
	new Color(typeof value === "string" ? value : getColorString(value));

/** The color as one format generates it, with that format's alpha applied. */
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

/**
 * A configuration mistake found while a palette color or theme is generated. It
 * is re-thrown instead of being logged, so the color is not silently dropped.
 */
class ColorConfigError extends Error {}

/** The alpha a color value carries, or undefined when the value is not a color. */
const colorAlpha = (value: ColorVariants[string]): number | undefined => {
	if (isColorMix(value)) return undefined;
	try {
		const colorString = typeof value === "string" ? value : getColorString(value);
		return new Color(colorString).alpha;
	} catch {
		// The emission pass reports a value it cannot parse.
		return undefined;
	}
};

/** Rejects a color that carries alpha when one of its formats rejects alpha. */
const assertOpaqueColor = (
	alpha: number | undefined,
	formats: readonly GeneratedFormat[],
	path: string,
): void => {
	if (alpha === undefined || alpha === 1) return;
	const opaque = formats.find((format) => format.alpha === false);
	if (!opaque) return;

	throw new ColorConfigError(
		`Invalid color at "${path}": the color carries alpha, but the "${opaque.format}" format sets "alpha" to false.`,
	);
};

/** Rejects an alpha-carrying variant when one of its formats rejects alpha. */
const assertOpaqueVariants = (
	variants: ColorVariants,
	formats: readonly GeneratedFormat[],
	path: string,
): void => {
	for (const [variantId, value] of Object.entries(variants)) {
		assertOpaqueColor(colorAlpha(value), formats, `${path}.${variantId}`);
	}
};

/** The color in oklch, with the hue missing when the chroma rounds to 0 where it is emitted. */
const toOklch = (color: Color): Color => {
	const oklchColor = color.to("oklch");
	const c = oklchColor.coords[1];
	if (Number((Number.isNaN(c) ? 0 : c).toFixed(5)) === 0)
		oklchColor.coords[2] = Number.NaN;
	return oklchColor;
};

/** The `oklch()` value of a generated token. */
function colorToOklch(color: Color): string {
	const oklchColor = toOklch(color);
	const [l, c] = oklchColor.coords
		.slice(0, 2)
		.map((coord) => Number((Number.isNaN(coord) ? 0 : coord).toFixed(5)));
	const h = oklchColor.coords[2];
	const hueValue = Number.isNaN(h) ? "none" : Number(h.toFixed(5));

	const alpha =
		oklchColor.alpha === 1 ? "" : ` / ${Number((oklchColor.alpha * 100).toFixed(1))}%`;
	return `oklch(${Number((l * 100).toFixed(3))}% ${c} ${hueValue}${alpha})`;
}

/** One generated format: the format, the representations it produces, and its alpha policy. */
interface GeneratedFormat {
	format: ColorFormat;
	outputs: readonly ColorFormatOutput[];
	alpha: boolean | number;
}

/** Converts a color to every requested output of every requested format. */
const colorToFormats = (
	color: Color,
	formats: readonly GeneratedFormat[],
	path: string,
): { values: TokenColorFormats; gamutMapped: boolean } => {
	const values: TokenColorFormats = {};
	let gamutMapped = false;

	for (const entry of formats) {
		const formatColor = toSrgb(colorForFormat(color, entry, path));
		gamutMapped ||= formatColor.mapped;

		const generated: Record<string, ColorFormatValue> = {};
		for (const output of entry.outputs) {
			generated[output] = formatOutput(entry.format, output, formatColor);
		}
		if (entry.format === "hex") values.hex = generated as HexColorValues;
		else values.rgb = generated as RgbColorValues;
	}

	return { values, gamutMapped };
};

/** The CSS value of one format, which is the declaration a browser without `oklch()` support reads. */
const colorToDeclaration = (color: Color, format: GeneratedFormat, path: string) =>
	colorFormatDeclarations[format.format](toSrgb(colorForFormat(color, format, path)));

/** One level's color settings; a field the level omits is inherited. */
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

/** The keys a `settings` object accepts, per level. */
const paletteSettingsKeys = ["color"] as const;
const paletteColorSettingsKeys = ["selector", "atRule", "color"] as const;

/** The color format settings, and the places a misplaced one is reported from. */
const colorFormatSettingKeys = ["color", "formats", "fallback", "alpha"] as const;

/** Rejects color format settings on gradients and themes, which keep authored values. */
const assertNoColorFormatSettings = (settings: unknown, path: string): void => {
	if (!isRecord(settings)) return;

	const misplaced = colorFormatSettingKeys.filter((key) => key in settings);
	if (misplaced.length === 0) return;

	const keys = misplaced.map((key) => `"${key}"`).join(", ");
	throw new Error(
		`Invalid configuration at "${path}": ${keys} ${
			misplaced.length === 1 ? "is a palette setting" : "are palette settings"
		}. Configure "formats" on "colors.palette.settings.color" or on a palette color.`,
	);
};

/** Reads and validates the `color` settings of one palette level. */
function readColorFormatSettings(
	entry: object,
	settings: unknown,
	path: string,
	settingsKeys: readonly string[],
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
	assertKnownKeys(entry, ["value", "settings"], path);

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
	assertKnownKeys(settings, settingsKeys, settingsPath);

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
	assertKnownKeys(color, ["formats", "fallback"], `${settingsPath}.color`);

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
	if (value === undefined) return [];
	if (!isRecord(value)) {
		throw new Error(
			`Invalid configuration at "${path}": expected formats such as { hex: true }, or omit it. Set one format to false to remove it.`,
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
	if (value === true) return defaultFormats(format);
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

/** Merges a color's formats over the palette's per format; `false` removes one. */
const mergeFormats = (
	paletteFormats: readonly GeneratedFormat[] | undefined,
	colorFormats: readonly GeneratedFormat[] | undefined,
): GeneratedFormat[] => {
	const merged = new Map<ColorFormat, GeneratedFormat>();

	for (const entry of paletteFormats ?? []) merged.set(entry.format, entry);
	for (const entry of colorFormats ?? []) {
		if (entry.outputs.length === 0) merged.delete(entry.format);
		else merged.set(entry.format, entry);
	}
	// A format no level enables never reaches a token as an empty object.
	for (const [format, entry] of merged) {
		if (entry.outputs.length === 0) merged.delete(format);
	}

	return [...merged.values()];
};

/** Resolves one palette color's settings, with the caller's formats appended. */
const resolveColorFormatSettings = (
	settings: ColorFormatSettings | undefined,
	paletteSettings: ColorFormatSettings | undefined,
	extraFormats: readonly ColorFormat[] = [],
): ResolvedColorFormatSettings => {
	const formats = mergeFormats(paletteSettings?.formats, settings?.formats);
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

/** The format whose `string` output becomes the CSS declaration. */
const resolveDeclarationFormat = (
	{ formats, fallback }: ResolvedColorFormatSettings,
	path: string,
): GeneratedFormat | undefined => {
	if (fallback === false) return undefined;

	if (fallback === undefined) {
		return formats.find((entry) => entry.outputs.includes("string"));
	}

	const generated = formats.find((entry) => entry.format === fallback);
	if (!generated) {
		throw new Error(
			`Invalid fallback format at "${path}": "${fallback}" is not generated. Add it to "formats", generate it from the palette, or use false.`,
		);
	}
	if (!generated.outputs.includes("string")) {
		throw new Error(
			`Invalid fallback format at "${path}": "${generated.format}" does not generate its "string" output. Enable it, or use false.`,
		);
	}

	return generated;
};

/** The chain a format declaration is emitted into: at-rule, `@supports`, selector. */
const fallbackWrappers = (settings: WithCondition | undefined): string[] => {
	const { atRule, selector } = readCondition(settings);

	return [...(atRule ? [atRule] : []), OKLCH_SUPPORT_CONDITION, selector || ROOT_SCOPE];
};

/** One top-level `@supports` block; a nested one would need CSS nesting. */
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

/** The interpolation spaces a mix accepts: the static mix has to match the browser's. */
const mixSpaces: readonly string[] = ["oklch"];
const mixKeys = ["from", "with", "amount", "in"];

/** What a mix resolves against: the tokens declared so far and their static colors. */
interface MixContext {
	tokens: Output;
	staticColors: Map<string, Color>;
}

/** A color value as it is emitted, with its static color when one can be computed. */
interface EmittedColor {
	value: string;
	referencePaths?: string[];
	color?: Color;
}

/** A dotted path without spaces, parentheses or `#`, which no CSS color is. */
const isTokenPath = (operand: string) =>
	operand.includes(".") && !/[\s()#,]/.test(operand);

const assertMixKeys = (value: object, allowed: readonly string[], path: string) => {
	const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
	if (unknown.length === 0) return;

	throw new ColorConfigError(
		`Unknown key at "${path}": ${unknown.map((key) => `"${key}"`).join(", ")}. Use ${allowed
			.map((key) => `"${key}"`)
			.join(", ")}.`,
	);
};

/** Reads one operand: a token path emitted as `var()`, or a CSS color emitted as written. */
const readMixOperand = (
	value: unknown,
	path: string,
	{ tokens, staticColors }: MixContext,
): { css: string; path?: string; color?: Color } => {
	if (typeof value !== "string" || value.trim() === "") {
		throw new ColorConfigError(
			`Invalid color mix at "${path}": expected a token path such as "palette.brand.500" or a CSS color, received ${JSON.stringify(
				value,
			)}.`,
		);
	}
	const operand = value.trim();

	if (!isTokenPath(operand)) {
		try {
			return { css: operand, color: new Color(operand) };
		} catch {
			throw new ColorConfigError(
				`Invalid color mix at "${path}": "${operand}" is neither a token path nor a CSS color.`,
			);
		}
	}

	let key: string;
	try {
		key = resolveVariable({ varPath: operand, colors: tokens });
	} catch {
		throw new ColorConfigError(
			`Invalid color mix at "${path}": the token path "${operand}" does not resolve. A mix references a color declared before it.`,
		);
	}
	const tokenPath = normalizeTokenPath(operand);
	const token = tokens.resolveMap.get(tokenPath);
	if (token?.type !== "color") {
		throw new ColorConfigError(
			`Invalid color mix at "${path}": the token path "${operand}" is a ${token?.type} token, not a color.`,
		);
	}

	return { css: `var(${key})`, path: tokenPath, color: staticColors.get(tokenPath) };
};

/** Mixes as `color-mix(in oklch)` does: lightness and chroma premultiplied by alpha, hue not. */
const mixInOklch = (from: Color, other: Color, amount: number): Color => {
	const operands = [toOklch(from), toOklch(other)] as const;
	const mixed = Color.mix(...operands, amount, { space: "oklch", premultiplied: true });
	mixed.coords[2] = Color.mix(...operands, amount, { space: "oklch" }).coords[2];
	return mixed;
};

/** Reads and validates a `{ mix }` value written at `path`. */
const readColorMix = (
	value: ColorMix,
	path: string,
	context: MixContext,
): EmittedColor => {
	assertMixKeys(value, ["mix"], path);
	const mixPath = `${path}.mix`;
	const mix: unknown = value.mix;
	if (!isRecord(mix)) {
		throw new ColorConfigError(
			`Invalid color mix at "${mixPath}": expected an object such as { from: "palette.brand.500", with: "black", amount: 15 }.`,
		);
	}
	assertMixKeys(mix, mixKeys, mixPath);

	const space = mix.in === undefined ? "oklch" : mix.in;
	if (typeof space !== "string" || !mixSpaces.includes(space)) {
		throw new ColorConfigError(
			`Invalid color mix at "${mixPath}.in": ${JSON.stringify(space)}. Use ${mixSpaces
				.map((name) => `"${name}"`)
				.join(", ")}.`,
		);
	}

	const rawAmount = mix.amount;
	if (
		typeof rawAmount !== "number" ||
		!Number.isFinite(rawAmount) ||
		rawAmount < 0 ||
		rawAmount > 100
	) {
		throw new ColorConfigError(
			`Invalid color mix at "${mixPath}.amount": ${JSON.stringify(
				rawAmount,
			)}. Use a number from 0 to 100, the percentage of "with".`,
		);
	}
	// Rounded so a tiny amount never stringifies in exponent form, which CSS rejects.
	const amount = Number(rawAmount.toFixed(4));

	const from = readMixOperand(mix.from, `${mixPath}.from`, context);
	const other = readMixOperand(mix.with, `${mixPath}.with`, context);
	const referencePaths = [from.path, other.path].filter(
		(reference): reference is string => reference !== undefined,
	);

	return {
		value: `color-mix(in ${space}, ${from.css}, ${other.css} ${amount}%)`,
		...(referencePaths.length > 0
			? { referencePaths: [...new Set(referencePaths)] }
			: {}),
		...(from.color && other.color
			? { color: mixInOklch(from.color, other.color, amount / 100) }
			: {}),
	};
};

/** A palette variant as it is emitted: its `oklch()` value, or its mix. */
const readPaletteVariant = (
	value: ColorVariants[string],
	path: string,
	context: MixContext,
): EmittedColor => {
	if (isColorMix(value)) return readColorMix(value, path, context);
	const color = readColor(value);
	return { value: colorToOklch(color), color };
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
export function processColors(
	colors: ColorConfig,
	options: GenerateOptions = {},
): Output {
	const rootOutput: string[] = [];
	const outsideOutput: string[] = [];
	const resolveMap: ResolveMap = new Map();
	const mixContext: MixContext = {
		tokens: { css: {}, resolveMap },
		staticColors: new Map(),
	};
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
		paletteSettingsKeys,
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
						paletteColorSettingsKeys,
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

		const declarationFormat = resolveDeclarationFormat(
			colorSettings,
			`palette.${colorName}`,
		);
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
				const { value, color, referencePaths } = readPaletteVariant(
					colorValue,
					path,
					mixContext,
				);
				const variable = `${key}: ${value};`;
				if (color) {
					mixContext.staticColors.set(path, color);
					assertOpaqueColor(color.alpha, colorSettings.formats, path);
				} else if (colorSettings.formats.length > 0 || fallback) {
					throw new ColorConfigError(
						`Invalid color mix at "${path}": an operand has no static color, so the sRGB formats cannot be computed.`,
					);
				}
				const generated =
					color && colorSettings.formats.length > 0
						? colorToFormats(color, colorSettings.formats, path)
						: undefined;
				if (fallback && color) {
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
							...(generated ? { color: generated.values } : {}),
							...(generated?.gamutMapped ? { gamutMapped: true } : {}),
							sourcePath: `${moduleKey}.${colorName}.${variantId}`,
							...(referencePaths ? { referencePaths } : {}),
							type: "color",
							tier: referencePaths ? "semantic" : "primitive",
						},
						handler.scope,
					),
				);
			}

			handler.finalize();
		} catch (error) {
			if (error instanceof InvalidNameError || error instanceof ColorConfigError)
				throw error;
			console.error(`Error processing color ${colorName}:`, error);
		}
	}

	// Emitted with the palette, before gradients and themes: a format duplicates the
	// declaration it mirrors, so a later intentional declaration still wins.
	for (const { wrappers, declarations } of fallbackGroups.values()) {
		outsideOutput.push(...renderFallbackBlock(wrappers, declarations));
	}

	if (colors.gradients) {
		assertNoColorFormatSettings(colors.gradients.settings, "gradients.settings");
		assertSettingsKeys(colors.gradients.settings, [], "gradients.settings");
		rootOutput.push(`/* Gradients */`);
		const moduleKey = "gradients";
		const palette = {
			css: { root: rootOutput.join("\n"), outside: outsideOutput.join("\n") },
			resolveMap,
		};

		for (const [gradientName, gradient] of Object.entries(colors.gradients.value)) {
			validateName(gradientName, `gradients.${gradientName}`);
			assertNoColorFormatSettings(
				gradient.settings,
				`gradients.${gradientName}.settings`,
			);
			assertSettingsKeys(
				gradient.settings,
				["selector", "atRule"],
				`gradients.${gradientName}.settings`,
			);
			const handler = conditionalBuilder(gradient.settings, `/* ${gradientName} */`);

			for (const [variantName, definition] of Object.entries(gradient.value)) {
				const { value, variables } = definition;
				validateName(variantName, `gradients.${gradientName}.${variantName}`);
				assertSettingsKeys(
					unreadSettings(definition),
					[],
					`gradients.${gradientName}.${variantName}.settings`,
				);
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
			assertNoColorFormatSettings(themeConfig.settings, `theme.${themeName}.settings`);
			assertSettingsKeys(
				themeConfig.settings,
				["selector", "atRule"],
				`theme.${themeName}.settings`,
			);
			// Checked outside the try block, so a misplaced setting fails instead of
			// dropping the theme with a logged line.
			for (const [colorName, colorInTheme] of Object.entries(themeConfig.value)) {
				assertNoColorFormatSettings(
					colorInTheme.settings,
					`theme.${themeName}.${colorName}.settings`,
				);
				assertSettingsKeys(
					colorInTheme.settings,
					["variantNameOnly"],
					`theme.${themeName}.${colorName}.settings`,
				);
			}
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
						const variantPath = `theme.${themeName}.${colorName}.${variantName}`;
						validateName(variantName, variantPath);
						const { value: resolvedValue, referencePaths } = isColorMix(variantValue)
							? readColorMix(variantValue, variantPath, mixContext)
							: {
									value: resolveValue({ map: resolvedMap, value: variantValue }),
									referencePaths: getReferencePaths({
										value: variantValue,
										variables: colorInTheme.variables,
									}),
								};

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
				if (error instanceof InvalidNameError || error instanceof ColorConfigError)
					throw error;
				console.error(`Error processing theme ${themeName}:`, error);
			}
		}
	}

	const output = {
		css: { root: rootOutput.join("\n"), outside: outsideOutput.join("\n") },
		resolveMap,
	};
	return output;
}
