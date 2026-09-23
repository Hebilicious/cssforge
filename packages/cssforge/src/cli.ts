#!/usr/bin/env node
import { realpathSync } from "node:fs";
import fs from "node:fs/promises";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
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
import {
	generateCSS,
	generateJSON,
	generateStyleDictionaryJSON,
	generateTS,
} from "./generator.ts";
import { loadConfig } from "./loader.ts";
import { version } from "./version.ts";

/**
 * Writes a file, creating its parent directory first. The parent comes from the
 * platform-aware `dirname` of `node:path`, so `C:\project\.cssforge\output.css`
 * creates `C:\project\.cssforge` rather than a directory at the output file path.
 *
 * `parentDirectory` is injectable so the Windows path shape can be exercised on
 * any platform.
 */
export const writeFileRecursive = (
	path: string,
	data: string,
	parentDirectory: (outputPath: string) => string = dirname,
): Promise<void> =>
	fs
		.mkdir(parentDirectory(path), { recursive: true })
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
}: BuildOptions): Promise<BuildResult> {
	try {
		if (!isOutputMode(mode)) {
			// A TypeScript cast does not validate runtime input, so JavaScript
			// callers reach this check.
			throw new Error(invalidOutputModeMessage(mode));
		}
		if (!isStyleDictionaryValueMode(styleDictionaryValueMode)) {
			throw new Error(`Invalid Style Dictionary value mode: ${styleDictionaryValueMode}`);
		}
		const absoluteCssOutput = resolve(process.cwd(), cssOutput);
		const absoluteJsonOutput = resolve(process.cwd(), jsonOutput);
		const absoluteTsOutput = resolve(process.cwd(), tsOutput);

		const { config: userConfig, dependencies } = await loadConfig(config);

		if (mode === "css" || mode === "all") {
			await writeFileRecursive(absoluteCssOutput, generateCSS(userConfig));
			console.log(`✔ Generated CSS written to ${cssOutput}`);
		}

		if (mode === "json" || mode === "all") {
			await writeFileRecursive(absoluteJsonOutput, generateJSON(userConfig));
			console.log(`✔ Generated JSON written to ${jsonOutput}`);
		}

		if (mode === "style-dictionary" || mode === "all") {
			const outputPath = styleDictionaryOutput ?? "./.cssforge/tokens.sd.json";
			const absoluteStyleDictionaryOutput = resolve(process.cwd(), outputPath);
			await writeFileRecursive(
				absoluteStyleDictionaryOutput,
				generateStyleDictionaryJSON(userConfig, {
					valueMode: styleDictionaryValueMode,
				}),
			);
			console.log(`✔ Generated Style Dictionary JSON written to ${outputPath}`);
		}

		if (mode === "ts" || mode === "all") {
			await writeFileRecursive(absoluteTsOutput, generateTS(userConfig));
			console.log(`✔ Generated TypeScript written to ${tsOutput}`);
		}

		return { success: true, dependencies };
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
 * Watches the configuration file and every local module it loads, and rebuilds
 * on modification. The watched set follows the config's dependency graph, so a
 * token module the config starts or stops importing is picked up on the next
 * rebuild.
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
	const initial = await build(buildOptions);
	const watched = new Set(
		initial.dependencies ?? [resolve(process.cwd(), buildOptions.config)],
	);

	// Watch the config and the local modules it loaded. A tool that rewrites a
	// file in place truncates it first, so a rebuild that starts on the first
	// event would read an empty module; wait for the write to settle instead.
	const watcher = chokidar.watch(Array.from(watched), {
		persistent: true,
		ignoreInitial: true,
		awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 25 },
	});

	// Resolve only once the watcher finished its first scan. A caller that edits
	// a token module as soon as `watch()` resolves would otherwise race the scan
	// and lose the change event.
	await new Promise<void>((ready) => watcher.once("ready", () => ready()));

	let rebuilding = false;
	let rebuildQueued = false;

	const runBuild = async () => {
		console.log(`🔄 Config changed, regenerating...`);
		const result = await build(buildOptions);
		// A failed build reports no dependencies, and unwatching on failure would
		// stop watching the config that has to be repaired.
		const next = new Set(result.dependencies ?? watched);

		for (const path of next) {
			if (watched.has(path)) continue;
			watched.add(path);
			watcher.add(path);
		}

		for (const path of watched) {
			if (next.has(path)) continue;
			watched.delete(path);
			watcher.unwatch(path);
		}

		onRebuild?.();
	};

	/**
	 * Rebuilds one build at a time. Two editors writing in quick succession would
	 * otherwise run two builds at once, and the older one could finish last and
	 * write stale output. A change that lands during a build queues exactly one
	 * more build, so the last output always reflects the last change.
	 */
	const rebuild = async () => {
		if (rebuilding) {
			rebuildQueued = true;
			return;
		}

		rebuilding = true;

		try {
			do {
				rebuildQueued = false;
				await runBuild();
			} while (rebuildQueued);
		} finally {
			rebuilding = false;
		}
	};

	watcher.on("change", rebuild);
	// A module the config newly imports arrives as an add, and a deleted one as
	// an unlink; both change what the next build generates.
	watcher.on("add", rebuild);
	watcher.on("unlink", rebuild);

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
