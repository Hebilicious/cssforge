/**
 * A stand-in for the MCP server of Paper Desktop (`paper-design mcp`), in the wire form
 * of Paper 0.5.19: each file tool answers with a text item that names the file, then a
 * text item with the result as JSON. It serves the token tools that sync uses.
 *
 * FAKE_PAPER_STATE is a JSON file with the tokens of the file, kept between processes.
 * FAKE_PAPER_LOG gets one JSON line for each tool call: `{ name, arguments }`.
 */
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";

interface Token {
	name: string;
	type: string;
	value: string | number;
	description?: string;
}

const statePath = process.env.FAKE_PAPER_STATE ?? "";
const logPath = process.env.FAKE_PAPER_LOG ?? "";
const file = { id: "01FAKE", name: "Fake file" };

const readTokens = (): Token[] =>
	existsSync(statePath) ? (JSON.parse(readFileSync(statePath, "utf8")) as Token[]) : [];
const writeTokens = (tokens: Token[]) => writeFileSync(statePath, JSON.stringify(tokens));

const answer = (id: unknown, result: unknown) =>
	process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id, result })}\n`);
const toolResult = (body: unknown) => ({
	content: [
		{ type: "text", text: JSON.stringify({ file, contentHash: { tokens: "0" } }) },
		{ type: "text", text: JSON.stringify(body) },
	],
});

const tools: Record<string, (args: Record<string, unknown>) => unknown> = {
	get_basic_info: () => ({ fileName: file.name, tokens: { items: [] } }),
	get_tokens: () => ({
		tokens: readTokens().map((token) => ({ ...token, value: String(token.value) })),
	}),
	create_tokens: (args) => {
		const tokens = readTokens();
		const results = (args.tokens as Token[]).map((token) => {
			tokens.push(token);
			return { name: token.name, result: "created" };
		});
		writeTokens(tokens);
		return { tokens: results, count: results.length };
	},
	set_tokens: (args) => {
		let tokens = readTokens();
		const edits = args.tokens as {
			name: string;
			newName?: string;
			value?: string;
			delete?: boolean;
		}[];
		const results = edits.map((edit) => {
			const token = tokens.find((candidate) => candidate.name === edit.name);
			if (!token) return { result: "error", message: `Token not found: "${edit.name}".` };
			if (edit.delete) {
				tokens = tokens.filter((candidate) => candidate !== token);
				return { name: edit.name, result: "deleted" };
			}
			if (edit.newName) token.name = edit.newName;
			if (edit.value !== undefined) token.value = edit.value;
			return { name: edit.name, result: "updated" };
		});
		writeTokens(tokens);
		return { tokens: results, count: results.length };
	},
};

createInterface({ input: process.stdin }).on("line", (line) => {
	const message = JSON.parse(line) as {
		id?: unknown;
		method: string;
		params?: Record<string, unknown>;
	};
	if (message.method === "initialize") {
		answer(message.id, {
			protocolVersion: "2025-06-18",
			capabilities: { tools: {} },
			serverInfo: { name: "paper-desktop", version: "0.0.1" },
		});
		return;
	}
	if (message.method !== "tools/call") return;
	const name = String(message.params?.name);
	const args = (message.params?.arguments ?? {}) as Record<string, unknown>;
	appendFileSync(logPath, `${JSON.stringify({ name, arguments: args })}\n`);
	const tool = tools[name];
	answer(
		message.id,
		tool
			? toolResult(tool(args))
			: { isError: true, content: [{ type: "text", text: `Unknown tool ${name}.` }] },
	);
});
