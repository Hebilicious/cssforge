/**
 * A minimal MCP client over standard input and output: it starts a server process, makes
 * the handshake, and calls tools. Token sync uses it to talk to the MCP server of a
 * design tool. It has no dependency beyond Node.js.
 *
 * @module
 */

import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { createInterface } from "node:readline";

/** The MCP revision that the client asks for. */
const PROTOCOL_VERSION = "2025-06-18";

/** A failure to start the server or to get an answer from it. */
export class McpClientError extends Error {
	/** `spawn`: the server did not start. `protocol`: it did not answer as MCP. `tool`: a tool failed. */
	readonly reason: "spawn" | "protocol" | "tool";

	constructor(message: string, reason: "spawn" | "protocol" | "tool") {
		super(message);
		this.name = "McpClientError";
		this.reason = reason;
	}
}

/** The text items of a tool result, in order. */
export type ToolText = string[];

interface Pending {
	resolve: (message: Record<string, unknown>) => void;
	reject: (error: Error) => void;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

export interface McpClient {
	/** Calls a tool, and gives the text items of its result. A tool error rejects. */
	callTool(name: string, args: Record<string, unknown>): Promise<ToolText>;
	/** Stops the server process. */
	close(): void;
}

/**
 * Starts `command` with `args` as an MCP server and makes the handshake. Rejects with a
 * {@link McpClientError} when the process does not start or does not answer.
 */
export async function connectMcp(
	command: string,
	args: readonly string[],
	signal?: AbortSignal,
): Promise<McpClient> {
	const child: ChildProcessWithoutNullStreams = spawn(command, args, {
		stdio: ["pipe", "pipe", "pipe"],
	});
	const pending = new Map<number, Pending>();
	let nextId = 1;
	let ended: McpClientError | undefined;
	let stderr = "";

	const fail = (error: McpClientError) => {
		ended ??= error;
		for (const waiter of pending.values()) waiter.reject(ended);
		pending.clear();
	};

	child.stderr.on("data", (chunk: Buffer) => {
		stderr = `${stderr}${chunk.toString()}`.slice(-2000);
	});
	child.on("error", (error: NodeJS.ErrnoException) => {
		fail(
			new McpClientError(
				error.code === "ENOENT"
					? `The command "${command}" was not found. Install it, or put it on the PATH.`
					: `The command "${command}" did not start: ${error.message}`,
				"spawn",
			),
		);
	});
	child.on("exit", (code) => {
		const detail = stderr.trim() ? `: ${stderr.trim()}` : ".";
		fail(
			new McpClientError(
				`The MCP server "${command}" stopped with code ${code}${detail}`,
				"protocol",
			),
		);
	});

	createInterface({ input: child.stdout }).on("line", (line) => {
		if (!line.trim()) return;
		let message: unknown;
		try {
			message = JSON.parse(line);
		} catch {
			return;
		}
		if (!isRecord(message) || typeof message.id !== "number") return;
		const waiter = pending.get(message.id);
		if (!waiter) return;
		pending.delete(message.id);
		waiter.resolve(message);
	});

	const send = (message: Record<string, unknown>) =>
		child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", ...message })}\n`);

	const request = (method: string, params: Record<string, unknown>) =>
		new Promise<Record<string, unknown>>((resolve, reject) => {
			if (ended) return reject(ended);
			const id = nextId++;
			pending.set(id, { resolve, reject });
			send({ id, method, params });
		}).then((message) => {
			if (isRecord(message.error)) {
				throw new McpClientError(
					`The MCP server answered ${method} with an error: ${String(message.error.message)}`,
					"protocol",
				);
			}
			return isRecord(message.result) ? message.result : {};
		});

	const close = () => {
		child.stdin.end();
		child.kill();
	};
	signal?.addEventListener("abort", close, { once: true });

	try {
		await request("initialize", {
			protocolVersion: PROTOCOL_VERSION,
			capabilities: {},
			clientInfo: { name: "cssforge", version: "0" },
		});
	} catch (error) {
		close();
		throw error;
	}
	send({ method: "notifications/initialized" });

	return {
		close,
		async callTool(name, args) {
			const result = await request("tools/call", { name, arguments: args });
			const content = Array.isArray(result.content) ? result.content : [];
			const text = content.flatMap((item) =>
				isRecord(item) && item.type === "text" && typeof item.text === "string"
					? [item.text]
					: [],
			);
			if (result.isError === true) {
				throw new McpClientError(`The tool ${name} failed: ${text.join(" ")}`, "tool");
			}
			return text;
		},
	};
}
