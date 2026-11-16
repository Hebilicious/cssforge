/**
 * Schemas for the capabilities of the CSS Forge application.
 *
 * Each schema is one JSON Schema document that does two jobs: the catalog
 * publishes it, so the command line flags, the MCP tool definitions and the
 * typed handles all come from it, and {@link validate} checks values against
 * it. One document means the published contract and the runtime check cannot
 * disagree.
 *
 * The validator covers the subset of JSON Schema that the catalog uses, and it
 * rejects a schema that uses anything else, so an unsupported keyword cannot be
 * silently ignored.
 *
 * @module
 */

import type { StandardSchemaV1, ToJsonSchema } from "@acid-cat/core-ts";

/** A JSON value. */
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

/** The JSON Schema subset the validator understands. */
export interface JsonSchema {
	type?: "object" | "array" | "string" | "number" | "integer" | "boolean" | "null";
	description?: string;
	properties?: Record<string, JsonSchema>;
	required?: string[];
	additionalProperties?: boolean;
	items?: JsonSchema;
	uniqueItems?: boolean;
	enum?: Json[];
	const?: Json;
	default?: Json;
	minLength?: number;
}

/** The keywords {@link validate} understands. Any other keyword is a programming error. */
const supportedKeywords = new Set<string>([
	"type",
	"description",
	"properties",
	"required",
	"additionalProperties",
	"items",
	"uniqueItems",
	"enum",
	"const",
	"default",
	"minLength",
]);

/** A Standard Schema whose JSON Schema form is the `json` member. */
export interface Schema<Output> extends StandardSchemaV1<unknown, Output> {
	readonly json: JsonSchema;
}

type Issue = StandardSchemaV1.Issue;
type Path = ReadonlyArray<PropertyKey>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
	value !== null && typeof value === "object" && !Array.isArray(value);

const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

const typeMatches = (type: JsonSchema["type"], value: unknown): boolean => {
	switch (type) {
		case undefined:
			return true;
		case "object":
			return isRecord(value);
		case "array":
			return Array.isArray(value);
		case "integer":
			return Number.isInteger(value);
		case "number":
			return typeof value === "number" && Number.isFinite(value);
		case "null":
			return value === null;
		default:
			return typeof value === type;
	}
};

/**
 * Checks `value` against `schema`. The result is the value with the declared
 * `default` of each missing object property filled in, or the issues found.
 * The input value is never changed.
 */
export function validate(
	schema: JsonSchema,
	value: unknown,
	path: Path = [],
): { value: unknown; issues: Issue[] } {
	const issue = (message: string): { value: unknown; issues: Issue[] } => ({
		value,
		issues: [{ message, path }],
	});

	if (!typeMatches(schema.type, value)) {
		return issue(`Expected ${schema.type}.`);
	}
	if (schema.const !== undefined && !sameJson(schema.const, value)) {
		return issue(`Expected ${JSON.stringify(schema.const)}.`);
	}
	if (
		schema.enum !== undefined &&
		!schema.enum.some((member) => sameJson(member, value))
	) {
		return issue(
			`Received ${JSON.stringify(value)}. Expected one of: ${schema.enum.map((member) => String(member)).join(", ")}.`,
		);
	}
	if (
		schema.minLength !== undefined &&
		typeof value === "string" &&
		value.length < schema.minLength
	) {
		return issue(`Expected at least ${schema.minLength} characters.`);
	}

	if (Array.isArray(value)) {
		const issues: Issue[] = [];
		const items = value.map((item, index) => {
			if (schema.items === undefined) return item;
			const result = validate(schema.items, item, [...path, index]);
			issues.push(...result.issues);
			return result.value;
		});
		if (schema.uniqueItems === true) {
			const seen = new Set(items.map((item) => JSON.stringify(item)));
			if (seen.size !== items.length)
				issues.push({ message: "Expected unique items.", path });
		}
		return { value: items, issues };
	}

	if (isRecord(value)) {
		const issues: Issue[] = [];
		const properties = schema.properties ?? {};
		const result: Record<string, unknown> = {};

		for (const name of schema.required ?? []) {
			if (!(name in value)) {
				issues.push({ message: `Missing property ${name}.`, path: [...path, name] });
			}
		}
		for (const [name, member] of Object.entries(value)) {
			const property = properties[name];
			if (property === undefined) {
				if (schema.additionalProperties === false) {
					issues.push({ message: `Unknown property ${name}.`, path: [...path, name] });
				}
				result[name] = member;
				continue;
			}
			const checked = validate(property, member, [...path, name]);
			issues.push(...checked.issues);
			result[name] = checked.value;
		}
		for (const [name, property] of Object.entries(properties)) {
			if (!(name in result) && property.default !== undefined) {
				result[name] = structuredClone(property.default);
			}
		}
		return { value: result, issues };
	}

	return { value, issues: [] };
}

/** Throws when `json`, or a schema inside it, uses a keyword {@link validate} does not understand. */
function assertSupported(json: JsonSchema): void {
	for (const keyword of Object.keys(json)) {
		if (!supportedKeywords.has(keyword)) {
			throw new Error(`The schema keyword ${keyword} is not supported.`);
		}
	}
	for (const property of Object.values(json.properties ?? {})) assertSupported(property);
	if (json.items !== undefined) assertSupported(json.items);
}

/**
 * Makes a Standard Schema from a JSON Schema. `Output` is the TypeScript type
 * of a valid value, with every declared default present; keep it in step with
 * the JSON Schema.
 */
export function schema<Output>(json: JsonSchema): Schema<Output> {
	// Check the schema itself once, so a keyword the validator would ignore
	// fails at start up and not as a value that passes unchecked.
	assertSupported(json);
	return {
		json,
		"~standard": {
			version: 1,
			vendor: "cssforge",
			validate: (value) => {
				const result = validate(json, value);
				return result.issues.length > 0
					? { issues: result.issues }
					: { value: result.value as Output };
			},
		},
	};
}

/**
 * Gives the JSON Schema of a schema made by {@link schema}, for the catalog.
 */
export const toJsonSchema: ToJsonSchema = (standard) => {
	if (!("json" in standard) || !isRecord(standard.json)) {
		throw new Error("Each CSS Forge schema must come from schema().");
	}
	return structuredClone(standard.json) as ReturnType<ToJsonSchema>;
};
