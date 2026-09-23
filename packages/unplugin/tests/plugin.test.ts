import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { generateCSS, InvalidNameError } from "@hebilicious/cssforge";
import { build } from "@hebilicious/cssforge/cli";
import type { UnpluginContextMeta } from "unplugin";
import { expect, test } from "vitest";
import type { CssForgeOptions } from "../src/index.ts";
import { unplugin, virtualCssModuleId } from "../src/index.ts";

/** A single-file config, so every load reads only the files the test writes. */
const configSource = (size: string) => `export default {
	spacing: {
		custom: {
			size: {
				value: {
					2: "${size}",
				},
			},
		},
	},
};
`;

interface BuildContext {
	watchFiles: string[];
	addWatchFile(path: string): void;
}

/**
 * The raw plugin hooks. `unplugin` exposes them through `raw`, which is what a
 * bundler adapter calls with its own context.
 */
const meta: UnpluginContextMeta = { framework: "vite", versions: {} };
const createPlugin = (options: CssForgeOptions) => unplugin.raw(options, meta);

const createBuildContext = (): BuildContext => {
	const watchFiles: string[] = [];
	return {
		watchFiles,
		addWatchFile: (path) => {
			watchFiles.push(path);
		},
	};
};

/**
 * Calls an unplugin hook, whether it is a bare function or the
 * `{ filter, handler }` object form this plugin uses.
 */
const runHook = async (
	hook: unknown,
	context: unknown,
	...args: unknown[]
): Promise<unknown> => {
	const handler =
		typeof hook === "function"
			? hook
			: hook && typeof hook === "object" && "handler" in hook
				? hook.handler
				: undefined;

	if (typeof handler !== "function") {
		throw new Error("the plugin does not define this hook");
	}

	return await (handler as (...args: unknown[]) => unknown).apply(context, args);
};

/** The CSS the config generates, computed without the plugin's loader. */
const expectedCss = async (configPath: string): Promise<string> => {
	const module = (await import(pathToFileURL(configPath).href)) as {
		default: Parameters<typeof generateCSS>[0];
	};
	return generateCSS(module.default);
};

/** Runs `run` in a throwaway project directory holding the config. */
const inProject = async (
	source: string,
	run: (dir: string, configPath: string) => Promise<void>,
) => {
	const dir = await mkdtemp(join(tmpdir(), "cssforge-unplugin-"));
	const configPath = join(dir, "cssforge.config.ts");

	try {
		await writeFile(configPath, source, "utf8");
		await run(dir, configPath);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
};

const loadStylesheet = async (
	plugin: unknown,
	context: BuildContext,
): Promise<string> => {
	const resolved = await runHook(
		(plugin as { resolveId: unknown }).resolveId,
		context,
		virtualCssModuleId,
	);
	// The null byte is what keeps bundler core plugins from treating the id as a
	// file path, so the contract is asserted literally rather than against the
	// constant the plugin exports.
	expect(resolved).toBe("\0virtual:cssforge.css");

	const css = await runHook((plugin as { load: unknown }).load, context, resolved);
	expect(typeof css).toBe("string");
	return css as string;
};

test("plugin - serves the generated stylesheet from virtual:cssforge.css", async () => {
	await inProject(configSource("0.5rem"), async (_dir, configPath) => {
		const plugin = createPlugin({ config: configPath });
		const css = await loadStylesheet(plugin, createBuildContext());

		expect(css).toBe(await expectedCss(configPath));
	});
});

test("plugin - registers the config as a watch file", async () => {
	await inProject(configSource("0.5rem"), async (_dir, configPath) => {
		const plugin = createPlugin({ config: configPath });
		const context = createBuildContext();
		await loadStylesheet(plugin, context);

		// The loader reports imported token modules next to the config, and the
		// core watch suite covers that end to end. This asserts that the plugin
		// registers exactly what the loader reported.
		expect(context.watchFiles).toEqual([configPath]);
	});
});

test("plugin - regenerates after the config changes and the watcher reports it", async () => {
	await inProject(configSource("0.5rem"), async (_dir, configPath) => {
		const plugin = createPlugin({ config: configPath });
		const context = createBuildContext();
		const first = await loadStylesheet(plugin, context);

		await writeFile(configPath, configSource("2rem"), "utf8");

		expect(
			await loadStylesheet(plugin, context),
			"a build keeps the stylesheet it already generated",
		).toBe(first);

		await runHook((plugin as { watchChange: unknown }).watchChange, context, configPath);
		const regenerated = await loadStylesheet(plugin, context);

		expect(regenerated).toContain("--spacing-size-2: 2rem");
	});
});

test("plugin - reports the config path when the config is missing", async () => {
	await inProject(configSource("0.5rem"), async (dir) => {
		const missing = join(dir, "missing.config.ts");
		const plugin = createPlugin({ config: missing });
		const context = createBuildContext();
		const resolved = await runHook(
			(plugin as { resolveId: unknown }).resolveId,
			context,
			virtualCssModuleId,
		);

		await expect(
			runHook((plugin as { load: unknown }).load, context, resolved),
		).rejects.toThrow(missing);
	});
});

test("plugin - write option emits the same stylesheet to disk", async () => {
	await inProject(configSource("0.5rem"), async (dir, configPath) => {
		const cssOutput = join(dir, ".cssforge", "output.css");
		const plugin = createPlugin({ config: configPath, write: { css: cssOutput } });
		const context = createBuildContext();

		await runHook((plugin as { buildStart: unknown }).buildStart, context);

		expect(await readFile(cssOutput, "utf8")).toBe(await expectedCss(configPath));
	});
});

test("plugin - serves the stylesheet the CLI writes for the same config", async () => {
	await inProject(configSource("0.5rem"), async (dir, configPath) => {
		const cliOutput = join(dir, "cli-output.css");
		const built = await build({
			config: configPath,
			mode: "css",
			cssOutput: cliOutput,
			jsonOutput: join(dir, "unused.json"),
			tsOutput: join(dir, "unused.ts"),
		});
		expect(built.success).toBe(true);

		const plugin = createPlugin({ config: configPath });
		const served = await loadStylesheet(plugin, createBuildContext());

		expect(served).toBe(await readFile(cliOutput, "utf8"));
	});
});

test("plugin - fails the build with the offending token path for an invalid name", async () => {
	const invalidConfig = `export default {
	spacing: {
		custom: {
			size: {
				value: {
					"bad name": "1rem",
				},
			},
		},
	},
};
`;

	await inProject(invalidConfig, async (_dir, configPath) => {
		const plugin = createPlugin({ config: configPath });
		const context = createBuildContext();
		const resolved = await runHook(
			(plugin as { resolveId: unknown }).resolveId,
			context,
			virtualCssModuleId,
		);

		const error = await runHook(
			(plugin as { load: unknown }).load,
			context,
			resolved,
		).catch((cause: unknown) => cause);

		expect(error).toBeInstanceOf(InvalidNameError);
		expect((error as Error).message).toContain("spacing.custom.size.bad name");
	});
});

test("plugin - generates for esbuild without registering watch files in buildStart", async () => {
	await inProject(configSource("0.5rem"), async (dir, configPath) => {
		const cssOutput = join(dir, ".cssforge", "output.css");
		const plugin = unplugin.raw(
			{ config: configPath, write: { css: cssOutput } },
			{ framework: "esbuild", versions: {} },
		);
		// unplugin's esbuild adapter throws from `addWatchFile` in `buildStart`.
		const context = {
			addWatchFile() {
				throw new Error(
					"unplugin/esbuild: addWatchFile outside supported hooks (resolveId, load, transform)",
				);
			},
		};

		await runHook((plugin as { buildStart: unknown }).buildStart, context);

		expect(await readFile(cssOutput, "utf8")).toBe(await expectedCss(configPath));
	});
});
