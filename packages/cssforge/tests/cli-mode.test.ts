import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

const cliPath = fileURLToPath(new URL("../src/cli.ts", import.meta.url));

// Consumers run the CLI from a shell, so the child process gets a non-test
// environment (vitest sets `TEST` and `NODE_ENV=test`).
const childEnv = { ...process.env };
delete childEnv.TEST;
delete childEnv.NODE_ENV;

const configSource = `export default {
	spacing: {
		custom: { size: { value: { 2: "8px" } } },
	},
};`;

const runCli = (args: string[], cwd: string) =>
	spawnSync(process.execPath, [cliPath, ...args], {
		cwd,
		encoding: "utf8",
		env: childEnv,
	});

const outputsOf = (tempDir: string) => ({
	css: join(tempDir, "output.css"),
	json: join(tempDir, "output.json"),
	ts: join(tempDir, "output.ts"),
	styleDictionary: join(tempDir, "tokens.sd.json"),
});

const outputArgs = (paths: ReturnType<typeof outputsOf>) => [
	"--css",
	paths.css,
	"--json",
	paths.json,
	"--ts",
	paths.ts,
	"--style-dictionary",
	paths.styleDictionary,
];

test("cli - each supported mode writes only its declared outputs", async () => {
	const tempDir = await mkdtemp(join(tmpdir(), "cssforge-mode-outputs-"));

	try {
		const expectedOutputs = {
			css: ["css"],
			json: ["json"],
			ts: ["ts"],
			"style-dictionary": ["styleDictionary"],
			all: ["css", "json", "ts", "styleDictionary"],
		} as const;

		for (const [mode, produced] of Object.entries(expectedOutputs)) {
			const configPath = join(tempDir, "cssforge.config.ts");
			await writeFile(configPath, configSource, "utf8");
			const paths = outputsOf(tempDir);

			const result = runCli(
				["--config", configPath, "--mode", mode, ...outputArgs(paths)],
				tempDir,
			);

			expect(result.status, `mode ${mode} should exit 0`).toEqual(0);
			expect(result.stderr).toEqual("");
			for (const [name, path] of Object.entries(paths)) {
				expect(existsSync(path), `mode ${mode} output ${name}`).toEqual(
					(produced as readonly string[]).includes(name),
				);
			}
			for (const path of Object.values(paths)) {
				await rm(path, { force: true });
			}
		}
	} finally {
		await rm(tempDir, { recursive: true, force: true });
	}
}, 30_000);

test("cli - omitted mode defaults to all", async () => {
	const tempDir = await mkdtemp(join(tmpdir(), "cssforge-mode-default-"));

	try {
		const configPath = join(tempDir, "cssforge.config.ts");
		await writeFile(configPath, configSource, "utf8");
		const paths = outputsOf(tempDir);

		const result = runCli(["--config", configPath, ...outputArgs(paths)], tempDir);

		expect(result.status).toEqual(0);
		expect(result.stderr).toEqual("");
		for (const path of Object.values(paths)) {
			expect(existsSync(path), `${path} should exist`).toEqual(true);
		}
	} finally {
		await rm(tempDir, { recursive: true, force: true });
	}
});

test("cli - an unsupported mode fails without touching existing outputs", async () => {
	const tempDir = await mkdtemp(join(tmpdir(), "cssforge-mode-invalid-"));

	try {
		const configPath = join(tempDir, "cssforge.config.ts");
		await writeFile(configPath, configSource, "utf8");
		const paths = outputsOf(tempDir);
		await writeFile(paths.css, "/* pre-existing css */", "utf8");
		await writeFile(paths.json, "/* pre-existing json */", "utf8");

		const result = runCli(
			["--config", configPath, "--mode", "typo", ...outputArgs(paths)],
			tempDir,
		);

		// 3 is the exit code of invalid input in the AcidCat CLI binding.
		expect(result.status).toEqual(3);
		expect(result.stderr.includes("--mode must be one of")).toEqual(true);
		for (const mode of ["css", "json", "ts", "style-dictionary", "all"]) {
			expect(result.stderr.includes(mode), `stderr should name ${mode}`).toEqual(true);
		}
		expect(await readFile(paths.css, "utf8")).toEqual("/* pre-existing css */");
		expect(await readFile(paths.json, "utf8")).toEqual("/* pre-existing json */");
		expect(existsSync(paths.ts)).toEqual(false);
		expect(existsSync(paths.styleDictionary)).toEqual(false);
	} finally {
		await rm(tempDir, { recursive: true, force: true });
	}
});
