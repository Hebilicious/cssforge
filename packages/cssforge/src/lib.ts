export type TokenType =
	| "color"
	| "gradient"
	| "spacing"
	| "typography"
	| "primitive"
	| "component";

export type TokenTier = "primitive" | "semantic";

/**
 * Metadata carried through generation so alternate outputs can preserve token
 * provenance without changing the generated CSS.
 */
export interface TokenMetadata {
	/** The original cssforge path used to resolve this token. */
	sourcePath: string;
	/** cssforge paths referenced while composing this token. */
	referencePaths?: string[];
	/** The broad token category for Style Dictionary-compatible outputs. */
	type: TokenType;
	/** Primitive tokens have no source reference; semantic tokens alias other tokens. */
	tier?: TokenTier;
}

export interface ResolvedToken extends TokenMetadata {
	/** CSS custom property name, e.g. `--theme-light-content-primary`. */
	key: string;
	/** The generated CSS value. This may contain `var(...)` references. */
	value: string;
	/** The full CSS declaration. */
	variable: string;
}

/**
 * A map where keys are cssforge paths and values are objects containing the CSS
 * variable key, generated value, full declaration, and token metadata.
 */
export type ResolveMap = Map<string, ResolvedToken>;

/**
 * Represents the output of a processing function, containing the generated
 * CSS and a resolve map.
 */
export interface Output {
	/** The generated CSS strings. */
	css: { root?: string; outside?: string };
	/** A map for resolving variable paths. */
	resolveMap: ResolveMap;
}

/**
 * Aliases for a token's value. Keys are the alias names as referenced in
 * `var(--key)`, written without the `--` prefix, and values are the cssforge
 * token paths they point at. A key such as `"surface-muted"` is referenced as
 * `var(--surface-muted)`.
 *
 * Hyphens are supported and the key is used verbatim as the custom property
 * name after `getResolvedVariablesMap` prefixes it with `--`. A key that is
 * empty or contains whitespace, `(`, `)`, `,`, `"`, or `'` cannot be referenced
 * and is left unresolved in the generated value. Note that the alias keys name
 * CSS custom properties, while the resolver that produces their targets
 * (`validateName`) rejects periods in token names.
 */
export interface Variables {
	[key: string]: string;
}

/**
 * CSS custom property names are case-sensitive and may contain any character
 * other than whitespace and the syntax characters of the surrounding grammar.
 * Alias names declared in a `variables` map are written without the `--`
 * prefix, so `{ "surface-muted": "palette.gray.100" }` is referenced as
 * `var(--surface-muted)`.
 */
const cssVariableNamePattern = /^--[^\s(),"']+$/;

/**
 * Returns the index of the `)` closing the `var(` at `openParenIndex`, or -1
 * when the function is unbalanced. Quoted strings are skipped so a `)` inside
 * a string literal cannot close the function early.
 */
const findClosingParen = (value: string, openParenIndex: number): number => {
	let depth = 0;
	let quote: string | undefined;

	for (let index = openParenIndex; index < value.length; index += 1) {
		const character = value[index];

		if (quote) {
			if (character === "\\") index += 1;
			else if (character === quote) quote = undefined;
			continue;
		}

		if (character === '"' || character === "'") {
			quote = character;
			continue;
		}

		if (character === "(") depth += 1;
		else if (character === ")") {
			depth -= 1;
			if (depth === 0) return index;
		}
	}

	return -1;
};

/**
 * Returns the index of the first `(` after the `var(` at `varIndex`, skipping
 * CSS comments and whitespace, or -1 when this is not a `var()` function.
 */
const findVarOpenParen = (value: string, varIndex: number): number => {
	let index = varIndex + 3;

	while (index < value.length) {
		if (value.startsWith("/*", index)) {
			const end = value.indexOf("*/", index + 2);
			if (end === -1) return -1;
			index = end + 2;
			continue;
		}

		const character = value[index];
		if (character === "(") return index;
		if (character !== undefined && /\s/.test(character)) {
			index += 1;
			continue;
		}

		return -1;
	}

	return -1;
};

/**
 * Returns the index of the first character at or after `start` that is neither
 * whitespace nor part of a CSS comment, stopping at `end`.
 */
const skipTrivia = (value: string, start: number, end: number): number => {
	let index = start;

	while (index < end) {
		if (value.startsWith("/*", index)) {
			const commentEnd = value.indexOf("*/", index + 2);
			if (commentEnd === -1 || commentEnd >= end) return end;
			index = commentEnd + 2;
			continue;
		}

		const character = value[index];
		if (character === undefined || !/\s/.test(character)) return index;
		index += 1;
	}

	return index;
};

/**
 * Rewrites CSS custom-property references using the canonical CSSForge parser.
 *
 * The replacer receives the custom property name (`--surface-muted`), the
 * matched `var(...)` text with any nested references already resolved, and the
 * match index. It returns the replacement for the whole match, which lets
 * `resolveValue` substitute only the name token while a fallback survives
 * untouched.
 *
 * Text that is malformed or unbalanced, has no usable custom-property name, or
 * appears inside a quoted string keeps its original text and is never reported
 * to the replacer. Unmapped names are still reported so the caller can leave
 * them unchanged.
 */
export const replaceCssVariableReferences = (
	value: string,
	replacer: (cssVariable: string, match: string, index: number) => string,
): string => {
	let result = "";
	let cursor = 0;
	let index = 0;
	let quote: string | undefined;

	while (index < value.length) {
		const character = value[index];

		if (quote) {
			if (character === "\\") index += 2;
			else {
				if (character === quote) quote = undefined;
				index += 1;
			}
			continue;
		}

		if (character === '"' || character === "'") {
			quote = character;
			index += 1;
			continue;
		}

		if (character === "/" && value.startsWith("/*", index)) {
			const end = value.indexOf("*/", index + 2);
			index = end === -1 ? value.length : end + 2;
			continue;
		}

		if (character !== "v" || !value.startsWith("var(", index)) {
			index += 1;
			continue;
		}

		const openParenIndex = findVarOpenParen(value, index);
		const closeParenIndex =
			openParenIndex === -1 ? -1 : findClosingParen(value, openParenIndex);

		if (closeParenIndex === -1) {
			// Unbalanced `var(`: skip the keyword so any nested function is still
			// visited and the raw text survives untouched.
			index += 4;
			continue;
		}

		const nameOffset = openParenIndex + 1;
		const nameStart = skipTrivia(value, nameOffset, closeParenIndex);
		const nameMatch = /^(--[^\s(),"']+)/.exec(value.slice(nameStart, closeParenIndex));
		const cssVariable = nameMatch?.[1];

		if (cssVariable && cssVariableNamePattern.test(cssVariable)) {
			const nameEnd = nameStart + cssVariable.length;
			const closed = value.slice(nameEnd, closeParenIndex + 1);

			result += value.slice(cursor, index);
			result += replacer(
				cssVariable,
				value.slice(index, nameEnd) + replaceCssVariableReferences(closed, replacer),
				index,
			);
			cursor = closeParenIndex + 1;
		}

		index = closeParenIndex + 1;
	}

	return result + value.slice(cursor);
};

const getCssVariableReferences = (value: string): string[] => {
	const references: string[] = [];
	replaceCssVariableReferences(value, (cssVariable, match) => {
		references.push(cssVariable);
		return match;
	});
	return references;
};

interface Modules {
	colors?: Output | null;
	typography?: Output | null;
	spacing?: Output | null;
}

interface ResolveVariableParams extends Modules {
	varPath: string;
}

interface GetResolvedVariablesMapParams extends Modules {
	variables: Variables | undefined;
}

/**
 * Normalizes historical config paths that included `value` wrapper segments.
 */
export const normalizeTokenPath = (varPath: string): string => {
	const path = varPath.split(".");
	const [module, ...parts] = path;

	if (!module) return varPath;

	if (
		(module === "palette" || module === "gradients" || module === "theme") &&
		parts[0] === "value"
	) {
		return [module, ...parts.slice(1)].join(".");
	}

	if (module === "spacing" && parts[0] === "custom" && parts[2] === "value") {
		return [module, parts[0], parts[1], ...parts.slice(3)].join(".");
	}

	if (module === "typography" && parts[0] === "weight" && parts[2] === "value") {
		return [module, parts[0], parts[1], ...parts.slice(3)].join(".");
	}

	return varPath;
};

/**
 * Resolves a variable path to its corresponding CSS variable name.
 * This function is used to resolve references to other design tokens.
 * @example
 * ```ts
 * const colors = {
 *  css: "--color-red-100: oklch(62.796% 0.25768 29.23388);",
 *  resolveMap: new Map([["colors.palette.value.red.100", { key: "--color-red-100", value: "oklch(62.796% 0.25768 29.23388)", variable: "--color-red-100: oklch(62.796% 0.25768 29.23388);" }]])
 * };
 * const varPath = "colors.palette.value.red.100";
 * const resolved = resolveVariable({ varPath, colors });
 * // resolved: "--color-red-100"
 * ```
 */
function resolveVariable({
	varPath,
	colors,
	typography,
	spacing,
}: ResolveVariableParams) {
	const normalizedPath = normalizeTokenPath(varPath);
	const path = normalizedPath.split(".");
	const module = path[0];
	//TODO: Make this configurable
	const keyMap = {
		palette: "palette",
		gradients: "gradients",
		theme: "theme",
		typography: "typography",
		typography_fluid: "typography_fluid",
		spacing: "spacing",
		spacing_fluid: "spacing_fluid",
	};
	switch (module) {
		case keyMap.palette:
		case keyMap.gradients:
		case keyMap.theme: {
			if (!colors) throw new Error("The colors object must be passed.");
			const result = colors.resolveMap.get(normalizedPath);
			if (!result) {
				throw new Error(
					`The color path ${varPath} could not be resolved. Map contains ${Array.from(
						colors.resolveMap.keys(),
					).map((key) => `\n${key}`)}`,
				);
			}
			return result.key;
		}
		case keyMap.typography_fluid:
		case keyMap.typography: {
			if (!typography) throw new Error("The typography object must be passed.");
			const result = typography.resolveMap.get(normalizedPath);
			if (!result) {
				throw new Error(
					`The typography path ${varPath} could not be resolved. Map contains ${Array.from(
						typography.resolveMap.keys(),
					).map((key) => `\n${key}`)}`,
				);
			}
			return result.key;
		}
		case keyMap.spacing:
		case keyMap.spacing_fluid: {
			if (!spacing) throw new Error("The spacing object must be passed.");
			const result = spacing.resolveMap.get(normalizedPath);
			if (!result) {
				throw new Error(
					`The spacing path ${varPath} could not be resolved.  Map contains ${Array.from(
						spacing.resolveMap.keys(),
					).map((key) => `\n${key}`)}`,
				);
			}
			return result.key;
		}
		default:
			throw new Error(`${module} is not implemented and can't be resolved.`);
	}
}

/**
 * Generates a map of resolved CSS variable names from a variables object.
 * It uses the provided modules (colors, typography, spacing) to resolve the paths.
 */
export const getResolvedVariablesMap = ({
	variables,
	...params
}: GetResolvedVariablesMapParams): Map<`--${string}`, string> => {
	const resolvedVariables = variables
		? Object.entries(variables).map(([varKey, varPath]) => {
				const resolved = resolveVariable({ varPath, ...params });
				return [`--${varKey}`, resolved] as const;
			})
		: [];

	const resolvedMap = new Map(resolvedVariables);
	return resolvedMap;
};

/**
 * Returns the cssforge reference paths actually used by `var(--alias)` calls in a value.
 */
export const getReferencePaths = ({
	value,
	variables,
}: {
	value: string;
	variables: Variables | undefined;
}): string[] | undefined => {
	if (!variables) return undefined;

	const referencePaths = getCssVariableReferences(value)
		.map((cssVariable) => {
			const path = variables[cssVariable.slice(2)];
			return path ? normalizeTokenPath(path) : undefined;
		})
		.filter((path): path is string => Boolean(path));

	return referencePaths.length > 0 ? Array.from(new Set(referencePaths)) : undefined;
};

/**
 * Resolves a CSS variable value using a map of variable paths. It replaces the
 * alias name inside each `var()` call with the referenced CSS custom property
 * name, keeping any fallback and surrounding whitespace intact. Names that are
 * absent from the map are left untouched, which is the native-CSS escape hatch
 * for custom properties owned by the consumer.
 */
export const resolveValue = ({
	map,
	value,
}: {
	map: Map<string, string>;
	value: string;
}) =>
	replaceCssVariableReferences(value, (cssVariable, match) =>
		match.replace(cssVariable, map.get(cssVariable) ?? cssVariable),
	);
