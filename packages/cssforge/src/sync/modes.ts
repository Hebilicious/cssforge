/**
 * The modes of the configuration tokens. The generator emits a token once for each scope
 * it lives in; a remote with modes (a Figma collection) holds one token with a value for
 * each mode. This module makes the one from the other, and asks the adapter where each
 * mode of each token goes.
 *
 * - A token at `:root` has the mode `default`.
 * - A `light-dark(light, dark)` value at `:root` has the modes `light` and `dark`.
 * - A token under a selector or an at-rule has the mode named after it, e.g. `.dark`.
 *
 * Tokens with the same custom property in several scopes are one token with several modes.
 *
 * @module
 */

import type { ListedToken } from "../generator.ts";
import { ROOT_SCOPE, scopeParts } from "../lib.ts";
import { DEFAULT_MODE, type DesiredToken, type ModeValues } from "./plan.ts";
import type { RemoteAdapter } from "./remote.ts";

/** A configuration token, or one mode of it, that has no place on the remote. */
export interface SkippedToken {
	name: string;
	sourcePath: string;
	/** The mode that has no place, when the token has others that do. */
	mode?: string;
	reason: string;
}

/** The mode of a scope: `default` for `:root`, else the at-rule and the selector it is under. */
export const modeOfScope = (scope: string): string => {
	if (scope === ROOT_SCOPE) return DEFAULT_MODE;
	const { atRule, selector } = scopeParts(scope);
	return [atRule, selector].filter(Boolean).join(" ");
};

/** The two arguments of a `light-dark()` value, split at its top-level comma. */
export const lightDarkArguments = (value: string): [string, string] | undefined => {
	const trimmed = value.trim();
	if (!/^light-dark\(/i.test(trimmed) || !trimmed.endsWith(")")) return undefined;
	const inner = trimmed.slice("light-dark(".length, -1);
	let depth = 0;
	for (let index = 0; index < inner.length; index++) {
		const character = inner[index];
		if (character === "(") depth++;
		else if (character === ")") depth--;
		else if (character === "," && depth === 0) {
			return [inner.slice(0, index).trim(), inner.slice(index + 1).trim()];
		}
	}
	return undefined;
};

const ALIAS = /^var\((--[a-zA-Z0-9_-]+)\)$/;

const withoutMode = ({ mode: _mode, ...entry }: SkippedToken): SkippedToken => entry;

/** One mode of a listed token: its generated value and its resolved value. */
interface ModeValue {
	mode: string;
	value: string;
	resolvedValue: string;
}

/**
 * A value as one color scheme computes it: each `light-dark(light, dark)` in it, at any depth,
 * becomes its light or its dark argument.
 */
export const inScheme = (value: string, scheme: "light" | "dark"): string => {
	const start = value.search(/light-dark\(/i);
	if (start === -1) return value;
	const open = start + "light-dark(".length;
	let depth = 1;
	let end = open;
	while (end < value.length && depth > 0) {
		if (value[end] === "(") depth++;
		else if (value[end] === ")") depth--;
		end++;
	}
	const pair = lightDarkArguments(value.slice(start, end));
	if (pair === undefined) return value;
	const chosen = scheme === "light" ? pair[0] : pair[1];
	return inScheme(`${value.slice(0, start)}${chosen}${value.slice(end)}`, scheme);
};

/**
 * The modes of a listed token. A token at `:root` whose value depends on the color scheme
 * (a `light-dark()` value, or a value built from one) has the modes `light` and `dark`, each
 * with its own branch of every `light-dark()`.
 */
const modeValuesOf = (token: ListedToken): ModeValue[] => {
	const mode = modeOfScope(token.scope);
	if (mode === DEFAULT_MODE && /light-dark\(/i.test(token.resolvedValue)) {
		return (["light", "dark"] as const).map((scheme) => ({
			mode: scheme,
			value: inScheme(token.value, scheme),
			resolvedValue: inScheme(token.resolvedValue, scheme),
		}));
	}
	return [{ mode, value: token.value, resolvedValue: token.resolvedValue }];
};

/**
 * The configuration tokens that go to the remote, with a value for each mode the target
 * holds, and the tokens and modes that have no place there.
 */
export function desiredTokens(
	tokens: readonly ListedToken[],
	adapter: RemoteAdapter,
	modes: readonly string[],
): { desired: DesiredToken[]; skipped: SkippedToken[] } {
	const held = new Set(modes);
	const groups = new Map<string, ListedToken[]>();
	for (const token of tokens)
		groups.set(token.name, [...(groups.get(token.name) ?? []), token]);

	const desired: DesiredToken[] = [];
	const skipped: SkippedToken[] = [];

	for (const [name, scoped] of groups) {
		const values: ModeValues = {};
		const aliases: ModeValues = {};
		const types = new Set<string>();
		const modeSkips: (SkippedToken & { unheld: boolean })[] = [];
		const main = scoped.find((token) => token.scope === ROOT_SCOPE) ?? scoped[0];
		if (main === undefined) continue;

		for (const token of scoped) {
			for (const { mode, value, resolvedValue } of modeValuesOf(token)) {
				const skip = (reason: string, unheld = false) =>
					modeSkips.push({ name, sourcePath: token.sourcePath, mode, reason, unheld });
				if (!held.has(mode)) {
					skip(`The remote has no mode "${mode}". It holds: ${modes.join(", ")}.`, true);
					continue;
				}
				const mapping = adapter.map({ ...token, value, resolvedValue });
				if ("skip" in mapping) {
					skip(mapping.skip);
					continue;
				}
				types.add(mapping.type);
				values[mode] = mapping.value;
				const alias = ALIAS.exec(value.trim())?.[1];
				if (alias !== undefined) aliases[mode] = alias;
			}
		}

		if (types.size > 1) {
			skipped.push({
				name,
				sourcePath: main.sourcePath,
				reason: `Its modes map to different types on the remote: ${[...types].join(", ")}.`,
			});
			continue;
		}
		const [type] = types;
		if (type === undefined) {
			// No mode has a place: the token is skipped, with the reason of each mode. The mode
			// is named when it is the reason, or when the token has several.
			skipped.push(
				...modeSkips.map(({ unheld, ...entry }) =>
					unheld || modeSkips.length > 1 ? entry : withoutMode(entry),
				),
			);
			continue;
		}
		skipped.push(...modeSkips.map(({ unheld: _unheld, ...entry }) => entry));
		desired.push({
			name,
			type,
			values,
			...(Object.keys(aliases).length > 0 ? { aliases } : {}),
			sourcePath: main.sourcePath,
			description: `cssforge: ${main.sourcePath}`,
		});
	}

	return { desired, skipped };
}
