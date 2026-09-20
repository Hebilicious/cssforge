#!/usr/bin/env node
import { realpathSync } from "node:fs";
import fs from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import chokidar from "chokidar";
import type { CommandDef } from "citty";
/**
 * This module provides the command-line interface (CLI) for CSSForge.
 * It allows generating CSS variables from a configuration file, with options
 * to watch for changes and specify output formats.
 *
 * @module
 */
import { defineCommand, runMain } from "citty";
import type { CSSForgeConfig } from "./config.ts";
import {
	generateCSS,
	generateJSON,
	generateStyleDictionaryJSON,
	generateTS,
} from "./generator.ts";
import { version } from "./version.ts";

const writeFileRecursive = (path: string, data: string) =>
	fs
		.mkdir(path.replace(/\/[^/]*$/, ""), { recursive: true })
		.then(() => fs.writeFile(path, data));

const outputModes = ["css", "json", "ts", "style-dictionary", "all"] as const;
type OutputMode = (typeof outputModes)[number];
const outputModeList = outputModes.join(", ");

/** The version flag form the CLI answers directly, without citty's consola. */
const versionFlag = "--version";
const styleDictionaryValueModes = ["css-reference", "resolved"] as const;
type StyleDictionaryValueMode = (typeof styleDictionaryValueModes)[number];

const isOutputMode = (value: unknown): value is OutputMode =>
	typeof value === "string" && outputModes.some((mode) => mode === value);

const invalidOutputModeMessage = (mode: unknown) =>
	`Invalid output mode: ${String(mode)}. Accepted modes: ${outputModeList}.`;

const isStyleDictionaryValueMode = (value: unknown): value is StyleDictionaryValueMode =>
	typeof value === "string" && styleDictionaryValueModes.some((mode) => mode === value);

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
}

/**
 * Builds the CSS, JSON, and/or TypeScript files based on the configuration.
 * @param options The build options.
 * @returns A promise that resolves to an object indicating success or failure.
 */
export async function build({
	config,
	tsOutput,
	cssOutput,
	jsonOutput,
	styleDictionaryOutput,
	styleDictionaryValueMode = "resolved",
	mode,
}: BuildOptions): Promise<{ success: boolean; error?: unknown }> {
	try {
		if (!isOutputMode(mode)) {
			// A TypeScript cast does not validate runtime input, so JavaScript
			// callers reach this check.
			throw new Error(invalidOutputModeMessage(mode));
		}
		if (!isStyleDictionaryValueMode(styleDictionaryValueMode)) {
			throw new Error(`Invalid Style Dictionary value mode: ${styleDictionaryValueMode}`);
		}
		const absoluteconfig = resolve(process.cwd(), config);
		const absoluteCssOutput = resolve(process.cwd(), cssOutput);
		const absoluteJsonOutput = resolve(process.cwd(), jsonOutput);
		const absoluteTsOutput = resolve(process.cwd(), tsOutput);

		// Import config with cache busting
		const configUrl = pathToFileURL(absoluteconfig).href;
		const userConfig = await import(`${configUrl}?t=${Date.now()}`);

		if (mode === "css" || mode === "all") {
			await writeFileRecursive(
				absoluteCssOutput,
				generateCSS(userConfig.default as CSSForgeConfig),
			);
			console.log(`✔ Generated CSS written to ${cssOutput}`);
		}

		if (mode === "json" || mode === "all") {
			await writeFileRecursive(
				absoluteJsonOutput,
				generateJSON(userConfig.default as CSSForgeConfig),
			);
			console.log(`✔ Generated JSON written to ${jsonOutput}`);
		}

		if (mode === "style-dictionary" || mode === "all") {
			const outputPath = styleDictionaryOutput ?? "./.cssforge/tokens.sd.json";
			const absoluteStyleDictionaryOutput = resolve(process.cwd(), outputPath);
			await writeFileRecursive(
				absoluteStyleDictionaryOutput,
				generateStyleDictionaryJSON(userConfig.default as CSSForgeConfig, {
					valueMode: styleDictionaryValueMode,
				}),
			);
			console.log(`✔ Generated Style Dictionary JSON written to ${outputPath}`);
		}

		if (mode === "ts" || mode === "all") {
			await writeFileRecursive(
				absoluteTsOutput,
				generateTS(userConfig.default as CSSForgeConfig),
			);
			console.log(`✔ Generated TypeScript written to ${tsOutput}`);
		}

		return { success: true };
	} catch (error) {
		console.error(`Error during build:`, error);
		return { success: false, error };
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
 * Watches the configuration file for changes and rebuilds on modification.
 * @param options The watch options.
 * @returns A promise that resolves to a function to stop watching.
 */
export async function watch({
	onRebuild,
	...buildOptions
}: WatchOptions): Promise<() => void> {
	if (!isOutputMode(buildOptions.mode)) {
		throw new Error(invalidOutputModeMessage(buildOptions.mode));
	}

	console.log(`👀 Watching ${buildOptions.config} for changes...`);

	// Initial build
	await build(buildOptions);

	// Watch for changes
	const watcher = chokidar.watch(buildOptions.config, {
		persistent: true,
		ignoreInitial: true,
	});

	watcher.on("change", async () => {
		console.log(`🔄 Config changed, regenerating...`);
		await build(buildOptions);
		onRebuild?.();
	});

	// Return cleanup function
	return () => watcher.close();
}

const mainCommand = defineCommand({
	meta: {
		name: "cssforge",
		version,
		description: "Generate CSS variables from a configuration file",
	},
	args: {
		watch: {
			type: "boolean",
			description: "Watch for changes in the config file",
			alias: "w",
		},
		config: {
			type: "string",
			description: "Path to the config file",
			default: "./cssforge.config.ts",
		},
		mode: {
			type: "string",
			description: `Output mode (${outputModeList})`,
			alias: "m",
			default: "all",
		},
		prefix: {
			type: "string",
			description: "A prefix applied before all path",
			default: "",
		},
		json: {
			type: "string",
			description: "Optional path for an output JSON file",
			default: "./.cssforge/output.json",
		},
		"style-dictionary": {
			type: "string",
			description: "Path for the Style Dictionary token JSON file",
			default: "./.cssforge/tokens.sd.json",
		},
		"style-dictionary-value-mode": {
			type: "string",
			description:
				"Token value mode: css-reference for usage matching, or resolved for previews and builds",
			default: "resolved",
		},
		css: {
			type: "string",
			description: "Path for the output CSS file",
			default: "./.cssforge/output.css",
		},
		ts: {
			type: "string",
			description: "Path for the output TypeScript file",
			default: "./.cssforge/output.ts",
		},
	},
	async run({ args }) {
		const { watch: shouldWatch, config, css, json, ts, mode, prefix } = args;
		const styleDictionary = args["style-dictionary"];
		const styleDictionaryValueMode = args["style-dictionary-value-mode"];
		if (!isOutputMode(mode)) {
			console.error(`Error during build: Error: ${invalidOutputModeMessage(mode)}`);
			process.exit(1);
			return;
		}
		if (!isStyleDictionaryValueMode(styleDictionaryValueMode)) {
			console.error(
				`Error during build: Error: Invalid Style Dictionary value mode: ${styleDictionaryValueMode}`,
			);
			process.exit(1);
			return;
		}
		const realPath = (p: string) => resolve(prefix, p);
		const settings: BuildOptions = {
			mode,
			config: realPath(config),
			cssOutput: realPath(css),
			tsOutput: realPath(ts),
			jsonOutput: realPath(json),
			styleDictionaryOutput: realPath(styleDictionary),
			styleDictionaryValueMode,
		};
		if (shouldWatch) {
			const cleanup = await watch(settings);

			// Handle process termination
			process.on("SIGINT", () => {
				cleanup();
				console.log("\n🛑 Stopped watching");
				process.exit(0);
			});
		} else {
			const { success } = await build(settings);
			process.exit(success ? 0 : 1);
		}
	},
});

const isDirectRun = (): boolean => {
	// Deno and recent Node versions report whether this module is the entry
	// point. This also covers the JSR channel, where the module URL is remote
	// and cannot be mapped to a file path.
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
		return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(entryFile);
	} catch {
		return false;
	}
};

// Run if called directly
if (isDirectRun()) {
	// citty prints the version through consola, whose reporter decorates log
	// output in a CI environment. Scripts parse this output, so it has to be
	// bare. Answer the single flag the CLI supports, under citty's own
	// condition: only when it is the sole argument.
	const rawArgs = process.argv.slice(2);
	if (rawArgs.length === 1 && rawArgs[0] === versionFlag) {
		console.log(version);
	} else {
		runMain(mainCommand);
	}
}

/**
 * The main command definition for the CSSForge CLI.
 */
export default mainCommand as CommandDef;
