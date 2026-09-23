/**
 * A `unplugin` plugin that generates CSS Forge design-token output inside the
 * build.
 *
 * A project imports `virtual:cssforge.css`; the plugin loads the CSS Forge
 * config, serves `generateCSS` output for that module, and watches the config
 * graph so a token edit regenerates the stylesheet.
 *
 * @module
 */

import fs from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { generateCSS, loadConfig } from "@hebilicious/cssforge";
import type { UnpluginFactory } from "unplugin";
import { createUnplugin } from "unplugin";

/** The specifier a project imports to get the generated stylesheet. */
export const virtualCssModuleId = "virtual:cssforge.css";

/**
 * The id the stylesheet resolves to. The leading null byte marks the module as
 * virtual, so bundler core plugins leave it to this plugin.
 */
export const resolvedVirtualCssModuleId = `\0${virtualCssModuleId}`;

/** The config path the plugin uses when the `config` option is omitted. */
export const defaultConfigPath = "./cssforge.config.ts";

/** The stylesheet path `write: true` uses, matching the CLI's `--css` default. */
export const defaultCssOutputPath = "./.cssforge/output.css";

/** Where `write` puts the generated stylesheet. */
export interface CssForgeWriteOptions {
	/** Path of the stylesheet, resolved against the build's working directory. */
	css?: string;
}

/** The plugin options. */
export interface CssForgeOptions {
	/**
	 * Path of the CSS Forge config, resolved against the build's working
	 * directory. Defaults to `./cssforge.config.ts`.
	 */
	config?: string;
	/**
	 * Write the generated stylesheet to disk as well as serving it from
	 * `virtual:cssforge.css`. `true` writes the CLI's default path, for
	 * bundlers or tools that need a real file.
	 */
	write?: boolean | CssForgeWriteOptions;
}

interface GeneratedOutput {
	/** The stylesheet `generateCSS` produced for the config. */
	css: string;
	/** Absolute paths of the config and the local modules it loaded. */
	dependencies: string[];
}

/**
 * Normalizes a path for comparison, because a Windows watcher event and a
 * resolved config path differ in separators.
 */
const toComparablePath = (path: string) => resolve(path).replaceAll("\\", "/");

const writeFileRecursive = async (path: string, data: string) => {
	await fs.mkdir(dirname(path), { recursive: true });
	await fs.writeFile(path, data);
};

/** The file `write` targets, or undefined when writing is off. */
const resolveWriteTarget = (write: CssForgeOptions["write"]): string | undefined => {
	if (!write) return undefined;
	const path =
		write === true ? defaultCssOutputPath : (write.css ?? defaultCssOutputPath);
	return resolve(process.cwd(), path);
};

/**
 * Creates the plugin.
 *
 * Generation is lazy: the stylesheet is produced the first time the virtual
 * module is loaded, unless `write` is set, which generates during `buildStart`
 * so the file exists even when nothing imports the module.
 */
export const unpluginFactory: UnpluginFactory<CssForgeOptions | undefined> = (
	options = {},
	meta,
) => {
	const configPath = resolve(process.cwd(), options.config ?? defaultConfigPath);
	const writeTarget = resolveWriteTarget(options.write);
	let generated: GeneratedOutput | undefined;

	/**
	 * Whether `buildStart` may register watch files. unplugin's esbuild adapter
	 * throws from `addWatchFile` outside `resolveId`, `load`, and `transform`,
	 * so the config graph is registered from `load` there instead.
	 */
	const canWatchFromBuildStart = meta.framework !== "esbuild";

	const generate = async (): Promise<GeneratedOutput> => {
		const { config, dependencies } = await loadConfig(configPath);
		const css = generateCSS(config);

		if (writeTarget) {
			await writeFileRecursive(writeTarget, css);
		}

		return { css, dependencies };
	};

	/**
	 * Generates once per build and registers the config graph with the bundler,
	 * so watch mode rebuilds when any file in it changes.
	 */
	const ensureGenerated = async (
		watch?: (path: string) => void,
	): Promise<GeneratedOutput> => {
		generated ??= await generate();

		for (const dependency of generated.dependencies) {
			watch?.(dependency);
		}

		return generated;
	};

	/** Whether a watcher event belongs to the config graph. */
	const isDependency = (path: string): boolean => {
		const changed = toComparablePath(path);
		return (
			generated?.dependencies.some(
				(dependency) => toComparablePath(dependency) === changed,
			) ?? false
		);
	};

	return {
		name: "cssforge",
		// The virtual module has to resolve before bundler core plugins look for
		// it on disk.
		enforce: "pre",
		async buildStart() {
			if (!writeTarget) return;
			await ensureGenerated(
				canWatchFromBuildStart ? (path) => this.addWatchFile(path) : undefined,
			);
		},
		resolveId: {
			filter: { id: /^virtual:cssforge\.css$/ },
			handler(id) {
				return id === virtualCssModuleId ? resolvedVirtualCssModuleId : undefined;
			},
		},
		load: {
			filter: { id: /\0virtual:cssforge\.css$/ },
			async handler(id) {
				if (id !== resolvedVirtualCssModuleId) return undefined;
				const { css } = await ensureGenerated((path) => this.addWatchFile(path));
				return css;
			},
		},
		watchChange(id) {
			if (isDependency(id)) {
				generated = undefined;
			}
		},
	};
};

export const unplugin = /* @__PURE__ */ createUnplugin(unpluginFactory);

export default unplugin;

/** The Vite plugin, for `vite.config.ts`. */
export const vitePlugin = unplugin.vite;

/** The Rollup plugin, for `rollup.config.js`. */
export const rollupPlugin = unplugin.rollup;

/** The Rolldown plugin, for `rolldown.config.js`. */
export const rolldownPlugin = unplugin.rolldown;

/** The webpack plugin, for `webpack.config.js`. */
export const webpackPlugin = unplugin.webpack;

/** The Rspack plugin, for `rspack.config.js`. */
export const rspackPlugin = unplugin.rspack;

/** The Rsbuild plugin, for `rsbuild.config.ts`. */
export const rsbuildPlugin = unplugin.rsbuild;

/** The esbuild plugin, for `esbuild.build({ plugins: [...] })`. */
export const esbuildPlugin = unplugin.esbuild;

/** The Farm plugin, for `farm.config.ts`. */
export const farmPlugin = unplugin.farm;

/** The Bun plugin, for `Bun.build({ plugins: [...] })`. */
export const bunPlugin = unplugin.bun;
