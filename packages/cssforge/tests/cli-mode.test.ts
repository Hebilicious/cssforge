import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

const cliPath = fileURLToPath(new URL("../src/cli.ts", import.meta.url));

// citty prints usage through consola, which silences log output in test
// environments (`TEST` and `NODE_ENV=test`, both set by vitest). Consumers run
// the CLI from a shell, so the child process gets a non-test environment.
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
});

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

test("cli - the -m alias selects the output mode", async () => {
	const tempDir = await mkdtemp(join(tmpdir(), "cssforge-mode-alias-"));

	try {
		const configPath = join(tempDir, "cssforge.config.ts");
		await writeFile(configPath, configSource, "utf8");
		const paths = outputsOf(tempDir);

		const result = runCli(
			["--config", configPath, "-m", "json", ...outputArgs(paths)],
			tempDir,
		);

		expect(result.status).toEqual(0);
		expect(result.stderr).toEqual("");
		expect(existsSync(paths.json)).toEqual(true);
		expect(existsSync(paths.css)).toEqual(false);
		expect(existsSync(paths.ts)).toEqual(false);
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

		expect(result.status).toEqual(1);
		expect(result.stderr.includes("Invalid output mode")).toEqual(true);
		expect(result.stderr.includes("typo")).toEqual(true);
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

test("cli - watch mode rejects an unsupported mode without writing outputs", async () => {
	const tempDir = await mkdtemp(join(tmpdir(), "cssforge-mode-watch-invalid-"));

	try {
		const configPath = join(tempDir, "cssforge.config.ts");
		await writeFile(configPath, configSource, "utf8");
		const paths = outputsOf(tempDir);

		const child = spawn(process.execPath, ["--input-type=module", "-e", watchScript], {
			cwd: tempDir,
			env: { ...childEnv, CSSFORGE_CONFIG: configPath, CSSFORGE_CSS: paths.css },
			stdio: ["ignore", "pipe", "pipe"],
		});
		let stdout = "";
		let stderr = "";
		child.stdout.on("data", (chunk) => (stdout += String(chunk)));
		child.stderr.on("data", (chunk) => (stderr += String(chunk)));

		const exitCode = await new Promise<number | null>((resolve) => {
			child.on("close", resolve);
		});

		expect(exitCode, `watch() rejected: ${stderr}`).toEqual(0);
		expect(stderr.includes("Invalid output mode")).toEqual(true);
		expect(stdout.includes("Watching")).toEqual(false);
		expect(existsSync(paths.css)).toEqual(false);
	} finally {
		await rm(tempDir, { recursive: true, force: true });
	}
});

const watchScript = `
const { watch } = await import(${JSON.stringify(new URL("../src/cli.ts", import.meta.url).href)});
try {
	await watch({
		config: process.env.CSSFORGE_CONFIG,
		mode: "typo",
		cssOutput: process.env.CSSFORGE_CSS,
		jsonOutput: "output.json",
		tsOutput: "output.ts",
	});
} catch (error) {
	console.error(String(error));
}
`;
