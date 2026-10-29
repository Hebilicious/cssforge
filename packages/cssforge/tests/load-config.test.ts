import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import type { LoadedConfig } from "../src/mod.ts";
import { loadConfig } from "../src/mod.ts";
import { childEnv } from "./helpers.ts";

const configSource = `import { size } from "./tokens.ts";
import { nestedSize } from "./nested.ts";

export default {
	spacing: {
		custom: {
			size: {
				value: {
					2: size,
					4: nestedSize,
				},
			},
		},
	},
};
`;

const configFiles = {
	"cssforge.config.ts": configSource,
	"tokens.ts": `export const size = "0.5rem";\n`,
	"nested.ts": `export const nestedSize = "1rem";\n`,
};

const scenarioPath = fileURLToPath(
	new URL("./fixtures/load-config/two-loads.ts", import.meta.url),
);

interface ScenarioResult {
	first: LoadedConfig;
	second: LoadedConfig;
}

/**
 * Runs the two-loads scenario in a plain Node process. The loader installs
 * process-wide module hooks, and a test runner that transforms imports bypasses
 * them, so the scenario runs the loader the way the CLI and bundler plugins do.
 */
const runScenario = (dir: string): ScenarioResult => {
	const result = spawnSync(process.execPath, [scenarioPath, dir], {
		encoding: "utf8",
		env: childEnv,
	});
	const output = result.stdout
		?.split("\n")
		.map((line) => line.trim())
		.filter(Boolean)
		.pop();

	expect(result.status, `the loader scenario failed: ${result.stderr}`).toEqual(0);

	if (output === undefined) {
		throw new Error("the loader scenario printed no result");
	}

	return JSON.parse(output) as ScenarioResult;
};

/** Runs `run` in a throwaway directory holding the config graph. */
const inConfigDir = async (
	files: Record<string, string>,
	run: (dir: string) => Promise<void>,
) => {
	const dir = await mkdtemp(join(tmpdir(), "cssforge-load-config-"));
	try {
		await Promise.all(
			Object.entries(files).map(([name, contents]) =>
				writeFile(join(dir, name), contents, "utf8"),
			),
		);
		await run(dir);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
};

/** Awaits `run` and returns the error it rejected with, for assertions. */
const rejectWith = async (
	run: () => Promise<unknown>,
	message: string,
): Promise<Error> => {
	try {
		await run();
	} catch (error) {
		if (error instanceof Error) return error;
		throw error;
	}

	throw new Error(message);
};

test("loadConfig - returns the default export and every local file the config loaded", async () => {
	await inConfigDir(configFiles, async (dir) => {
		const { first } = runScenario(dir);

		expect(first.config.spacing?.custom?.size?.value).toEqual({ 2: "0.5rem", 4: "1rem" });
		expect(first.dependencies.map((path) => path.replace(dir, "<dir>")).sort()).toEqual([
			"<dir>/cssforge.config.ts",
			"<dir>/nested.ts",
			"<dir>/tokens.ts",
		]);
	});
});

test("loadConfig - loads a TypeScript config whatever the package type declares", async () => {
	// An explicit `"type": "commonjs"` makes Node read `.ts` as CommonJS and turns
	// off module syntax detection, so `export default` would be a syntax error.
	const manifests = [
		["commonjs", `{ "name": "cjs", "version": "0.0.0", "type": "commonjs" }`],
		["module", `{ "name": "esm", "version": "0.0.0", "type": "module" }`],
		["absent", `{ "name": "typeless", "version": "0.0.0" }`],
	] as const;

	for (const [label, manifest] of manifests) {
		await inConfigDir(
			{ "package.json": `${manifest}\n`, ...configFiles },
			async (dir) => {
				const { first } = runScenario(dir);

				expect(first.config.spacing?.custom?.size?.value, `type field: ${label}`).toEqual(
					{ 2: "0.5rem", 4: "1rem" },
				);
				expect(
					first.dependencies.map((path) => path.replace(dir, "<dir>")).sort(),
					`type field: ${label}`,
				).toEqual(["<dir>/cssforge.config.ts", "<dir>/nested.ts", "<dir>/tokens.ts"]);
			},
		);
	}
});

test("loadConfig - re-evaluates a token module the config imports on the next load", async () => {
	await inConfigDir(configFiles, async (dir) => {
		const { first, second } = runScenario(dir);

		expect(first.config.spacing?.custom?.size?.value).toEqual({ 2: "0.5rem", 4: "1rem" });
		expect(second.config.spacing?.custom?.size?.value).toEqual({ 2: "2rem", 4: "1rem" });
	});
});

test("loadConfig - reports the config path when the file does not exist", async () => {
	await inConfigDir({}, async (dir) => {
		const missing = join(dir, "cssforge.config.ts");
		const error = await rejectWith(
			() => loadConfig(missing),
			"loadConfig must reject for a missing config file",
		);

		expect(
			error.message.startsWith(`Could not load the CSS Forge config at ${missing}`),
			`error must name ${missing}: ${error.message}`,
		).toBeTruthy();
	});
});

test("loadConfig - names the config path when the module throws while loading", async () => {
	await inConfigDir(
		{ "cssforge.config.ts": `throw new Error("the token data is corrupt");\n` },
		async (dir) => {
			const path = join(dir, "cssforge.config.ts");
			const error = await rejectWith(
				() => loadConfig(path),
				"loadConfig must reject when the config module throws",
			);

			expect(
				error.message.startsWith(`Could not load the CSS Forge config at ${path}`),
				`error must name ${path}: ${error.message}`,
			).toBeTruthy();
			expect(
				(error.cause as Error | undefined)?.message.includes(
					"the token data is corrupt",
				) === true,
				`the module error must be the cause: ${String(error.cause)}`,
			).toBeTruthy();
		},
	);
});

test("loadConfig - rejects a module whose default export is not a config object", async () => {
	await inConfigDir(
		{ "cssforge.config.ts": `export const spacing = {};\n` },
		async (dir) => {
			const path = join(dir, "cssforge.config.ts");
			const error = await rejectWith(
				() => loadConfig(path),
				"loadConfig must reject a config without a default export",
			);

			expect(
				error.message.includes(path),
				`error must name ${path}: ${error.message}`,
			).toBeTruthy();
			expect(
				error.message.includes("default export"),
				`error must describe the missing default export: ${error.message}`,
			).toBeTruthy();
		},
	);
});
