import type { CSSForgeConfig } from "./config.ts";
import { collectResolveMap } from "./generator.ts";
import {
	getTokenScopeContext,
	normalizeTokenPath,
	type ResolvedToken,
	type ResolveMap,
	ROOT_SCOPE,
	replaceCssVariableReferences,
	type TokenScope,
} from "./lib.ts";

/**
 * Build-time analysis of references that are not available on the element where
 * the alias is computed.
 *
 * A custom property is substituted when the declaration containing the `var()`
 * call is computed, on the element that declaration applies to. A `:root` alias
 * that references a property declared only under a narrower selector or an
 * at-rule therefore has no value there, and every use of the alias falls back
 * or becomes invalid. CSS Forge knows the configuration path, the generated
 * property name and the emitted wrapper chain of both declarations, so it can
 * report the assumption a configuration depends on without modelling selectors
 * or the browser cascade.
 *
 * The analysis is deliberately conservative: it reports a reference only when
 * the emitted declarations prove the referenced property cannot reach the
 * consumer, or when reaching it requires a specific DOM arrangement. Unknown
 * relationships between two selectors, two different at-rules, or references to
 * custom properties CSS Forge does not generate stay silent.
 */

/** The part of a declaration's scope that does not cover the alias it feeds. */
export type ScopeDiagnosticIssue = "selector" | "at-rule";

/**
 * A generated declaration, described by its configuration path and emitted
 * scope. The scope fields are the normalized `TokenScope` of the declaration.
 */
export interface ScopeDiagnosticDeclaration extends TokenScope {
	/** The cssforge configuration path of the declaration. */
	path: string;
	/** The generated CSS custom property name. */
	key: string;
}

/**
 * A warning about a `var()` reference that the alias cannot resolve where it is
 * computed.
 */
export interface ScopeDiagnostic {
	/** Stable identifier for programmatic handling. */
	code: "scope-unavailable-reference";
	/** Diagnostics are warnings; generation succeeds unless strict mode is on. */
	severity: "warning";
	/** Actionable description naming both configuration paths and both scopes. */
	message: string;
	/** The declaration that computes the reference. */
	consumer: ScopeDiagnosticDeclaration;
	/** The custom property the consumer references. */
	referenceKey: string;
	/** Every configured declaration of `referenceKey`, with its emitted scope. */
	sources: ScopeDiagnosticDeclaration[];
	/** Which scope parts of the sources do not cover the consumer. */
	issues: ScopeDiagnosticIssue[];
}

const SUPPRESSION_SHAPE_MESSAGE =
	'Invalid configuration at "diagnostics.suppress": expected an array of non-empty configuration paths, or "*" to silence every scope diagnostic.';

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Reads the suppression list from a configuration that reaches the library as
 * untrusted data, because a config file is arbitrary JavaScript at runtime.
 */
const readSuppressions = (config: Partial<CSSForgeConfig>): Set<string> => {
	const diagnostics: unknown = (config as { diagnostics?: unknown }).diagnostics;

	if (diagnostics === undefined) return new Set();

	if (!isRecord(diagnostics)) {
		throw new Error(
			'Invalid configuration at "diagnostics": expected an object with an optional "suppress" array.',
		);
	}

	const suppress: unknown = diagnostics.suppress;
	if (suppress === undefined) return new Set();
	if (!Array.isArray(suppress)) throw new Error(SUPPRESSION_SHAPE_MESSAGE);

	const suppressions = new Set<string>();
	for (const entry of suppress as unknown[]) {
		if (typeof entry !== "string" || entry.trim() === "") {
			throw new Error(SUPPRESSION_SHAPE_MESSAGE);
		}
		// Historical configurations may still carry `value` wrapper segments.
		suppressions.add(entry === "*" ? entry : normalizeTokenPath(entry.trim()));
	}

	return suppressions;
};

/**
 * Returns the custom properties a declaration references directly, in the
 * emitted value. A reference inside the fallback of an enclosing `var()` is not
 * reported: it is only reached when the enclosing reference is unavailable,
 * which the scope comparison already covers.
 */
const topLevelReferences = (value: string): string[] => {
	const references = new Set<string>();

	replaceCssVariableReferences(value, (cssVariable, match, _index, depth) => {
		if (depth === 0) references.add(cssVariable);
		return match;
	});

	return [...references];
};

const hasTopLevelCombinator = (compound: string): boolean => {
	let depth = 0;
	let quote = "";

	for (let index = 0; index < compound.length; index += 1) {
		const character = compound[index];

		if (quote) {
			if (character === "\\") index += 1;
			else if (character === quote) quote = "";
			continue;
		}

		if (character === '"' || character === "'") {
			quote = character;
			continue;
		}

		if (character === "(" || character === "[") {
			depth += 1;
			continue;
		}

		if (character === ")" || character === "]") {
			depth -= 1;
			continue;
		}

		if (depth > 0) continue;
		if (character === ">" || character === "+" || character === "~") return true;
		if (/\s/.test(character)) return true;
	}

	return false;
};

/** Splits a selector list on top-level commas, ignoring nested functions and attributes. */
const splitSelectorList = (selector: string): string[] => {
	const compounds: string[] = [];
	let current = "";
	let depth = 0;
	let quote = "";

	for (let index = 0; index < selector.length; index += 1) {
		const character = selector[index];

		if (quote) {
			current += character;
			if (character === "\\") {
				index += 1;
				current += selector[index] ?? "";
			} else if (character === quote) {
				quote = "";
			}
			continue;
		}

		if (character === '"' || character === "'") {
			quote = character;
			current += character;
			continue;
		}

		if (character === "(" || character === "[") depth += 1;
		else if (character === ")" || character === "]") depth -= 1;

		if (character === "," && depth === 0) {
			compounds.push(current.trim());
			current = "";
			continue;
		}

		current += character;
	}

	compounds.push(current.trim());

	return compounds.filter((compound) => compound.length > 0);
};

/**
 * Classifies one compound selector against the root element. Only forms whose
 * relationship to the root is certain are classified; everything else stays
 * `maybe`, so a surprising selector weakens the claim instead of strengthening it.
 */
const compoundRootMatch = (compound: string): "root" | "excluded" | "maybe" => {
	if (hasTopLevelCombinator(compound)) return "excluded";
	if (/:not\(\s*:root\s*\)/.test(compound)) return "excluded";

	// A leading type selector narrows the element kind: the root element is `html`.
	const leadingType = /^\s*(\*|[a-zA-Z][\w-]*)/.exec(compound)?.[1]?.toLowerCase();
	if (leadingType && leadingType !== "*" && leadingType !== "html") return "excluded";
	if (leadingType === "*" || leadingType === "html") return "root";

	return compound.includes(":root") ? "root" : "maybe";
};

/**
 * Describes whether a selector list can apply to the root element.
 *
 * - `root`: at least one branch applies to the root element, so the declaration
 *   reaches a root consumer. That branch may still require a class, id, or
 *   attribute on the root, which the configuration states itself.
 * - `assumption`: no branch is constrained to the root element, but at least one
 *   can match it when the page puts the class, id, or attribute on `<html>`.
 * - `never`: no branch can match the root element.
 */
const classifySelector = (selector: string): "root" | "assumption" | "never" => {
	const compounds = splitSelectorList(selector).map(compoundRootMatch);

	if (compounds.length === 0 || compounds.every((match) => match === "excluded")) {
		return "never";
	}

	// One branch that applies to the root element makes the declaration
	// available there, whatever the other branches in the list target.
	if (compounds.some((match) => match === "root")) return "root";

	return "assumption";
};

/**
 * Returns `false` when the source condition is provably narrower than the
 * consumer's, and `undefined` when two different conditions cannot be compared.
 */
const conditionCovers = (
	sourceAtRule: string | undefined,
	consumerAtRule: string | undefined,
): boolean | undefined => {
	const source = sourceAtRule?.trim();
	if (!source) return true;

	const consumer = consumerAtRule?.trim();
	if (!consumer) return false;
	if (source === consumer) return true;

	return undefined;
};

/**
 * Resolves whether the source declaration applies to the element the consumer
 * is computed on. Only a consumer declared in `:root` has a known element, so a
 * consumer with its own selector stays unknown and is never reported.
 */
const selectorCovers = (
	source: ScopeDiagnosticDeclaration,
	consumer: ScopeDiagnosticDeclaration,
): { covers: true } | { covers: false; match: "assumption" | "never" } => {
	if (!source.selector) return { covers: true };
	if (consumer.selector) return { covers: true };

	const match = classifySelector(source.selector);
	return match === "root" ? { covers: true } : { covers: false, match };
};

const toDeclaration = (token: ResolvedToken): ScopeDiagnosticDeclaration => ({
	path: token.sourcePath,
	key: token.key,
	// `getTokenScopeContext` returns the normalized wrapper chain, or `undefined`
	// for a declaration emitted into `:root` with no wrapper.
	...(getTokenScopeContext(token) ?? {}),
});

const indexDeclarations = (
	resolveMap: ResolveMap,
): Map<string, ScopeDiagnosticDeclaration[]> => {
	const declarations = new Map<string, ScopeDiagnosticDeclaration[]>();

	for (const token of resolveMap.values()) {
		const declaration = toDeclaration(token);
		declarations.set(declaration.key, [
			...(declarations.get(declaration.key) ?? []),
			declaration,
		]);
	}

	return declarations;
};

const consumerPlacement = ({ selector, atRule }: ScopeDiagnosticDeclaration): string =>
	`at ${selector ?? ROOT_SCOPE}${atRule ? ` under ${atRule}` : ""}`;

const sourcePlacement = ({ selector, atRule }: ScopeDiagnosticDeclaration): string => {
	if (atRule) return selector ? `under ${atRule} in ${selector}` : `under ${atRule}`;
	return selector ? `under ${selector}` : `at ${ROOT_SCOPE}`;
};

interface BlockingSource {
	declaration: ScopeDiagnosticDeclaration;
	conditionFailed: boolean;
	selectorMatch?: "assumption" | "never";
}

const describeBlockingSource = ({ declaration }: BlockingSource): string =>
	`${declaration.path} ${sourcePlacement(declaration)}`;

const buildMessage = (
	consumer: ScopeDiagnosticDeclaration,
	referenceKey: string,
	blocking: BlockingSource[],
): string => {
	const clauses = [
		`Token ${consumer.path} (${consumer.key}) is emitted ${consumerPlacement(consumer)}, but its referenced token ${referenceKey} is only emitted by ${blocking
			.map(describeBlockingSource)
			.join("; ")}.`,
	];

	const selectorBlocking = blocking.filter((entry) => entry.selectorMatch);
	if (selectorBlocking.length > 0) {
		const selectors = [
			...new Set(
				selectorBlocking
					.map((entry) => entry.declaration.selector)
					.filter((selector): selector is string => Boolean(selector)),
			),
		].join(" or ");
		const assumed = selectorBlocking.some(
			(entry) => entry.selectorMatch === "assumption",
		);

		clauses.push(
			assumed
				? `A var() reference is substituted where the alias is declared, so ${selectors} must match the root element, or an external declaration must provide ${referenceKey} there.`
				: `A var() reference is substituted where the alias is declared, so ${selectors} can never provide ${referenceKey} on the root element. Emit the source in ${ROOT_SCOPE}, or give the alias the same selector.`,
		);
	}

	if (blocking.some((entry) => entry.conditionFailed)) {
		clauses.push(
			"The source is only declared under that condition, so the alias has no value outside it. Emit the source unconditionally, or repeat the condition on the alias.",
		);
	}

	return clauses.join(" ");
};

const toDiagnostic = (
	consumer: ScopeDiagnosticDeclaration,
	referenceKey: string,
	blocking: BlockingSource[],
): ScopeDiagnostic => {
	const issues: ScopeDiagnosticIssue[] = [];
	if (blocking.some((entry) => entry.selectorMatch)) issues.push("selector");
	if (blocking.some((entry) => entry.conditionFailed)) issues.push("at-rule");

	return {
		code: "scope-unavailable-reference",
		severity: "warning",
		message: buildMessage(consumer, referenceKey, blocking),
		consumer,
		referenceKey,
		sources: blocking.map((entry) => entry.declaration),
		issues,
	};
};

/**
 * Reports `var()` references whose only configured source is emitted into a
 * scope that does not cover the declaration computing the reference.
 *
 * @example
 * ```ts
 * const diagnostics = getScopeDiagnostics(config);
 * // [{ code: "scope-unavailable-reference", consumer: { path: "theme.dark.background.primary", key: "--primary", atRule: "@media (prefers-color-scheme: dark)" }, referenceKey: "--palette-another-yellow", ... }]
 * ```
 */
export const getScopeDiagnostics = (
	config: Partial<CSSForgeConfig>,
): ScopeDiagnostic[] => {
	const suppressions = readSuppressions(config);
	// The resolve map is always built so a colliding configuration is rejected
	// here exactly as it is by every generator.
	const resolveMap = collectResolveMap(config);

	if (suppressions.has("*")) return [];

	const declarationsByKey = indexDeclarations(resolveMap);
	const diagnostics: ScopeDiagnostic[] = [];

	for (const token of resolveMap.values()) {
		const consumer = toDeclaration(token);
		if (suppressions.has(consumer.path)) continue;

		for (const referenceKey of topLevelReferences(token.value)) {
			const sources = declarationsByKey.get(referenceKey);
			// A property CSS Forge does not generate is owned by the consumer's page.
			if (!sources) continue;

			const blocking: BlockingSource[] = [];
			// One declaration that reaches the consumer is enough: the referenced
			// property is available, so the reference is not reported.
			let covered = false;

			for (const declaration of sources) {
				const condition = conditionCovers(declaration.atRule, consumer.atRule);
				const selector = selectorCovers(declaration, consumer);
				if (condition !== false && selector.covers) {
					covered = true;
					break;
				}

				blocking.push({
					declaration,
					conditionFailed: condition === false,
					...(selector.covers ? {} : { selectorMatch: selector.match }),
				});
			}

			if (covered || blocking.length === 0) continue;

			diagnostics.push(toDiagnostic(consumer, referenceKey, blocking));
		}
	}

	return diagnostics;
};
