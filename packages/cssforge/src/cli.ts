#!/usr/bin/env node
/**
 * The `cssforge` command line. Its commands are the capabilities of
 * `capabilities.ts`, and `cssforge mcp` serves the same capabilities to an
 * agent as an MCP server through standard input and output.
 *
 * @module
 */

import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import type { CliCommand } from "@acid-cat/core-ts";
import { runCli, runMcpStdio } from "@acid-cat/core-ts";
import { cssforge, type ForgeContext } from "./capabilities.ts";
import { toJsonSchema } from "./schema.ts";
import { version } from "./version.ts";

const description =
	"Generate CSS custom properties, JSON, TypeScript and Style Dictionary tokens from a CSS Forge configuration.";

/** `cssforge mcp`: the MCP server, through standard input and output. */
const mcpCommand: CliCommand<ForgeContext> = {
	name: "mcp",
	description:
		"Serve the cssforge commands to an agent over MCP, through standard input and output.",
	run: async (args, { context, stdout, stderr, signal }) => {
		const [first] = args;
		if (first === "--help" || first === "-h") {
			stdout(`Usage: cssforge mcp\n\n${mcpCommand.description}`);
			return 0;
		}
		if (first !== undefined) {
			stderr(`Unexpected argument ${first}.`);
			return 3;
		}

		// An interrupt closes the input, which ends the session and the server.
		signal?.addEventListener("abort", () => process.stdin.destroy(), { once: true });
		try {
			// Standard output carries only MCP messages from here on.
			await runMcpStdio(
				cssforge,
				{ name: "cssforge", version, context, toJsonSchema },
				{ input: process.stdin, write: (text) => process.stdout.write(text) },
			);
		} catch (error) {
			// A closed input reads as a premature close.
			if (signal?.aborted !== true) throw error;
		}
		return signal?.aborted === true ? 130 : 0;
	},
};

/** Runs the command line with `args`, and gives the exit code. */
export function main(args: readonly string[], signal?: AbortSignal): Promise<number> {
	return runCli(
		cssforge,
		{
			name: "cssforge",
			version,
			context: { cwd: process.cwd() },
			toJsonSchema,
			// The version is in the help so that a published build shows which one it is.
			description: `cssforge ${version}\n\n${description}`,
			commands: [mcpCommand],
		},
		// `pnpm run cssforge -- <args>` passes the separator on to the program.
		args[0] === "--" ? args.slice(1) : args,
		{
			stdout: (text) => process.stdout.write(`${text}\n`),
			stderr: (text) => process.stderr.write(`${text}\n`),
			signal,
		},
	);
}

/** Whether this module is the program that Node started, and not an import. */
const isDirectRun = (): boolean => {
	// Node 24.2 and newer answer directly.
	const isMain = (import.meta as ImportMeta & { main?: boolean }).main;
	if (typeof isMain === "boolean") return isMain;

	// Package managers expose binaries as symlinks in `node_modules/.bin`, so
	// both sides are resolved before they are compared.
	const entryFile = process.argv[1];
	if (!entryFile) return false;
	try {
		return (
			realpathSync(fileURLToPath(import.meta.url)) === realpathSync(resolve(entryFile))
		);
	} catch {
		return false;
	}
};

if (isDirectRun()) {
	const interrupt = new AbortController();
	process.once("SIGINT", () => {
		// The watch and the MCP server stop on the signal. A command that cannot
		// stop, such as a config load that hangs, ends after a grace period.
		interrupt.abort();
		setTimeout(() => process.exit(130), 1000).unref();
	});
	main(process.argv.slice(2), interrupt.signal).then(
		(code) => {
			process.exitCode = code;
		},
		(error: unknown) => {
			console.error(error);
			process.exitCode = 1;
		},
	);
}
