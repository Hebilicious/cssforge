import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { build, parseColorFormats } from "../src/cli.ts";
import { childEnv, thrownError } from "./helpers.ts";

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

test("parseColorFormats - reads a comma separated list and drops duplicates", () => {
	expect(parseColorFormats(undefined)).toEqual(undefined);
	expect(parseColorFormats("")).toEqual([]);
	expect(parseColorFormats("hex, rgb")).toEqual(["hex", "rgb"]);
	expect(parseColorFormats("rgb,hex,rgb")).toEqual(["rgb", "hex"]);
});

test("parseColorFormats - rejects a format the generator cannot emit", () => {
	const error = thrownError(() => parseColorFormats("hex,hsl"));

	expect(
		error.message.includes("hsl") && error.message.includes("hex"),
		`Expected the error to name the rejected value and the accepted formats. Received: ${error.message}`,
	).toBeTruthy();
});

test("build - --color-formats adds the formats to every output", async () => {
	const tempDir = await mkdtemp(join(tmpdir(), "cssforge-color-formats-"));

	try {
		const paths = pathsIn(tempDir);
		await writeFile(paths.config, configSource, "utf8");

		const result = await buildWithFormats(paths, parseColorFormats("hex,rgb"));

		expect(result.success).toEqual(true);

		const css = await readFile(paths.css, "utf8");
		const json = JSON.parse(await readFile(paths.json, "utf8"));
		const ts = await readFile(paths.ts, "utf8");
		const styleDictionary = JSON.parse(await readFile(paths.styleDictionary, "utf8"));

		expect(css.includes("--palette-coral-100: #ff7f50;")).toEqual(true);
		expect(json.palette.coral["100"].color).toEqual({
			hex: { string: "#ff7f50" },
			rgb: { string: "rgb(255 127 80)" },
		});
		expect(ts.includes('"rgb": {')).toEqual(true);
		expect(styleDictionary.palette.coral["100"].$color).toEqual({
			hex: { string: "#ff7f50" },
			rgb: { string: "rgb(255 127 80)" },
		});
	} finally {
		await rm(tempDir, { recursive: true, force: true });
	}
});

test("build - rejects an unknown color format for JavaScript callers", async () => {
	const tempDir = await mkdtemp(join(tmpdir(), "cssforge-color-formats-invalid-"));

	try {
		const paths = pathsIn(tempDir);
		await writeFile(paths.config, configSource, "utf8");

		const result = await buildWithFormats(paths, ["hsl"]);

		expect(result.success).toEqual(false);
		const message =
			result.error instanceof Error ? result.error.message : String(result.error);
		expect(message.includes("hsl")).toEqual(true);
	} finally {
		await rm(tempDir, { recursive: true, force: true });
	}
});

test("cli - --color-formats writes the formats through the CLI entry", async () => {
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

		expect(result.status, result.stderr).toEqual(0);
		const css = await readFile(paths.css, "utf8");
		expect(css.includes("--palette-coral-100: #ff7f50;")).toEqual(true);
	} finally {
		await rm(tempDir, { recursive: true, force: true });
	}
});

test("cli - --color-formats reports an unknown format", async () => {
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

		expect(result.status).toEqual(1);
		expect(result.stderr.includes("Invalid color format: hsl"), result.stderr).toEqual(
			true,
		);
	} finally {
		await rm(tempDir, { recursive: true, force: true });
	}
});
