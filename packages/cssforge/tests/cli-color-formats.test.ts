import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { childEnv } from "./helpers.ts";

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

const pathsIn = (tempDir: string) => ({
	config: join(tempDir, "cssforge.config.ts"),
	css: join(tempDir, "output.css"),
	json: join(tempDir, "output.json"),
	ts: join(tempDir, "output.ts"),
	styleDictionary: join(tempDir, "tokens.sd.json"),
});

const buildArgs = (paths: ReturnType<typeof pathsIn>, ...extra: string[]) => [
	"--config",
	paths.config,
	"--css",
	paths.css,
	"--json",
	paths.json,
	"--ts",
	paths.ts,
	"--style-dictionary",
	paths.styleDictionary,
	...extra,
];

test("cli - --color-formats adds the formats to every output", async () => {
	const tempDir = await mkdtemp(join(tmpdir(), "cssforge-color-formats-"));

	try {
		const paths = pathsIn(tempDir);
		await writeFile(paths.config, configSource, "utf8");

		const result = runCli(
			buildArgs(paths, "--color-formats", "hex", "--color-formats", "rgb"),
			tempDir,
		);

		expect(result.status, result.stderr).toEqual(0);
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

test("cli - --color-formats rejects an unknown format and writes nothing", async () => {
	const tempDir = await mkdtemp(join(tmpdir(), "cssforge-color-formats-invalid-"));

	try {
		const paths = pathsIn(tempDir);
		await writeFile(paths.config, configSource, "utf8");

		const result = runCli(buildArgs(paths, "--color-formats", '["hex","hsl"]'), tempDir);

		// 3 is the exit code of invalid input in the AcidCat CLI binding.
		expect(result.status).toEqual(3);
		expect(JSON.parse(result.stderr)).toEqual({
			kind: "invalid-input",
			message: 'color-formats.1: Received "hsl". Expected one of: hex, rgb.',
		});
		for (const output of [paths.css, paths.json, paths.ts, paths.styleDictionary]) {
			expect(existsSync(output), `${output} must not be written`).toEqual(false);
		}
	} finally {
		await rm(tempDir, { recursive: true, force: true });
	}
});
