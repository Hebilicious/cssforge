import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { assertEquals, Deno } from "./vitest-compat.ts";

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

Deno.test("cli - each supported mode writes only its declared outputs", async () => {
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

			assertEquals(result.status, 0, `mode ${mode} should exit 0`);
			assertEquals(result.stderr, "");
			for (const [name, path] of Object.entries(paths)) {
				assertEquals(
					existsSync(path),
					(produced as readonly string[]).includes(name),
					`mode ${mode} output ${name}`,
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

Deno.test("cli - omitted mode defaults to all", async () => {
	const tempDir = await mkdtemp(join(tmpdir(), "cssforge-mode-default-"));

	try {
		const configPath = join(tempDir, "cssforge.config.ts");
		await writeFile(configPath, configSource, "utf8");
		const paths = outputsOf(tempDir);

		const result = runCli(["--config", configPath, ...outputArgs(paths)], tempDir);

		assertEquals(result.status, 0);
		assertEquals(result.stderr, "");
		for (const path of Object.values(paths)) {
			assertEquals(existsSync(path), true, `${path} should exist`);
		}
	} finally {
		await rm(tempDir, { recursive: true, force: true });
	}
});

Deno.test("cli - the -m alias selects the output mode", async () => {
	const tempDir = await mkdtemp(join(tmpdir(), "cssforge-mode-alias-"));

	try {
		const configPath = join(tempDir, "cssforge.config.ts");
		await writeFile(configPath, configSource, "utf8");
		const paths = outputsOf(tempDir);

		const result = runCli(
			["--config", configPath, "-m", "json", ...outputArgs(paths)],
			tempDir,
		);

		assertEquals(result.status, 0);
		assertEquals(result.stderr, "");
		assertEquals(existsSync(paths.json), true);
		assertEquals(existsSync(paths.css), false);
		assertEquals(existsSync(paths.ts), false);
	} finally {
		await rm(tempDir, { recursive: true, force: true });
	}
});

Deno.test("cli - an unsupported mode fails without touching existing outputs", async () => {
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

		assertEquals(result.status, 1);
		assertEquals(result.stderr.includes("Invalid output mode"), true);
		assertEquals(result.stderr.includes("typo"), true);
		for (const mode of ["css", "json", "ts", "style-dictionary", "all"]) {
			assertEquals(result.stderr.includes(mode), true, `stderr should name ${mode}`);
		}
		assertEquals(await readFile(paths.css, "utf8"), "/* pre-existing css */");
		assertEquals(await readFile(paths.json, "utf8"), "/* pre-existing json */");
		assertEquals(existsSync(paths.ts), false);
		assertEquals(existsSync(paths.styleDictionary), false);
	} finally {
		await rm(tempDir, { recursive: true, force: true });
	}
});

Deno.test("cli - watch mode rejects an unsupported mode without writing outputs", async () => {
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

		assertEquals(exitCode, 0, `watch() rejected: ${stderr}`);
		assertEquals(stderr.includes("Invalid output mode"), true);
		assertEquals(stdout.includes("Watching"), false);
		assertEquals(existsSync(paths.css), false);
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
