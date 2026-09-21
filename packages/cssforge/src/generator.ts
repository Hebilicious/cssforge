import type { CSSForgeConfig } from "./config.ts";
import {
	getTokenScope,
	type Output,
	type ResolvedToken,
	type ResolveMap,
	replaceCssVariableReferences,
	type TokenTier,
	type TokenType,
} from "./lib.ts";
import { processColors } from "./modules/colors.ts";
import { processPrimitives } from "./modules/primitive.ts";
import { processSpacing } from "./modules/spacing.ts";
import { processTypography } from "./modules/typography.ts";

type CssValue = {
	value: string;
	key: string;
	variable: string;
};

type ForgeValue = {
	[key: string]: ForgeValue | CssValue;
};

/**
 * The kind of value a token holds.
 *
 * `TokenType` describes the cssforge module that produced the token. Consumers
 * that render or preview tokens need the value kind instead, so the generated
 * `type` uses this wider vocabulary and falls back to `TokenType`.
 */
type StyleDictionaryTokenType =
	| TokenType
	| "fontSize"
	| "lineHeight"
	| "fontWeight"
	| "fontFamily"
	| "borderRadius"
	| "letterSpacing"
	| "shadow"
	| "opacity"
	| "zIndex"
	| "number";

type StyleDictionaryToken = {
	value: string;
	type: StyleDictionaryTokenType;
	description?: string;
	attributes: {
		cssVariable: string;
		cssVariableReference: string;
		/**
		 * Anchor for value-based token usage matching. Tools that attribute
		 * authored `var(--token)` calls to tokens read this field.
		 */
		tailwindVariable: string;
		resolvedValue: string;
		sourcePath: string;
		referencePaths?: string[];
	};
	$tier: TokenTier;
	$reference?: string;
	$resolvedValue: string;
};

type StyleDictionaryValue = {
	[key: string]: StyleDictionaryValue | StyleDictionaryToken;
};

export interface StyleDictionaryJSONOptions {
	/**
	 * Controls the top-level token `value`.
	 *
	 * Use `css-reference` to match authored `var(--token)` calls. Use `resolved`
	 * for token previews and build tools that need final values. Cycles and unknown
	 * CSS variables remain as `var(...)`.
	 *
	 * @default "resolved"
	 */
	valueMode?: "css-reference" | "resolved";
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const deepMerge = <T extends Record<string, unknown>>(target: T, source: T): T => {
	const result: Record<string, unknown> = { ...target };
	for (const [key, sourceValue] of Object.entries(source)) {
		const targetValue = result[key];
		if (isRecord(targetValue) && isRecord(sourceValue)) {
			result[key] = deepMerge(targetValue, sourceValue);
			continue;
		}
		result[key] = sourceValue;
	}
	return result as T;
};

/**
 * Rejects a configuration whose distinct token paths generate the same CSS
 * custom property name in the same scope. Generated names are built by joining
 * path segments with hyphens, so `primitives.a-b.c.x` and `primitives.a.b-c.x`
 * both produce `--a-b-c-x`. Silently emitting two declarations for one name
 * makes the CSS, JSON and TypeScript outputs disagree, so the configuration is
 * rejected with both contributing paths named.
 *
 * The scope comes from the token itself, recorded by the module that emitted
 * the declaration, so the check compares what actually landed in the output
 * rather than re-deriving wrappers from the configuration. Tokens emitted
 * without a wrapper share `ROOT_SCOPE`. Tokens that share a name but target
 * different scopes are not a collision: two `variantNameOnly` themes emitting
 * `--primary` under different selectors is the documented way to build themes.
 */
const assertNoKeyCollisions = (resolveMap: ResolveMap): void => {
	const sourcesByScopeAndKey = new Map<string, string>();

	for (const token of resolveMap.values()) {
		const scopedKey = `${getTokenScope(token)}\u0000${token.key}`;
		const existingSourcePath = sourcesByScopeAndKey.get(scopedKey);

		if (existingSourcePath !== undefined && existingSourcePath !== token.sourcePath) {
			throw new Error(
				`Token key collision: "${existingSourcePath}" and "${token.sourcePath}" both generate "${token.key}". Rename one of the configuration paths.`,
			);
		}

		sourcesByScopeAndKey.set(scopedKey, token.sourcePath);
	}
};

/**
 * Merges the per-module resolve maps into the single map every output consumes.
 * Later modules win when two produce the same path, which preserves the
 * previous `collectResolveMap` behaviour.
 */
const mergeResolveMaps = (
	outputs: ReadonlyArray<Output | null | undefined>,
): ResolveMap => {
	const resolveMap: ResolveMap = new Map();

	for (const output of outputs) {
		if (!output) continue;
		for (const [path, token] of output.resolveMap.entries()) {
			resolveMap.set(path, token);
		}
	}

	return resolveMap;
};

/**
 * Merges the per-module resolve maps for every output. Exported so diagnostics
 * read exactly the declarations the generators emit, instead of re-deriving
 * them from the configuration.
 */
export const collectResolveMap = (config: Partial<CSSForgeConfig>): ResolveMap => {
	const forge = {
		colors: config.colors ? processColors(config.colors) : undefined,
		spacing: config.spacing ? processSpacing(config.spacing) : undefined,
		typography: config.typography ? processTypography(config.typography) : undefined,
		primitives: config.primitives
			? processPrimitives({
					primitives: config.primitives,
					colors: config.colors,
					typography: config.typography,
					spacing: config.spacing,
				})
			: undefined,
	};

	const resolveMap = mergeResolveMaps(Object.values(forge));
	assertNoKeyCollisions(resolveMap);
	return resolveMap;
};

/**
 * Creates a nested object structure of design tokens from a configuration.
 * @param config The CSSForge configuration.
 * @returns A nested object representing the design tokens.
 */
export function createForgeValues(config: Partial<CSSForgeConfig>) {
	type Input = readonly [string, CssValue];

	/**
	 * Creates a nested object structure from a path string and a value.
	 * @example
	 * ```ts
	 * const path = ["a", "b", "c"];
	 * const value = { key: "--a-b-c", value: "1rem", variable: "--a-b-c: 1rem;" };
	 * const result = createNestedObject(path, value);
	 * // result: { a: { b: { c: { key: "--a-b-c", value: "1rem", variable: "--a-b-c: 1rem;" } } } }
	 * ```
	 */
	function createNestedObject(path: string[], value: CssValue | ForgeValue): ForgeValue {
		if (path.length === 0) {
			return value as ForgeValue;
		}
		// Take the first segment of the path
		const [currentKey, ...remainingPath] = path;

		// Recursively build the nested object
		return {
			[currentKey]: createNestedObject(remainingPath, value),
		};
	}

	/**
	 * Creates a deeply nested object from an array of path-value pairs.
	 * @example
	 * ```ts
	 * const input = [
	 *  ["a.b.c", { key: "--a-b-c", value: "1rem", variable: "--a-b-c: 1rem;" }],
	 *  ["a.b.d", { key: "--a-b-d", value: "2rem", variable: "--a-b-d: 2rem;" }]
	 * ];
	 * const result = createForgeValuesFromKeys(input);
	 * // result: { a: { b: { c: { key: "--a-b-c", value: "1rem", variable: "--a-b-c: 1rem;" }, d: { key: "--a-b-d", value: "2rem", variable: "--a-b-d: 2rem;" } } } }
	 * ```
	 */
	function createForgeValuesFromKeys(input: Input[]): ForgeValue {
		// Reduce the input array into a single merged object
		return input.reduce((acc, [pathString, cssValues]) => {
			// Split the path string into segments
			const pathSegments = pathString.split(".");

			// Create a nested object for this input
			const nestedObject = createNestedObject(pathSegments, cssValues);

			// Deep merge the new object with the accumulator
			return deepMerge(acc, nestedObject);
		}, {} as ForgeValue);
	}

	const jsonKeys = [...collectResolveMap(config).entries()].map(
		([path, token]) =>
			[
				path,
				{ key: token.key, value: token.value, variable: token.variable },
			] satisfies Input,
	);
	const forgeValues = createForgeValuesFromKeys(jsonKeys);
	return forgeValues;
}

const toKebabCase = (value: string) =>
	value
		.replace(/([a-z0-9])([A-Z])/g, "$1-$2")
		.replace(/[_\s]+/g, "-")
		.toLowerCase();

const toStyleDictionaryPath = (sourcePath: string) => {
	const segments = sourcePath.replaceAll("@", ".").split(".");
	return segments
		.map((segment, index) =>
			index === segments.length - 1 ? segment : toKebabCase(segment),
		)
		.join(".");
};

const createNestedStyleDictionaryObject = (
	path: string[],
	value: StyleDictionaryToken | StyleDictionaryValue,
): StyleDictionaryValue => {
	if (path.length === 0) {
		return value as StyleDictionaryValue;
	}

	const [currentKey, ...remainingPath] = path;

	return {
		[currentKey]: createNestedStyleDictionaryObject(remainingPath, value),
	};
};

const resolveTokenValue = (
	token: ResolvedToken,
	tokensByCssVariable: Map<string, ResolvedToken>,
	seen: Set<string> = new Set(),
): string =>
	replaceCssVariableReferences(token.value, (cssVariable, match) => {
		if (seen.has(cssVariable)) return match;

		const referencedToken = tokensByCssVariable.get(cssVariable);
		if (!referencedToken) return match;

		return resolveTokenValue(
			referencedToken,
			tokensByCssVariable,
			new Set([...seen, cssVariable]),
		);
	});

const tokenLeafName = (sourcePath: string) =>
	sourcePath.replaceAll("@", ".").split(".").at(-1)?.toLowerCase() ?? "";

const CSS_LENGTH_PATTERN =
	/^-?\d*\.?\d+(?:px|rem|em|%|vw|vh|vmin|vmax|ch|ex|pt|pc|cm|mm|in|q)$/i;
const UNITLESS_NUMBER_PATTERN = /^-?\d*\.?\d+$/;
const CSS_COLOR_PATTERN =
	/^(?:#|rgba?\(|hsla?\(|oklch\(|oklab\(|lab\(|lch\(|color\(|color-mix\(|light-dark\(|transparent$|currentcolor$)/i;
const CSS_FUNCTION_PATTERN = /^[a-z-]+\(/i;

const isCssLength = (value: string) => {
	const trimmed = value.trim();
	return trimmed === "0" || CSS_LENGTH_PATTERN.test(trimmed);
};
const isUnitlessNumber = (value: string) => UNITLESS_NUMBER_PATTERN.test(value.trim());

/**
 * Narrow rules for leaf names whose token type differs from their cssforge module.
 *
 * The value check keeps a token from claiming a kind its value does not hold, for
 * example a `fontSize` token that resolved to a color alias.
 */
const VALUE_KIND_RULES: ReadonlyArray<{
	leaves: readonly string[];
	type: StyleDictionaryTokenType;
	matches: (value: string) => boolean;
}> = [
	{
		leaves: ["fontsize", "font-size", "text-size"],
		type: "fontSize",
		matches: (value) =>
			isCssLength(value) ||
			isUnitlessNumber(value) ||
			/^(?:clamp|calc|min|max)\(/i.test(value.trim()),
	},
	{
		leaves: ["lineheight", "line-height", "leading"],
		type: "lineHeight",
		matches: isUnitlessNumber,
	},
	{
		leaves: ["fontweight", "font-weight"],
		type: "fontWeight",
		matches: isUnitlessNumber,
	},
	{
		leaves: ["fontfamily", "font-family"],
		type: "fontFamily",
		matches: (value) =>
			value.trim().length > 0 &&
			!CSS_COLOR_PATTERN.test(value.trim()) &&
			!CSS_FUNCTION_PATTERN.test(value.trim()) &&
			!isCssLength(value) &&
			!isUnitlessNumber(value),
	},
	{
		leaves: ["borderradius", "border-radius", "radius", "rounded"],
		type: "borderRadius",
		matches: (value) =>
			isCssLength(value) || /^(?:clamp|calc|min|max)\(/i.test(value.trim()),
	},
	{
		leaves: ["boxshadow", "box-shadow", "shadow", "textshadow", "text-shadow"],
		type: "shadow",
		matches: (value) => value.trim().length > 0 && !CSS_COLOR_PATTERN.test(value.trim()),
	},
	{
		leaves: ["opacity", "alpha"],
		type: "opacity",
		matches: isUnitlessNumber,
	},
	{
		leaves: ["zindex", "z-index"],
		type: "zIndex",
		matches: isUnitlessNumber,
	},
	{
		leaves: ["letterspacing", "letter-spacing", "tracking"],
		type: "letterSpacing",
		matches: isCssLength,
	},
	{
		leaves: ["gap", "duration", "delay"],
		type: "number",
		matches: isUnitlessNumber,
	},
];

const inferValueKind = (
	sourcePath: string,
	resolvedValue: string,
	fallback: TokenType,
): StyleDictionaryTokenType => {
	const leaf = tokenLeafName(sourcePath);
	for (const rule of VALUE_KIND_RULES) {
		if (rule.leaves.includes(leaf) && rule.matches(resolvedValue)) return rule.type;
	}
	return fallback;
};

/**
 * Generates a Style Dictionary-readable token JSON string.
 *
 * The default writes final values for previews and transforms. Select `css-reference`
 * to keep each token's `var(--token)` call as `value` for usage matching.
 * Both modes include resolved values and CSS variable metadata.
 */
export function generateStyleDictionaryJSON(
	config: Partial<CSSForgeConfig>,
	options: StyleDictionaryJSONOptions = {},
): string {
	const valueMode = options.valueMode ?? "resolved";
	const resolveMap = collectResolveMap(config);
	const tokensByCssVariable = new Map(
		[...resolveMap.values()].map((token) => [token.key, token]),
	);
	const outputPathSources = new Map<string, string>();
	const outputTokens = [...resolveMap.entries()].map(([sourcePath, token]) => {
		const outputPath = toStyleDictionaryPath(sourcePath);
		const existingSourcePath = outputPathSources.get(outputPath);
		if (existingSourcePath) {
			throw new Error(
				`Token path collision after normalization: "${existingSourcePath}" and "${sourcePath}" both become "${outputPath}"`,
			);
		}
		outputPathSources.set(outputPath, sourcePath);
		return { outputPath, token };
	});

	const styleDictionaryValues = outputTokens.reduce((acc, { outputPath, token }) => {
		const resolvedValue = resolveTokenValue(token, tokensByCssVariable);
		const cssVariableReference = `var(${token.key})`;
		const referencePaths = token.referencePaths?.map(toStyleDictionaryPath);
		const tier = token.tier ?? (referencePaths?.length ? "semantic" : "primitive");
		const styleDictionaryToken: StyleDictionaryToken = {
			value: valueMode === "resolved" ? resolvedValue : cssVariableReference,
			type: inferValueKind(token.sourcePath, resolvedValue, token.type),
			attributes: {
				cssVariable: token.key,
				cssVariableReference,
				tailwindVariable: token.key,
				resolvedValue,
				sourcePath: toStyleDictionaryPath(token.sourcePath),
				...(referencePaths ? { referencePaths } : {}),
			},
			$tier: tier,
			...(referencePaths?.[0] ? { $reference: referencePaths[0] } : {}),
			$resolvedValue: resolvedValue,
		};
		const nestedObject = createNestedStyleDictionaryObject(
			outputPath.split("."),
			styleDictionaryToken,
		);
		return deepMerge(acc, nestedObject);
	}, {} as StyleDictionaryValue);

	return JSON.stringify(styleDictionaryValues, null, 2);
}

/**
 * Generates a JSON string from the CSSForge configuration.
 * This can be used to create a JSON file with all the design tokens.
 * @example
 * ```ts
 * const config = defineConfig({ colors: { palette: { value: { red: { 100: { hex: "#ff0000" } } } } });
 * const json = generateJSON(config);
 * // json: "{\n  \"colors\": {\n    \"palette\": {\n      \"value\": {\n        \"red\": {\n          \"100\": {\n            \"key\": \"--color-red-100\",\n            \"value\": \"oklch(62.796% 0.25768 29.23388)\",\n            \"variable\": \"--color-red-100: oklch(62.796% 0.25768 29.23388);\"\n          }\n        }\n      }\n    }\n  }\n}"
 * ```
 */
export function generateJSON(config: Partial<CSSForgeConfig>): string {
	const forgeValues = createForgeValues(config);
	return JSON.stringify(forgeValues, null, 2);
}

/**
 * Generates a TypeScript module from the CSSForge configuration.
 * This can be used to create a TypeScript file with all the design tokens, providing full type safety.
 * @example
 * ```ts
 * const config = defineConfig({ colors: { palette: { value: { red: { 100: { hex: "#ff0000" } } } } });
 * const ts = generateTS(config);
 * // ts: "export const cssForge = {\n  \"colors\": {\n    \"palette\": {\n      \"value\": {\n        \"red\": {\n          \"100\": {\n            \"key\": \"--color-red-100\",\n            \"value\": \"oklch(62.796% 0.25768 29.23388)\",\n            \"variable\": \"--color-red-100: oklch(62.796% 0.25768 29.23388);\"\n          }\n        }\n      }\n    }\n  }\n} as const;"
 * ```
 */
export function generateTS(config: Partial<CSSForgeConfig>): string {
	const forgeValues = createForgeValues(config);
	const forgeValuesString = JSON.stringify(forgeValues, null, 2);
	return `export const cssForge = ${forgeValuesString} as const;`;
}

/**
 * Generates a CSS string from the CSSForge configuration.
 * This is the main function to generate the CSS variables.
 * @example
 * ```ts
 * const config = defineConfig({ colors: { palette: { value: { red: { 100: { hex: "#ff0000" } } } } });
 * const css = generateCSS(config);
 * // css: "/*____ CSSForge ____*&#47;\n:root {\n/*____ Colors ____*&#47;\n/* Palette *&#47;\n--color-red-100: oklch(62.796% 0.25768 29.23388);\n}"
 * ```
 */
export function generateCSS(config: Partial<CSSForgeConfig>): string {
	const chunks: string[] = ["/*____ CSSForge ____*/", ":root {"];
	const outsideChunks: string[] = [];
	const processedConfig: {
		[key: string]:
			| { css: { root?: string; outside?: string }; resolveMap: ResolveMap }
			| undefined;
	} = {};

	// Process colors if present
	if (config.colors) {
		processedConfig.colors = processColors(config.colors);
		if (processedConfig.colors) {
			if (processedConfig.colors.css.root) {
				chunks.push("/*____ Colors ____*/");
				chunks.push(processedConfig.colors.css.root);
			}
			if (processedConfig.colors.css.outside) {
				outsideChunks.push(processedConfig.colors.css.outside);
			}
		}
	}

	// Process spacing if present
	if (config.spacing) {
		processedConfig.spacing = processSpacing(config.spacing);
		if (processedConfig.spacing) {
			if (processedConfig.spacing.css.root) {
				chunks.push("/*____ Spacing ____*/");
				chunks.push(processedConfig.spacing.css.root);
			}
			if (processedConfig.spacing.css.outside) {
				outsideChunks.push(processedConfig.spacing.css.outside);
			}
		}
	}

	// Process Typography if present
	if (config.typography) {
		processedConfig.typography = processTypography(config.typography);
		if (processedConfig.typography) {
			if (processedConfig.typography.css.root) {
				chunks.push("/*____ Typography ____*/");
				chunks.push(processedConfig.typography.css.root);
			}
			if (processedConfig.typography.css.outside) {
				outsideChunks.push(processedConfig.typography.css.outside);
			}
		}
	}

	if (config.primitives) {
		const primitiveVars = processPrimitives({
			primitives: config.primitives,
			colors: config.colors,
			typography: config.typography,
			spacing: config.spacing,
		});
		processedConfig.primitives = primitiveVars;
		if (primitiveVars) {
			if (primitiveVars.css.root) {
				chunks.push("/*____ Primitives ____*/");
				chunks.push(primitiveVars.css.root);
			}
			if (primitiveVars.css.outside) {
				outsideChunks.push(primitiveVars.css.outside);
			}
		}
	}

	// Reject colliding keys before returning any output. This reuses the module
	// results gathered above and feeds the same `assertNoKeyCollisions` used by
	// JSON, TypeScript and Style Dictionary output.
	assertNoKeyCollisions(mergeResolveMaps(Object.values(processedConfig)));

	chunks.push("}");

	if (outsideChunks.length > 0) chunks.push(outsideChunks.join("\n"));

	return chunks.join("\n");
}
