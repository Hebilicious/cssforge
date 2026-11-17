import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, expect, test } from "vitest";
import { childEnv } from "./helpers.ts";

const cliPath = fileURLToPath(new URL("../src/cli.ts", import.meta.url));

let projectDir = "";

beforeEach(async () => {
	projectDir = await mkdtemp(join(tmpdir(), "cssforge-cli-human-"));
	await writeFile(
		join(projectDir, "cssforge.config.ts"),
		`export default { spacing: { custom: { size: { value: { 2: "8px" } } } } };\n`,
		"utf8",
	);
});

afterEach(async () => {
	await rm(projectDir, { recursive: true, force: true });
});

const runCli = (args: string[]) =>
	spawnSync(process.execPath, [cliPath, ...args], {
		cwd: projectDir,
		encoding: "utf8",
		env: childEnv,
	});

test("cli - cssforge with no command builds every output", () => {
	const result = runCli([]);

	expect(result.status, result.stderr).toEqual(0);
	const report = JSON.parse(result.stdout) as { files: { format: string }[] };
	expect(report.files.map((file) => file.format)).toEqual([
		"css",
		"json",
		"style-dictionary",
		"ts",
	]);
});

test("cli - cssforge with only flags builds with them", () => {
	const result = runCli(["--mode", "css", "--css", "tokens.css"]);

	expect(result.status, result.stderr).toEqual(0);
	expect(existsSync(join(projectDir, "tokens.css"))).toEqual(true);
	expect(existsSync(join(projectDir, ".cssforge"))).toEqual(false);
});

test("cli - the full command path runs the same capability as its alias", () => {
	const alias = runCli(["generate", "--format", "css"]);
	const full = runCli(["tokens", "generate", "--format", "css"]);

	expect(alias.status, alias.stderr).toEqual(0);
	expect(full.stdout).toEqual(alias.stdout);
});

test("cli - --output human writes the files written as a table", () => {
	const result = runCli(["build", "--mode", "css", "--output", "human"]);

	expect(result.status, result.stderr).toEqual(0);
	expect(result.stdout).toEqual("format  file\ncss     .cssforge/output.css\n");
});

test("cli - --output human writes the generated content as it is", () => {
	const result = runCli(["generate", "-o", "human"]);

	expect(result.status, result.stderr).toEqual(0);
	expect(result.stdout).toContain(":root {\n");
	expect(result.stdout).toContain("--spacing-size-2: 0.5rem;\n");
});

test("cli - --output human writes a failure with its tag and the same exit code", () => {
	const human = runCli(["check", "--config", "missing.ts", "-o", "human"]);
	const json = runCli(["check", "--config", "missing.ts"]);

	expect(human.status).toEqual(1);
	expect(json.status).toEqual(1);
	expect(JSON.parse(json.stdout)._tag).toEqual("ConfigLoadFailed");
	expect(human.stdout).toMatch(
		/^ConfigLoadFailed Could not load the CSS Forge config at /,
	);
});

test("cli - an unknown --output value is invalid input", () => {
	const result = runCli(["build", "--output", "yaml"]);

	// 3 is the exit code of invalid input in the AcidCat CLI binding.
	expect(result.status).toEqual(3);
	expect(result.stdout).toEqual("");
	expect(existsSync(join(projectDir, ".cssforge"))).toEqual(false);
});
