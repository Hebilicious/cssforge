import type { CSSForgeConfig } from "./config.ts";
import {
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

type StyleDictionaryToken = {
	value: string;
	type: TokenType;
	description?: string;
	attributes: {
		cssVariable: string;
		cssVariableReference: string;
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

const collectResolveMap = (config: Partial<CSSForgeConfig>): ResolveMap => {
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

	const resolveMap: ResolveMap = new Map();
	for (const value of Object.values(forge)) {
		if (!value) continue;
		for (const [path, token] of value.resolveMap.entries()) {
			resolveMap.set(path, token);
		}
	}
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
			type: token.type,
			attributes: {
				cssVariable: token.key,
				cssVariableReference,
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

	chunks.push("}");

	if (outsideChunks.length > 0) chunks.push(outsideChunks.join("\n"));

	return chunks.join("\n");
}
