/**
 * Loads a CSS Forge configuration file from disk.
 *
 * The loader is the one seam the CLI and the bundler plugin share: it resolves
 * the config module, evaluates it, and reports which local files took part in
 * the evaluation so callers can watch them.
 *
 * @module
 */

import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { CSSForgeConfig } from "./config.ts";

/**
 * A configuration loaded from disk, with the local files that produced it.
 */
export interface LoadedConfig {
	/** The config object the module's default export provides. */
	config: Partial<CSSForgeConfig>;
	/**
	 * Absolute paths of the config file and every local module it loaded, in
	 * sorted order. Files resolved inside `node_modules` are excluded, because
	 * watching installed dependencies is not a project concern.
	 */
	dependencies: string[];
}

/** Distinguishes two loads that start in the same millisecond. */
let loadSequence = 0;

/**
 * Serializes loads. `registerHooks` installs process-wide hooks, so two loads
 * running at once would observe each other's resolutions.
 */
let loadQueue: Promise<unknown> = Promise.resolve();

/** Whether a resolved URL is a project file rather than an installed dependency. */
const isLocalFileUrl = (url: URL) =>
	url.protocol === "file:" && !url.pathname.includes("/node_modules/");

/** Whether a URL is a TypeScript module in the project, config or token file. */
const isProjectTypeScriptUrl = (url: URL) =>
	isLocalFileUrl(url) && url.pathname.endsWith(".ts");

/** Describes a rejected default export for the error message. */
const describeValue = (value: unknown): string => {
	if (value === null) return "null";
	if (Array.isArray(value)) return "an array";
	return typeof value;
};

/** Appends `key` to a URL's query string, keeping an existing query intact. */
const withCacheKey = (url: string, key: string) =>
	`${url}${url.includes("?") ? "&" : "?"}${key}`;

/**
 * Imports `absolutePath` and returns its default export.
 *
 * Node's module cache is keyed by URL, so every local file resolved during this
 * import gets a fresh query string. Importing only the config with a cache key
 * would leave the token modules it imports cached, and a changed token value
 * would keep returning the value from the first load.
 */
const loadConfigFile = async (absolutePath: string): Promise<LoadedConfig> => {
	const dependencies = new Set<string>([absolutePath]);
	loadSequence += 1;
	const cacheKey = `cssforge=${Date.now()}-${loadSequence}`;

	const hooks = registerHooks({
		resolve(specifier, context, nextResolve) {
			const resolved = nextResolve(specifier, context);
			const url = new URL(resolved.url);

			if (!isLocalFileUrl(url)) {
				return resolved;
			}

			dependencies.add(fileURLToPath(url));
			// The entry is imported with the key already applied.
			if (resolved.url.includes(cacheKey)) {
				return resolved;
			}

			return { ...resolved, url: withCacheKey(resolved.url, cacheKey) };
		},
		load(url, context, nextLoad) {
			const parsed = new URL(url);

			if (!isProjectTypeScriptUrl(parsed)) {
				return nextLoad(url, context);
			}

			const loaded = nextLoad(url, context);

			// Node answers the module-format question itself, so the loader does not
			// repeat its package.json lookup. A package that declares CommonJS makes
			// Node read the config as CommonJS, which rejects the documented
			// `export default` shape; everything else already loads as ESM.
			if (loaded.format !== "commonjs-typescript") {
				return loaded;
			}

			return {
				format: "module-typescript",
				source: loaded.source ?? readFileSync(fileURLToPath(parsed), "utf8"),
				shortCircuit: true,
			};
		},
	});

	try {
		let imported: { default?: unknown };

		try {
			imported = (await import(
				withCacheKey(pathToFileURL(absolutePath).href, cacheKey)
			)) as {
				default?: unknown;
			};
		} catch (error) {
			// Bundlers show only this message, so the failure behind it has to be
			// readable without expanding `cause`.
			const detail = error instanceof Error ? ` ${error.message}` : "";
			throw new Error(
				`Could not load the CSS Forge config at ${absolutePath}.${detail}`,
				{ cause: error },
			);
		}

		const config = imported.default;

		if (config === null || typeof config !== "object" || Array.isArray(config)) {
			throw new Error(
				`The CSS Forge config at ${absolutePath} must have a default export object. Received ${describeValue(config)}.`,
			);
		}

		return {
			config: config as Partial<CSSForgeConfig>,
			dependencies: Array.from(dependencies).sort(),
		};
	} finally {
		hooks.deregister();
	}
};

/**
 * Loads the CSS Forge configuration at `configPath`, resolved against the
 * current working directory.
 *
 * @example
 * ```ts
 * const { config, dependencies } = await loadConfig("./cssforge.config.ts");
 * const css = generateCSS(config);
 * // `dependencies` holds the config and the token modules it imported.
 * ```
 */
export const loadConfig = (configPath: string): Promise<LoadedConfig> => {
	const absolutePath = resolve(configPath);
	// Chain on the settled queue, so one failed load cannot block the next.
	const load = loadQueue.then(
		() => loadConfigFile(absolutePath),
		() => loadConfigFile(absolutePath),
	);
	loadQueue = load.then(
		() => undefined,
		() => undefined,
	);
	return load;
};
