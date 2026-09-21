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

/**
 * The CSS scope a declaration is emitted into: the effective chain of wrappers
 * (`selector` and `atRule`) that contains it, or `ROOT_SCOPE` when it is emitted
 * directly into `:root`. Two declarations in the same scope with the same custom
 * property name overwrite each other, so they are a collision.
 */
export const ROOT_SCOPE = ":root";

export interface ResolvedToken extends TokenMetadata {
	/** CSS custom property name, e.g. `--theme-light-content-primary`. */
	key: string;
	/** The generated CSS value. This may contain `var(...)` references. */
	value: string;
	/** The full CSS declaration. */
	variable: string;
	/**
	 * The effective wrapper chain this declaration is emitted into, recorded by
	 * the module that emitted it. Declarations without a wrapper share
	 * `ROOT_SCOPE`, so an unscoped theme and an unscoped module declaration are
	 * compared as the same scope.
	 *
	 * This is non-enumerable: the resolve map is serialized into snapshots and
	 * public JSON output, and the scope is generator bookkeeping rather than
	 * part of the token's published shape. Read it with `getTokenScope`.
	 */
	readonly scope?: string;
}

/**
 * Returns the effective CSS scope of a token, defaulting to `ROOT_SCOPE` for
 * declarations emitted directly into `:root`.
 */
export const getTokenScope = (token: ResolvedToken): string => token.scope ?? ROOT_SCOPE;

/**
 * Attaches the emitting module's wrapper chain to a resolved token without
 * making it enumerable, so the token's serialized shape is unchanged.
 */
export const withTokenScope = <T extends ResolvedToken>(
	token: T,
	scope: string | undefined,
): T => {
	if (!scope || scope === ROOT_SCOPE) return token;

	Object.defineProperty(token, "scope", {
		value: scope,
		enumerable: false,
		writable: true,
		configurable: true,
	});

	return token;
};

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
 * Aliases for a token's value: keys are the names referenced as `var(--key)`,
 * written without the `--` prefix, and values are cssforge token paths. A key
 * must be usable as a custom-property name once prefixed, so it cannot be empty
 * or contain whitespace, `(`, `)`, `,`, `"`, or `'`.
 */
export interface Variables {
	[key: string]: string;
}

const cssVariableNamePattern = /^--[^\s(),"']+$/;

/** Index of the `)` closing `var(`, or -1 when unbalanced. */
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
 * Index of the first `(` after `var(` at `varIndex`, skipping comments and
 * whitespace, or -1 when this is not a `var()` function.
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

/** Index of the first non-whitespace, non-comment character in `[start, end)`. */
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
 * The replacer receives the custom property name, the full `var(...)` match,
 * and its index, and must return the replacement for that whole match. `match`
 * arrives nested-resolved, so `resolveValue` can substitute only the name token
 * and keep a fallback intact. Malformed, unbalanced, unnamed, and quoted `var(`
 * text keeps its original value and is never reported to the replacer; unmapped
 * names are reported so the caller can leave them unchanged.
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
			// Emit the rest verbatim; rewriting inside a malformed call would
			// change references that belong to it.
			index = value.length;
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
