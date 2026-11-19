/**
 * The operations of the CSS Forge tools: load a configuration, generate its
 * outputs, write them, and rebuild when the configuration changes.
 *
 * These functions write nothing to the console. They return reports and throw
 * a {@link ForgeError}, so each surface (the command line, the MCP server, a
 * user interface, the legacy `build()` and `watch()` functions) presents the
 * same results in its own way.
 *
 * @module
 */

import fs from "node:fs/promises";
import { dirname, resolve } from "node:path";
import chokidar, { type FSWatcher } from "chokidar";
import {
	generateCSS,
	generateJSON,
	generateStyleDictionaryJSON,
	generateTS,
	getDiagnostics,
	type ListedToken,
	listTokens,
} from "./generator.ts";
import type { ColorFormat, Diagnostic, GenerateOptions } from "./lib.ts";
import { type LoadedConfig, loadConfig } from "./loader.ts";

/** The files CSS Forge can generate. */
export const outputFormats = ["css", "json", "ts", "style-dictionary"] as const;
/** One file CSS Forge can generate. */
export type OutputFormat = (typeof outputFormats)[number];

/** The output modes: one format, or `all` of them. */
export const outputModes = [...outputFormats, "all"] as const;
/** One format, or `all` of them. */
export type OutputMode = (typeof outputModes)[number];

/** The value representations of the Style Dictionary output. */
export const styleDictionaryValueModes = ["css-reference", "resolved"] as const;
/** How the Style Dictionary output writes token values. */
export type StyleDictionaryValueMode = (typeof styleDictionaryValueModes)[number];

/** The default output path of each format, relative to the working directory. */
export const defaultOutputPaths: Readonly<Record<OutputFormat, string>> = {
	css: "./.cssforge/output.css",
	json: "./.cssforge/output.json",
	ts: "./.cssforge/output.ts",
	"style-dictionary": "./.cssforge/tokens.sd.json",
};

/** The default configuration path, relative to the working directory. */
export const defaultConfigPath = "./cssforge.config.ts";

/** Why an operation failed. Each tag is a failure of the CSS Forge capabilities. */
export type ForgeFailureTag = "ConfigLoadFailed" | "InvalidConfig" | "WriteFailed";

/** A failure an operation reports, with a message for people and agents. */
export class ForgeError extends Error {
	/** The kind of failure. */
	readonly tag: ForgeFailureTag;
	/** The file the failure concerns, when there is one. */
	readonly path: string | undefined;
	/**
	 * The configuration and the local modules it loaded, when it loaded before
	 * the failure. A watch keeps watching them, so a fix to any of them rebuilds.
	 */
	readonly dependencies: string[] | undefined;

	constructor(
		tag: ForgeFailureTag,
		message: string,
		options: { path?: string; cause?: unknown; dependencies?: string[] } = {},
	) {
		super(message, { cause: options.cause });
		this.name = "ForgeError";
		this.tag = tag;
		this.path = options.path;
		this.dependencies = options.dependencies;
	}
}

const messageOf = (error: unknown) =>
	error instanceof Error ? error.message : String(error);

/** What generation reads besides the configuration. */
export interface GenerationSettings {
	/** Extra color formats generated alongside `oklch()`, added to the configuration's. */
	colorFormats?: readonly ColorFormat[];
	/** How the Style Dictionary output writes token values. The default is `resolved`. */
	styleDictionaryValueMode?: StyleDictionaryValueMode;
}

/** Loads the configuration at `configPath`, as a {@link ForgeError} on failure. */
export async function loadForgeConfig(configPath: string): Promise<LoadedConfig> {
	try {
		return await loadConfig(configPath);
	} catch (error) {
		throw new ForgeError("ConfigLoadFailed", messageOf(error), {
			path: resolve(configPath),
			cause: error,
		});
	}
}

/** Runs `generate`, and reports a configuration it rejects as `InvalidConfig`. */
function generating<T>(configPath: string, dependencies: string[], generate: () => T): T {
	try {
		return generate();
	} catch (error) {
		throw new ForgeError("InvalidConfig", messageOf(error), {
			path: resolve(configPath),
			cause: error,
			dependencies,
		});
	}
}

/** Generates one output of a loaded configuration. */
function render(
	config: LoadedConfig["config"],
	format: OutputFormat,
	settings: GenerationSettings,
): string {
	const options: GenerateOptions = { colorFormats: settings.colorFormats ?? [] };
	switch (format) {
		case "css":
			return generateCSS(config, options);
		case "json":
			return generateJSON(config, options);
		case "ts":
			return generateTS(config, options);
		case "style-dictionary":
			return generateStyleDictionaryJSON(config, {
				...options,
				valueMode: settings.styleDictionaryValueMode ?? "resolved",
			});
	}
}

/** The result of a configuration check. */
export interface CheckReport {
	/** Warnings about values that generate, but likely not as intended. */
	diagnostics: Diagnostic[];
	/** Absolute paths of the configuration and the local modules it loaded. */
	dependencies: string[];
}

/**
 * Loads a configuration, renders every output to validate it, and reports its
 * diagnostics. Writes nothing. Some rules, such as a Style Dictionary path
 * collision, are only checked while an output renders.
 */
export async function checkConfig(
	configPath: string,
	settings: GenerationSettings = {},
): Promise<CheckReport> {
	const { config, dependencies } = await loadForgeConfig(configPath);
	const diagnostics = generating(configPath, dependencies, () => {
		for (const format of outputFormats) render(config, format, settings);
		return getDiagnostics(config, { colorFormats: settings.colorFormats ?? [] });
	});
	return { diagnostics, dependencies };
}

/** One generated output, as text. */
export interface GenerateReport extends CheckReport {
	format: OutputFormat;
	/** The generated file content. */
	content: string;
}

/** Generates one output of the configuration at `configPath`. Writes nothing. */
export async function generateOutput(
	configPath: string,
	format: OutputFormat,
	settings: GenerationSettings = {},
): Promise<GenerateReport> {
	const { config, dependencies } = await loadForgeConfig(configPath);
	return generating(configPath, dependencies, () => ({
		format,
		content: render(config, format, settings),
		diagnostics: getDiagnostics(config, { colorFormats: settings.colorFormats ?? [] }),
		dependencies,
	}));
}

/** Lists the tokens of the configuration at `configPath`, for token sync. Writes nothing. */
export async function listConfigTokens(configPath: string): Promise<ListedToken[]> {
	const { config, dependencies } = await loadForgeConfig(configPath);
	return generating(configPath, dependencies, () => listTokens(config));
}

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

/** What {@link buildOutputs} reads. Relative paths resolve against the working directory. */
export interface BuildSettings extends GenerationSettings {
	/** The configuration file. */
	config: string;
	/** The formats to write. */
	mode: OutputMode;
	/** The output path of each format. A missing format uses {@link defaultOutputPaths}. */
	outputs?: Partial<Record<OutputFormat, string>>;
}

/** One file a build wrote. */
export interface WrittenFile {
	format: OutputFormat;
	/** The absolute path of the file. */
	path: string;
}

/** The result of a build. */
export interface BuildReport extends CheckReport {
	/** The files the build wrote, in the order it wrote them. */
	files: WrittenFile[];
}

/** The formats a mode writes, in the order a build writes them. */
export const formatsOf = (mode: OutputMode): readonly OutputFormat[] =>
	mode === "all" ? ["css", "json", "style-dictionary", "ts"] : [mode];

/**
 * Generates the outputs of `mode` and writes them. Every output is generated
 * before the first file is written, so an invalid configuration leaves the
 * previous files in place.
 */
export async function buildOutputs(settings: BuildSettings): Promise<BuildReport> {
	const { config, dependencies } = await loadForgeConfig(settings.config);
	const generated = generating(settings.config, dependencies, () => ({
		diagnostics: getDiagnostics(config, { colorFormats: settings.colorFormats ?? [] }),
		outputs: formatsOf(settings.mode).map((format) => ({
			format,
			path: resolve(settings.outputs?.[format] ?? defaultOutputPaths[format]),
			content: render(config, format, settings),
		})),
	}));

	const files: WrittenFile[] = [];
	for (const { format, path, content } of generated.outputs) {
		try {
			await writeFileRecursive(path, content);
		} catch (error) {
			throw new ForgeError("WriteFailed", messageOf(error), {
				path,
				cause: error,
				dependencies,
			});
		}
		files.push({ format, path });
	}

	return { files, diagnostics: generated.diagnostics, dependencies };
}

/** One build of a watch: its report, or the failure that stopped it. */
export type WatchedBuild =
	| { ok: true; report: BuildReport }
	| { ok: false; error: ForgeError };

/** Runs a build, and gives a failure as a value instead of throwing it. */
async function tryBuild(settings: BuildSettings): Promise<WatchedBuild> {
	try {
		return { ok: true, report: await buildOutputs(settings) };
	} catch (error) {
		if (error instanceof ForgeError) return { ok: false, error };
		throw error;
	}
}

/** Hooks for a caller of {@link watchOutputs}. */
export interface WatchHooks {
	/**
	 * Called once, after the caller has taken the first build. Every file of
	 * that build is watched by then: a change made from then on gives a build.
	 */
	onReady?: () => void;
}

/**
 * Watches `paths` and calls `onChange` for each change, add or unlink. The
 * promise resolves once the first scan is done and changes are seen.
 */
async function watchFiles(paths: string[], onChange: () => void): Promise<FSWatcher> {
	// A tool that rewrites a file in place truncates it first, so a build that
	// starts on the first event would read an empty module; wait for the write
	// to settle instead.
	const watcher = chokidar.watch(paths, {
		persistent: true,
		ignoreInitial: true,
		awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 25 },
	});
	// A module the configuration newly imports arrives as an add, and a deleted
	// one as an unlink; both change what the next build generates.
	watcher.on("change", onChange);
	watcher.on("add", onChange);
	watcher.on("unlink", onChange);
	await new Promise<void>((ready) => watcher.once("ready", () => ready()));
	return watcher;
}

/** The files a build loaded, or `fallback` when its configuration did not load. */
const loadedBy = (build: WatchedBuild, fallback: Iterable<string>): string[] => [
	...((build.ok ? build.report.dependencies : build.error.dependencies) ?? fallback),
];

/**
 * Builds now, then again each time the configuration or a local module it
 * imports changes, until `signal` aborts. Each build is one item.
 *
 * The configuration is watched from before the first build reads it, and the
 * first build is given only once every file it loaded is watched, so no change
 * is lost. The watched set follows the configuration's dependency graph, so a
 * token module the configuration starts or stops importing is picked up on the
 * next build. One build runs at a time; changes during a build give exactly
 * one more, so the last output always reflects the last change.
 */
export async function* watchOutputs(
	settings: BuildSettings,
	signal: AbortSignal,
	hooks: WatchHooks = {},
): AsyncGenerator<WatchedBuild> {
	if (signal.aborted) return;

	const configPath = resolve(settings.config);
	let changed = false;
	let wake: () => void = () => {};
	const notify = () => {
		changed = true;
		wake();
	};
	const stop = () => wake();
	signal.addEventListener("abort", stop, { once: true });

	// Watches the configuration while the first build runs. The watcher of the
	// whole graph can only start once that build has named the graph.
	let watcher = await watchFiles([configPath], notify);

	try {
		const first = await tryBuild(settings);
		// A configuration that did not load reports no dependencies, and
		// unwatching then would stop watching the file that has to be repaired.
		const watched = new Set([configPath, ...loadedBy(first, [])]);
		const graphWatcher = await watchFiles([...watched], notify);
		await watcher.close();
		watcher = graphWatcher;

		if (signal.aborted) return;
		yield first;
		hooks.onReady?.();

		while (!signal.aborted) {
			if (!changed) {
				await new Promise<void>((resume) => {
					wake = resume;
				});
				continue;
			}

			changed = false;
			const build = await tryBuild(settings);

			const next = new Set([configPath, ...loadedBy(build, watched)]);
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

			if (signal.aborted) return;
			yield build;
		}
	} finally {
		signal.removeEventListener("abort", stop);
		await watcher.close();
	}
}
