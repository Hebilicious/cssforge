#!/usr/bin/env node
/**
 * The `cssforge` program: run it, do not import it. Its commands are the capabilities of
 * `capabilities.ts`, and `cssforge mcp` serves the same capabilities to an
 * agent as an MCP server through standard input and output.
 *
 * On a terminal, the output is for a person. For a script, in CI or for a
 * coding agent, it is JSON. `--output agent` or `--output human` chooses.
 *
 * @module
 */

import { relative } from "node:path";
import process from "node:process";
import type { CliCommand, CliUi } from "@acid-cat/core-ts";
import { cliFormat, cliMain, runMcpStdio } from "@acid-cat/core-ts";
import {
	type BuiltPayload,
	configCheck,
	cssforge,
	type FailureDetails,
	type ForgeContext,
	tokensBuild,
	tokensBuilt,
	tokensGenerate,
} from "./capabilities.ts";
import type { BuildReport, CheckReport } from "./forge.ts";
import { toJsonSchema } from "./schema.ts";
import { version } from "./version.ts";

const context: ForgeContext = { cwd: process.cwd() };

/** `cssforge mcp`: the MCP server, through standard input and output. */
const mcpCommand: CliCommand<ForgeContext> = {
	name: "mcp",
	description:
		"Serve the cssforge commands to an agent over MCP, through standard input and output.",
	run: async (args, { stdout, stderr, signal }) => {
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

// --- Human output ----------------------------------------------------------------------------

/** A path as a person types it: relative to the working directory. */
const shown = (path: string) => relative(context.cwd, path) || ".";

const warnings = ({ diagnostics }: CheckReport, ui: CliUi): string[] =>
	diagnostics.map(
		(diagnostic) => `${ui.warn("warning")} ${diagnostic.path}: ${diagnostic.message}`,
	);

const filesWritten = (report: BuildReport, ui: CliUi): string[] => [
	ui.table(
		["format", "file"],
		report.files.map((file) => [file.format, shown(file.path)]),
	),
	...warnings(report, ui),
];

const failure =
	(tag: string) =>
	({ message, path }: FailureDetails, ui: CliUi): string =>
		path === undefined || message.includes(path)
			? `${ui.error(tag)} ${message}`
			: `${ui.error(tag)} ${message}\n${ui.dim(shown(path))}`;

const readFailures = {
	ConfigLoadFailed: failure("ConfigLoadFailed"),
	InvalidConfig: failure("InvalidConfig"),
};

const built = (payload: BuiltPayload, ui: CliUi): string => {
	const time = ui.dim(new Date().toLocaleTimeString());
	if (!payload.ok) return `${time} ${failure(payload.failure._tag)(payload.failure, ui)}`;
	return [`${time} ${ui.ok("built")}`, ...filesWritten(payload, ui)].join("\n");
};

const formats = [
	cliFormat(tokensBuild, {
		value: (report, ui) => filesWritten(report, ui).join("\n"),
		failures: { ...readFailures, WriteFailed: failure("WriteFailed") },
	}),
	cliFormat(tokensGenerate, {
		// The content alone goes to standard output, so that it can go to a file.
		value: (report, ui) => {
			for (const line of warnings(report, ui)) process.stderr.write(`${line}\n`);
			return report.content;
		},
		failures: readFailures,
	}),
	cliFormat(configCheck, {
		value: (report, ui) =>
			[
				`${ui.ok("valid")} ${report.dependencies.map(shown).join(", ")}`,
				...warnings(report, ui),
			].join("\n"),
		failures: readFailures,
	}),
	cliFormat(tokensBuilt, built),
];

// --- Program ---------------------------------------------------------------------------------

const args = process.argv.slice(2);

// `cliMain` stops the watch and the MCP server on an interrupt. A command that
// cannot stop, such as a config load that hangs, ends after a grace period.
process.once("SIGINT", () => setTimeout(() => process.exit(130), 1000).unref());

cliMain(
	cssforge,
	{
		name: "cssforge",
		version,
		context,
		toJsonSchema,
		// The version is in the help so that a published build shows which one it is.
		description: `cssforge ${version}\n\n${cssforge.description}`,
		commands: [mcpCommand],
		output: {
			default: "auto",
			flags: [{ names: ["--output", "-o"], values: { human: "human", agent: "json" } }],
			formats,
		},
	},
	// `pnpm run cssforge -- <args>` passes the separator on to the program.
	args[0] === "--" ? args.slice(1) : args,
);
