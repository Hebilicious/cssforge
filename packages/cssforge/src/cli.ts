#!/usr/bin/env node
/**
 * The `cssforge` command line, and the MCP server it starts.
 *
 * The commands come from the CSS Forge application in `app.ts` through the
 * AcidCat CLI binding:
 *
 * - `cssforge tokens build [flags]` writes the outputs of a configuration.
 * - `cssforge tokens generate [flags]` prints one output as JSON.
 * - `cssforge config check [flags]` validates a configuration.
 * - `cssforge watch tokens.built [flags]` builds after each change.
 * - `cssforge mcp` serves the same capabilities to an agent over MCP (stdio).
 * - `cssforge list` describes every command.
 *
 * `cssforge [flags]`, with no command, is `cssforge tokens build [flags]`, and
 * `-w` / `--watch` turns it into the watch. This keeps the command line of the
 * earlier versions working.
 *
 * The module also exports `build()` and `watch()`, the programmatic API of the
 * earlier versions. They run the same operations and log to the console.
 *
 * @module
 */

import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import type { CliCommand } from "@acid-cat/core-ts";
import { runCli, runMcpStdio } from "@acid-cat/core-ts";
import { cssforge, type ForgeContext } from "./app.ts";
import {
	type BuildReport,
	type BuildSettings,
	buildOutputs,
	defaultOutputPaths,
	ForgeError,
	formatsOf,
	type OutputFormat,
	type OutputMode,
	outputModes,
	type StyleDictionaryValueMode,
	styleDictionaryValueModes,
	watchOutputs,
	writeFileRecursive,
} from "./forge.ts";
import type { ColorFormat } from "./lib.ts";
import { isColorFormat, supportedColorFormats } from "./modules/colors.ts";
import { toJsonSchema } from "./schema.ts";
import { version } from "./version.ts";

export { writeFileRecursive };

// --- Command line -----------------------------------------------------------------------------

/** The flags of the version, which the generic command line answers when one is the only argument. */
const versionFlags = new Set(["--version", "-v"]);
/** The flags of the help, which the generic command line answers when one is the first argument. */
const helpFlags = new Set(["--help", "-h"]);

/** The entries of a comma separated value, such as `hex,rgb`: trimmed, without empty entries or duplicates. */
const commaList = (value: string): string[] => [
	...new Set(
		value
			.split(",")
			.map((entry) => entry.trim())
			.filter((entry) => entry !== ""),
	),
];

/**
 * Turns the flags-only command line of the earlier versions into a command of
 * the current one. Arguments that start with a command are returned unchanged.
 *
 * - No arguments, or flags only: `tokens build` with those flags.
 * - `-w` or `--watch`: `watch tokens.built` with the other flags.
 * - `-m <mode>`: `--mode <mode>`.
 * - `--prefix <directory>`: `--root <directory>`. An empty prefix is dropped.
 * - `--color-formats hex,rgb`: the list as a JSON array.
 * - `--version` next to other flags: dropped, as the earlier versions did.
 * - A leading `--`, which `pnpm run` passes on: dropped.
 */
export function translateArguments(args: readonly string[]): string[] {
	// `pnpm run cssforge -- <flags>` passes the separator on to the binary.
	if (args[0] === "--") return translateArguments(args.slice(1));

	const [first] = args;
	const answeredByCli =
		first !== undefined &&
		(!first.startsWith("-") ||
			helpFlags.has(first) ||
			(args.length === 1 && versionFlags.has(first)));
	if (answeredByCli) return [...args];

	let watching = false;
	const flags: string[] = [];
	const remaining = args.values();
	for (const arg of remaining) {
		const [name = arg, inline] = arg.split(/=(.*)/s, 2);
		const value = () => inline ?? remaining.next().value ?? "";

		if (versionFlags.has(name)) {
			// Ignored next to other arguments, as in the earlier versions.
		} else if (name === "-w" || name === "--watch") {
			watching = inline === undefined || inline === "true";
		} else if (name === "-m") {
			flags.push("--mode", value());
		} else if (name === "--prefix") {
			const prefix = value();
			if (prefix !== "") flags.push("--root", prefix);
		} else if (name === "--color-formats") {
			// The schema of the command validates each format.
			flags.push("--color-formats", JSON.stringify(commaList(value())));
		} else {
			flags.push(arg);
		}
	}

	return watching ? ["watch", "tokens.built", ...flags] : ["tokens", "build", ...flags];
}

/** `cssforge mcp`: the MCP server of the CSS Forge tools, through standard input and output. */
const mcpCommand: CliCommand<ForgeContext> = {
	name: "mcp",
	description:
		"Serve the CSS Forge tools to an agent over MCP, through standard input and output.",
	run: async (args, { context, stdout, stderr, signal }) => {
		const [first] = args;
		if (first !== undefined && helpFlags.has(first)) {
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
			description: `cssforge ${version}\n\nGenerate CSS custom properties, JSON, TypeScript and Style Dictionary tokens from a CSS Forge configuration.\n\nWith flags and no command, cssforge runs tokens build; -w runs watch tokens.built.`,
			commands: [mcpCommand],
		},
		translateArguments(args),
		{
			stdout: (text) => process.stdout.write(`${text}\n`),
			stderr: (text) => process.stderr.write(`${text}\n`),
			signal,
		},
	);
}

// --- Programmatic API of the earlier versions -------------------------------------------------

const outputModeList = outputModes.join(", ");
const colorFormatList = supportedColorFormats.join(", ");

const isOutputMode = (value: unknown): value is OutputMode =>
	typeof value === "string" && outputModes.some((mode) => mode === value);

const isStyleDictionaryValueMode = (value: unknown): value is StyleDictionaryValueMode =>
	typeof value === "string" && styleDictionaryValueModes.some((mode) => mode === value);

const invalidOutputModeMessage = (mode: unknown) =>
	`Invalid output mode: ${String(mode)}. Accepted modes: ${outputModeList}.`;

const invalidColorFormatMessage = (format: unknown) =>
	`Invalid color format: ${String(format)}. Accepted formats: ${colorFormatList}.`;

/**
 * Reads the extra color formats from a comma separated value, such as
 * `hex,rgb`. Duplicates are dropped, and an unknown format is rejected with the
 * accepted ones.
 */
export function parseColorFormats(value: unknown): ColorFormat[] | undefined {
	if (value === undefined) return undefined;

	return commaList(String(value)).map((format) => {
		if (!isColorFormat(format)) throw new Error(invalidColorFormatMessage(format));
		return format;
	});
}

/**
 * Defines the options for the build command.
 */
export interface BuildOptions {
	/** Path to the configuration file. */
	config: string;
	/** The output mode. */
	mode: OutputMode;
	/** Path for the CSS output file. */
	cssOutput: string;
	/** Path for the JSON output file. */
	jsonOutput: string;
	/** Path for the Style Dictionary-compatible JSON output file. */
	styleDictionaryOutput?: string;
	/** Value representation used by the Style Dictionary-compatible JSON output. */
	styleDictionaryValueMode?: StyleDictionaryValueMode;
	/** Path for the TypeScript output file. */
	tsOutput: string;
	/** Extra color formats generated alongside `oklch()`, added to the formats the configuration declares. */
	colorFormats?: readonly ColorFormat[];
}

/**
 * The result of a build. `dependencies` is present when the config loaded, and
 * names the config file plus every local module it imported.
 */
export interface BuildResult {
	/** Whether every requested output was written. */
	success: boolean;
	/** The failure the build caught, when it did not succeed. */
	error?: unknown;
	/** Absolute paths of the config and the local modules it loaded. */
	dependencies?: string[];
}

/** Checks the options at run time, for JavaScript callers, and gives the build settings. */
function settingsOf(options: BuildOptions): BuildSettings {
	const { mode, styleDictionaryValueMode = "resolved", colorFormats = [] } = options;
	if (!isOutputMode(mode)) throw new Error(invalidOutputModeMessage(mode));
	if (!isStyleDictionaryValueMode(styleDictionaryValueMode)) {
		throw new Error(`Invalid Style Dictionary value mode: ${styleDictionaryValueMode}`);
	}
	for (const format of colorFormats) {
		if (!isColorFormat(format)) throw new Error(invalidColorFormatMessage(format));
	}
	return {
		config: options.config,
		mode,
		outputs: {
			css: options.cssOutput,
			json: options.jsonOutput,
			ts: options.tsOutput,
			"style-dictionary":
				options.styleDictionaryOutput ?? defaultOutputPaths["style-dictionary"],
		},
		colorFormats,
		styleDictionaryValueMode,
	};
}

const outputLabels: Record<OutputFormat, string> = {
	css: "CSS",
	json: "JSON",
	ts: "TypeScript",
	"style-dictionary": "Style Dictionary JSON",
};

/** Logs a successful build: its warnings, then each file as the caller named it. */
function logReport(report: BuildReport, settings: BuildSettings): void {
	for (const diagnostic of report.diagnostics) {
		console.warn(`cssforge: warning: ${diagnostic.message}`);
	}
	for (const format of formatsOf(settings.mode)) {
		console.log(
			`✔ Generated ${outputLabels[format]} written to ${settings.outputs?.[format]}`,
		);
	}
}

const errorOf = (error: unknown) =>
	error instanceof ForgeError && error.cause instanceof Error ? error.cause : error;

/**
 * Builds the CSS, JSON, and/or TypeScript files based on the configuration.
 * @param options The build options.
 * @returns A promise that resolves to an object indicating success or failure.
 */
export async function build(options: BuildOptions): Promise<BuildResult> {
	try {
		const settings = settingsOf(options);
		const report = await buildOutputs(settings);
		logReport(report, settings);
		return { success: true, dependencies: report.dependencies };
	} catch (error) {
		console.error(`Error during build:`, errorOf(error));
		return { success: false, error: errorOf(error) };
	}
}

/**
 * Defines the options for the watch command.
 */
export interface WatchOptions extends BuildOptions {
	/** A callback function to execute on rebuild. */
	onRebuild?: () => void;
}

/**
 * Watches the configuration file and every local module it loads, and rebuilds
 * on modification.
 * @param options The watch options.
 * @returns A promise that resolves, once changes are seen, to a function to stop watching.
 */
export async function watch({
	onRebuild,
	...options
}: WatchOptions): Promise<() => void> {
	const settings = settingsOf(options);
	console.log(`👀 Watching ${options.config} for changes...`);

	const stop = new AbortController();
	let ready: () => void = () => {};
	const watching = new Promise<void>((resolveReady) => {
		ready = resolveReady;
	});
	const builds = watchOutputs(settings, stop.signal, { onReady: () => ready() });

	const loop = (async () => {
		let first = true;
		for await (const result of builds) {
			if (!first) console.log(`🔄 Config changed, regenerating...`);
			if (result.ok) logReport(result.report, settings);
			else console.error(`Error during build:`, errorOf(result.error));
			if (!first) onRebuild?.();
			first = false;
		}
	})();
	// The loop ends only when the watch stops, or when a build throws a defect.
	loop.catch((error: unknown) => console.error(`Error during watch:`, error));

	await Promise.race([watching, loop]);
	return () => stop.abort();
}

// --- Entry point ------------------------------------------------------------------------------

const isDirectRun = (): boolean => {
	// Node 24.2 and newer report whether this module is the entry point.
	const isMain = (import.meta as ImportMeta & { main?: boolean }).main;
	if (typeof isMain === "boolean") {
		return isMain;
	}

	// Otherwise compare entry points. Package managers expose binaries as
	// symlinks in `node_modules/.bin`, so both sides are resolved first.
	const entryFile = process.argv[1];
	if (!entryFile) {
		return false;
	}

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
