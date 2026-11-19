/**
 * The Paper remote (https://paper.design). It talks to the MCP server of Paper Desktop,
 * which `paper-design mcp` starts, and uses its token tools: `get_basic_info`,
 * `get_tokens`, `create_tokens` and `set_tokens`.
 *
 * @module
 */

import { z } from "zod";
import type { ListedToken, TokenKind } from "../generator.ts";
import { ROOT_SCOPE } from "../lib.ts";
import { connectMcp, McpClientError } from "./mcp-client.ts";
import { type Operation, TOKEN_NAME } from "./plan.ts";
import {
	type ApplyResult,
	type RemoteAdapter,
	RemoteError,
	type RemoteSession,
	type TokenMapping,
} from "./remote.ts";

/** The token types of Paper. */
type PaperType =
	| "breakpoint"
	| "color"
	| "container"
	| "fontFamily"
	| "fontSize"
	| "fontWeight"
	| "letterSpacing"
	| "lineHeight"
	| "opacity"
	| "radius"
	| "spacing";

/** The Paper type of each token kind that Paper stores. */
const paperTypes: Partial<Record<TokenKind, PaperType>> = {
	color: "color",
	spacing: "spacing",
	fontSize: "fontSize",
	fontWeight: "fontWeight",
	fontFamily: "fontFamily",
	lineHeight: "lineHeight",
	letterSpacing: "letterSpacing",
	borderRadius: "radius",
	opacity: "opacity",
};

/**
 * The typography module emits two kinds under one token kind: the font weights of
 * `typography.weight` and the fluid sizes of `typography_fluid`.
 */
const typographyType = (sourcePath: string): PaperType | undefined => {
	if (sourcePath.startsWith("typography.weight.")) return "fontWeight";
	if (sourcePath.startsWith("typography_fluid.")) return "fontSize";
	return undefined;
};

/** Paper types whose numbers Paper takes as JSON numbers. */
const numericTypes = new Set<string>(["fontWeight", "lineHeight", "opacity"]);

const LENGTH = /^-?\d*\.?\d+(?:px|rem|em|%|vw|vh|vmin|vmax|ch|ex)?$/i;
const SIZE_FUNCTION = /^(?:clamp|calc|min|max)\(/i;
/** The helper tokens of a `pow()` type scale: unitless inputs and partial terms. */
const POW_SCALE_PATH = /\.pow(?:[.@]|$)/;

/**
 * Maps a configuration token to Paper. Paper has no modes, so a token scoped to a selector
 * or an at-rule has no place. Paper rejects `color-mix()` and references inside a value.
 */
export function mapToPaper(token: ListedToken): TokenMapping {
	if (token.scope !== ROOT_SCOPE) {
		return { skip: `It is scoped to ${token.scope}, and Paper has no modes.` };
	}
	const type =
		token.kind === "typography"
			? typographyType(token.sourcePath)
			: paperTypes[token.kind];
	if (type === undefined) return { skip: `Paper has no ${token.kind} tokens.` };

	const value = token.resolvedValue.trim();
	if (value.includes("var(")) {
		return {
			skip: "Its value references a custom property that the configuration does not declare.",
		};
	}
	if (type === "color" && /(?:color-mix|light-dark)\(/i.test(value)) {
		return { skip: "Paper does not take color-mix() or light-dark() values." };
	}
	if (type === "fontSize") {
		if (POW_SCALE_PATH.test(token.sourcePath)) {
			return {
				skip: "It is part of a pow() type scale; the clamp() scale is synced instead.",
			};
		}
		if (!LENGTH.test(value) && !SIZE_FUNCTION.test(value)) {
			return { skip: "Its value is not a size." };
		}
	}
	return { type, value };
}

// --- MCP results ----------------------------------------------------------------------------

/** Each file-scoped Paper tool answers with the file first, then the result. */
const resultOf = <T>(schema: z.ZodType<T>, text: readonly string[], tool: string): T => {
	const body = text.at(-1);
	try {
		return schema.parse(JSON.parse(body ?? ""));
	} catch {
		throw new RemoteError(
			"RemoteFailed",
			`Paper answered ${tool} in a form that cssforge does not read: ${body ?? "(nothing)"}`,
		);
	}
};

const basicInfo = z.object({ fileName: z.string() });
const fileHeader = z.object({ file: z.object({ id: z.string(), name: z.string() }) });
const tokenList = z.object({
	tokens: z.array(
		z.object({
			// The rule of the state file, so that a fetch never records a name it cannot read back.
			name: z.string().regex(TOKEN_NAME),
			type: z.string(),
			value: z.union([z.string(), z.number()]),
			description: z.string().optional(),
		}),
	),
});
const entryResults = z.object({
	tokens: z.array(z.object({ result: z.string(), message: z.string().optional() })),
});

const paperValue = (type: string, value: string): string | number =>
	numericTypes.has(type) && /^-?\d*\.?\d+$/.test(value) ? Number(value) : value;

/** An operation that `set_tokens` carries out: everything but a create. */
type Change = Exclude<Operation, { op: "create" }>;

const isChange = (operation: Operation): operation is Change => operation.op !== "create";

/** The `set_tokens` entry of a change. */
const setTokensEntry = (operation: Change) => {
	switch (operation.op) {
		case "update":
			return {
				name: operation.name,
				value: paperValue(operation.type, operation.value),
				description: operation.description,
			};
		case "rename":
			return { name: operation.from, newName: operation.to };
		case "delete":
			return { name: operation.name, delete: true };
	}
};

// --- Adapter --------------------------------------------------------------------------------

export interface PaperOptions {
	/** The command that serves the MCP server of Paper Desktop. */
	command?: string;
	args?: readonly string[];
}

/** The Paper remote. */
export function paperAdapter({
	command = "paper-design",
	args = ["mcp"],
}: PaperOptions = {}): RemoteAdapter {
	return {
		kind: "paper",
		map: mapToPaper,
		async open(signal) {
			const client = await connectMcp(command, args, signal).catch((error: unknown) => {
				throw new RemoteError(
					"RemoteUnavailable",
					error instanceof Error
						? `Paper is not reachable: ${error.message} Start Paper Desktop and open the file.`
						: String(error),
				);
			});
			let calls = 0;
			const call = async (tool: string, input: Record<string, unknown>) => {
				calls += 1;
				try {
					return await client.callTool(tool, input);
				} catch (error) {
					if (error instanceof McpClientError && error.reason === "tool") {
						throw new RemoteError("RemoteFailed", error.message);
					}
					throw new RemoteError(
						"RemoteUnavailable",
						error instanceof Error ? error.message : String(error),
					);
				}
			};

			const session: RemoteSession = {
				get calls() {
					return calls;
				},
				close: () => client.close(),
				async describe(file) {
					const text = await call("get_basic_info", { fileId: file });
					const header = fileHeader.safeParse(JSON.parse(text[0] ?? "null"));
					const info = resultOf(basicInfo, text, "get_basic_info");
					if (!header.success) {
						throw new RemoteError(
							"RemoteFailed",
							"Paper did not say which file it read.",
						);
					}
					return { id: header.data.file.id, name: info.fileName };
				},
				async read(file) {
					const text = await call("get_tokens", { fileId: file, format: "json" });
					return resultOf(tokenList, text, "get_tokens").tokens.map((token) => ({
						name: token.name,
						type: token.type,
						value: String(token.value),
						...(token.description === undefined
							? {}
							: { description: token.description }),
					}));
				},
				async apply(file, operations) {
					const creates = operations.filter((operation) => operation.op === "create");
					const changes = operations.filter(isChange);
					const results: ApplyResult[] = [];

					const report = (
						batch: readonly Operation[],
						text: readonly string[],
						tool: string,
					) => {
						const entries = resultOf(entryResults, text, tool).tokens;
						batch.forEach((operation, index) => {
							const entry = entries[index];
							const ok = entry !== undefined && entry.result !== "error";
							results.push({
								operation,
								ok,
								...(ok ? {} : { message: entry?.message ?? "Paper gave no result." }),
							});
						});
					};

					if (creates.length > 0) {
						const text = await call("create_tokens", {
							fileId: file,
							tokens: creates.map((operation) => ({
								type: operation.type,
								name: operation.name,
								value: paperValue(operation.type, operation.value),
								description: operation.description,
							})),
						});
						report(creates, text, "create_tokens");
					}
					if (changes.length > 0) {
						const text = await call("set_tokens", {
							fileId: file,
							tokens: changes.map(setTokensEntry),
						});
						report(changes, text, "set_tokens");
					}
					return results;
				},
			};
			return session;
		},
	};
}
