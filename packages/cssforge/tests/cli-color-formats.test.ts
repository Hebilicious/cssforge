import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { build, parseColorFormats } from "../src/cli.ts";
import { childEnv } from "./helpers.ts";
import { assert, assertEquals, assertThrows, Deno } from "./vitest-compat.ts";

const cliPath = fileURLToPath(new URL("../src/cli.ts", import.meta.url));

const runCli = (args: string[], cwd: string) =>
	spawnSync(process.execPath, [cliPath, ...args], {
		cwd,
		encoding: "utf8",
		env: childEnv,
	});

const configSource = `export default {
	colors: {
		palette: {
			value: { coral: { 100: { hex: "#FF7F50" } } },
		},
	},
};`;

interface BuildPaths {
	config: string;
	css: string;
	json: string;
	ts: string;
	styleDictionary: string;
}

const pathsIn = (tempDir: string): BuildPaths => ({
	config: join(tempDir, "cssforge.config.ts"),
	css: join(tempDir, "output.css"),
	json: join(tempDir, "output.json"),
	ts: join(tempDir, "output.ts"),
	styleDictionary: join(tempDir, "tokens.sd.json"),
});

const buildWithFormats = (paths: BuildPaths, colorFormats: unknown) =>
	build({
		config: paths.config,
		mode: "all",
		cssOutput: paths.css,
		jsonOutput: paths.json,
		tsOutput: paths.ts,
		styleDictionaryOutput: paths.styleDictionary,
		colorFormats: colorFormats as never,
	});

Deno.test("parseColorFormats - reads a comma separated list and drops duplicates", () => {
	assertEquals(parseColorFormats(undefined), undefined);
	assertEquals(parseColorFormats(""), []);
	assertEquals(parseColorFormats("hex, rgb"), ["hex", "rgb"]);
	assertEquals(parseColorFormats("rgb,hex,rgb"), ["rgb", "hex"]);
});

Deno.test("parseColorFormats - rejects a format the generator cannot emit", () => {
	const error = assertThrows(() => parseColorFormats("hex,hsl"));

	assert(
		error.message.includes("hsl") && error.message.includes("hex"),
		`Expected the error to name the rejected value and the accepted formats. Received: ${error.message}`,
	);
});

Deno.test("build - --color-formats adds the formats to every output", async () => {
	const tempDir = await mkdtemp(join(tmpdir(), "cssforge-color-formats-"));

	try {
		const paths = pathsIn(tempDir);
		await writeFile(paths.config, configSource, "utf8");

		const result = await buildWithFormats(paths, parseColorFormats("hex,rgb"));

		assertEquals(result.success, true);

		const css = await readFile(paths.css, "utf8");
		const json = JSON.parse(await readFile(paths.json, "utf8"));
		const ts = await readFile(paths.ts, "utf8");
		const styleDictionary = JSON.parse(await readFile(paths.styleDictionary, "utf8"));

		assertEquals(css.includes("--palette-coral-100: #ff7f50;"), true);
		assertEquals(json.palette.coral["100"].color, {
			hex: { string: "#ff7f50" },
			rgb: { string: "rgb(255 127 80)" },
		});
		assertEquals(ts.includes('"rgb": {'), true);
		assertEquals(styleDictionary.palette.coral["100"].$color, {
			hex: { string: "#ff7f50" },
			rgb: { string: "rgb(255 127 80)" },
		});
	} finally {
		await rm(tempDir, { recursive: true, force: true });
	}
});

Deno.test("build - rejects an unknown color format for JavaScript callers", async () => {
	const tempDir = await mkdtemp(join(tmpdir(), "cssforge-color-formats-invalid-"));

	try {
		const paths = pathsIn(tempDir);
		await writeFile(paths.config, configSource, "utf8");

		const result = await buildWithFormats(paths, ["hsl"]);

		assertEquals(result.success, false);
		const message =
			result.error instanceof Error ? result.error.message : String(result.error);
		assertEquals(message.includes("hsl"), true);
	} finally {
		await rm(tempDir, { recursive: true, force: true });
	}
});

Deno.test("cli - --color-formats writes the formats through the CLI entry", async () => {
	const tempDir = await mkdtemp(join(tmpdir(), "cssforge-color-formats-cli-"));

	try {
		const paths = pathsIn(tempDir);
		await writeFile(paths.config, configSource, "utf8");

		const result = runCli(
			[
				"--config",
				paths.config,
				"--mode",
				"css",
				"--css",
				paths.css,
				"--color-formats",
				"hex,rgb",
			],
			tempDir,
		);

		assertEquals(result.status, 0, result.stderr);
		const css = await readFile(paths.css, "utf8");
		assertEquals(css.includes("--palette-coral-100: #ff7f50;"), true);
	} finally {
		await rm(tempDir, { recursive: true, force: true });
	}
});

Deno.test("cli - --color-formats reports an unknown format", async () => {
	const tempDir = await mkdtemp(join(tmpdir(), "cssforge-color-formats-cli-invalid-"));

	try {
		const paths = pathsIn(tempDir);
		await writeFile(paths.config, configSource, "utf8");

		const result = runCli(
			[
				"--config",
				paths.config,
				"--mode",
				"css",
				"--css",
				paths.css,
				"--color-formats",
				"hex,hsl",
			],
			tempDir,
		);

		assertEquals(result.status, 1);
		assertEquals(
			result.stderr.includes("Invalid color format: hsl"),
			true,
			result.stderr,
		);
	} finally {
		await rm(tempDir, { recursive: true, force: true });
	}
});
