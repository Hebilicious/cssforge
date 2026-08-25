#!/usr/bin/env node
import fs from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
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

const writeFileRecursive = (path: string, data: string) =>
	fs
		.mkdir(path.replace(/\/[^/]*$/, ""), { recursive: true })
		.then(() => fs.writeFile(path, data));

const outputModes = ["css", "json", "ts", "style-dictionary", "all"] as const;
type OutputMode = (typeof outputModes)[number];
const styleDictionaryValueModes = ["css-reference", "resolved"] as const;
type StyleDictionaryValueMode = (typeof styleDictionaryValueModes)[number];

const isOutputMode = (value: unknown): value is OutputMode =>
	typeof value === "string" && outputModes.some((mode) => mode === value);

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
	styleDictionaryValueMode = "css-reference",
	mode,
}: BuildOptions): Promise<{ success: boolean; error?: unknown }> {
	try {
		if (!isOutputMode(mode)) {
			throw new Error(`Invalid output mode: ${mode}`);
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
			if (!isStyleDictionaryValueMode(styleDictionaryValueMode)) {
				throw new Error(
					`Invalid Style Dictionary value mode: ${styleDictionaryValueMode}`,
				);
			}
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
		version: "0.1.0",
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
			description: "Output mode (css, json, ts, style-dictionary, all)",
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
			description: "Path for token JSON used by Musea or Style Dictionary",
			default: "./.cssforge/tokens.sd.json",
		},
		"style-dictionary-value-mode": {
			type: "string",
			description:
				"Token value mode: css-reference for usage matching, or resolved for previews and builds",
			default: "css-reference",
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
			console.error(`Error during build: Error: Invalid output mode: ${mode}`);
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
	const entryFile = process.argv[1];
	if (!entryFile) {
		return false;
	}

	return import.meta.url === pathToFileURL(entryFile).href;
};

// Run if called directly
if (isDirectRun()) {
	runMain(mainCommand);
}

/**
 * The main command definition for the CSSForge CLI.
 */
export default mainCommand as CommandDef;
