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
 * Characters a name segment may contribute to a custom property name. Segments
 * are joined with hyphens when the property name is built, so a segment only
 * needs identifier characters. Non-ASCII code points stay accepted, because CSS
 * identifiers allow them.
 */
const invalidNameSegmentPattern = /[^\w\-\u0080-\u{10FFFF}]/u;

/**
 * Raised by {@link validateName} for a configuration name that cannot produce a
 * valid CSS custom property name. Modules re-throw this type so a configuration
 * mistake is not swallowed by per-token error handling.
 */
export class InvalidNameError extends Error {
	override name = "InvalidNameError";
}

/**
 * Validates a name segment used to build a CSS custom property name.
 * Throws an error if the name is invalid.
 *
 * `path` is the configuration path the segment was read from, so the error can
 * point at the exact configuration entry.
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
 * Validates the CSS characters of a name segment used to build a custom property
 * name or a `var(--...)` reference. This is the part of {@link validateName} that
 * alias keys and typography `customLabel` values need: those fields are not token
 * keys, so the reserved-keyword and period rules must not apply to them.
 */
function validateNameCharacters(name: string, path: string): void {
	if (!invalidNameSegmentPattern.test(name)) return;
	throw new InvalidNameError(
		`Invalid name: ${name} at configuration path "${path}". Names must be valid ` +
			`CSS identifier segments: letters, digits, hyphens, underscores and ` +
			`non-ASCII characters only.`,
	);
}

/**
 * Validates the alias keys of a `variables` map.
 *
 * `getResolvedVariablesMap` builds the emitted reference as `` `--${varKey}` ``,
 * so a key is validated verbatim as authored: a key written `--alias` already
 * includes its hyphens. An empty key is rejected because it emits the
 * unresolvable `var(--)`. Only the CSS character rule applies, so alias keys that
 * collide with a reserved keyword keep working.
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
		const aliasPath = `${path}.variables.${aliasKey}`;
		if (aliasKey.length === 0) {
			throw new InvalidNameError(
				`Invalid name: ${aliasKey} at configuration path "${aliasPath}". Alias keys ` +
					`must be non-empty, because an empty key emits the unresolvable ` +
					`reference "var(--)".`,
			);
		}
		validateNameCharacters(aliasKey, aliasPath);
	}
}

/**
 * Validates a typography `settings.customLabel` value.
 *
 * Label values are interpolated into generated keys, so they must contribute
 * valid identifier characters. They are display labels rather than token keys, so
 * only the CSS character rule applies and existing labels such as `value` keep
 * working.
 */
export function validateCustomLabel(label: string, path: string): void {
	validateNameCharacters(label, path);
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

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const quoted = (values: readonly string[]) =>
	values.map((value) => `"${value}"`).join(", ");

/** Rejects a key no setting at this level accepts, rather than ignoring it. */
export function assertKnownKeys(
	value: object,
	allowed: readonly string[],
	path: string,
): void {
	const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
	if (unknown.length === 0) return;

	const use =
		allowed.length === 0 ? "This level reads no settings." : `Use ${quoted(allowed)}.`;
	throw new Error(`Unknown setting at "${path}": ${quoted(unknown)}. ${use}`);
}

/** Checks a settings object read at `path`: an object of known keys, or absent. */
export function assertSettingsKeys(
	settings: unknown,
	allowed: readonly string[],
	path: string,
): void {
	if (settings === undefined) return;
	if (!isRecord(settings)) {
		throw new Error(`Invalid configuration at "${path}": settings must be an object.`);
	}

	assertKnownKeys(settings, allowed, path);
}

/** Reads a `settings` value a JavaScript config can write where no type declares one. */
export const unreadSettings = (value: object): unknown =>
	"settings" in value ? (value as { settings?: unknown }).settings : undefined;
