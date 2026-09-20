const reservedKeyWords = [
	"spacing",
	"spacing_fluid",
	"typography",
	"typography_fluid",
	"theme",
	"gradients",
	"palette",
];

/**
 * Matches the characters a name segment may contribute to a CSS custom property
 * name.
 *
 * CSS Syntax defines an identifier as `[-]*` followed by a letter, underscore or
 * non-ASCII code point, followed by letters, digits, hyphens, underscores and
 * non-ASCII code points. Segments are joined with hyphens when the property name
 * is built (`--module-key`), so a segment only has to contribute identifier
 * characters. That keeps existing numeric keys such as `palette.coral.50` working
 * (`--palette-coral-50` is a valid dashed identifier) while rejecting whitespace,
 * CSS delimiters and anything that would need escaping. Non-ASCII code points stay
 * accepted, because CSS identifiers allow them and rejecting them would turn this
 * rule into an accidental ASCII-only restriction.
 */
const invalidNameSegmentPattern = /[^\w\-\u0080-\u{10FFFF}]/u;

/**
 * Raised by {@link validateName} for a configuration name that cannot produce a
 * valid CSS custom property name.
 *
 * Module code wraps ordinary runtime failures so one bad token does not abort a
 * whole module. A name error is a configuration mistake rather than a token
 * failure, so those blocks re-throw this type instead of logging and continuing.
 */
export class InvalidNameError extends Error {
	override name = "InvalidNameError";
}

/**
 * Validates a name segment used to build a CSS custom property name.
 * Throws an error if the name is invalid.
 *
 * `path` is the configuration path the segment was read from. Pass it whenever
 * the caller knows it, so the error can point at the exact configuration entry.
 *
 * @example
 * ```ts
 * validateName("valid-name"); // returns true
 * validateName("invalid.name"); // throws error
 * validateName("card button", "primitives.card button"); // throws error
 * ```
 */
export function validateName(name: string, path?: string): boolean {
	const location = path ? ` at configuration path "${path}"` : "";
	if (name.length === 0 || name.includes(".") || name === "value") {
		throw new InvalidNameError(
			`Invalid name: ${name}${location}. Names must be non-empty strings that do not contain periods.`,
		);
	}
	if (reservedKeyWords.includes(name)) {
		throw new InvalidNameError(
			`Invalid name: ${name}${location}. Names cannot be one of the reserved keywords: ${reservedKeyWords.join(
				", ",
			)}`,
		);
	}
	if (invalidNameSegmentPattern.test(name)) {
		throw new InvalidNameError(
			`Invalid name: ${name}${location}. Names must be valid CSS identifier segments: ` +
				`letters, digits, hyphens, underscores and non-ASCII characters only.`,
		);
	}
	return true;
}

/**
 * Validates the alias keys of a `variables` map.
 *
 * Alias keys become the emitted `var(--alias)` reference, so they follow the
 * same rule as every other name segment. A key written as `--alias` is accepted;
 * the leading hyphens describe the CSS form the author reads, not the segment.
 *
 * @example
 * ```ts
 * validateVariableAliases({ aliases: { bg: "palette.coral.50" }, path: "primitives.card.default" });
 * validateVariableAliases({ aliases: { "my color": "palette.coral.50" }, path: "primitives.card.default" }); // throws error
 * ```
 */
export function validateVariableAliases({
	aliases,
	path,
}: {
	aliases: Record<string, unknown> | undefined;
	path: string;
}): void {
	if (!aliases) return;
	for (const aliasKey of Object.keys(aliases)) {
		validateName(
			aliasKey.startsWith("--") ? aliasKey.slice(2) : aliasKey,
			`${path}.variables.${aliasKey}`,
		);
	}
}

/**
 * Converts a pixel value to a rem value.
 * If the value is not in pixels, it returns the original value.
 * @example
 * ```ts
 * pxToRem({ value: "16px" }); // "1rem"
 * pxToRem({ value: "1rem" }); // "1rem"
 * pxToRem({ value: "32px", rem: 16 }); // "2rem"
 * ```
 */
export function pxToRem({ value, rem = 16 }: { value: string; rem?: number }): string {
	const pxMatch = value.endsWith("px");
	if (pxMatch) {
		const pxValue = parseFloat(value.slice(0, -2));
		const remValue = pxValue / rem;
		return `${remValue}rem`;
	}
	return value;
}
