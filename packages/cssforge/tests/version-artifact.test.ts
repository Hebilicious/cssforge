import { spawnSync } from "node:child_process";
import { cpSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { assert, assertEquals, Deno } from "./vitest-compat.ts";

const packageRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const workspaceRoot = resolve(packageRoot, "../..");

// citty prints usage through consola, which silences log output when `TEST` or
// `NODE_ENV=test` is set, as vitest does. Real consumers run from a shell.
const childEnv: NodeJS.ProcessEnv = { ...process.env };
delete childEnv.TEST;
delete childEnv.NODE_ENV;

const run = (
	command: string,
	args: string[],
	cwd: string,
	env: NodeJS.ProcessEnv = childEnv,
): { status: number | null; stdout: string; stderr: string } => {
	const result = spawnSync(command, args, { cwd, encoding: "utf8", env });
	assert(
		result.error === undefined,
		`${command} could not start: ${result.error?.message}`,
	);

	return { status: result.status, stdout: result.stdout, stderr: result.stderr };
};

const readVersion = (path: string): string => {
	const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
	assert(
		typeof parsed === "object" && parsed !== null && "version" in parsed,
		`${path} must declare a version`,
	);

	return String((parsed as { version: unknown }).version);
};

/** Replaces a manifest's `version` field whatever version the workspace carries. */
const withVersion = (source: string, version: string): string => {
	const updated = source.replace(
		/("version"\s*:\s*")[^"]*(")/,
		(_match, prefix: string, suffix: string) => `${prefix}${version}${suffix}`,
	);
	assert(
		updated !== source || source.includes(`"${version}"`),
		"no version field to replace",
	);
	JSON.parse(updated);

	return updated;
};

/** `npm pack --json` reports one entry per package, as a list or a keyed object. */
const parsePackFilename = (output: string): string => {
	const parsed: unknown = JSON.parse(output);
	const entries = Array.isArray(parsed) ? parsed : Object.values(parsed ?? {});
	assert(entries.length === 1, `npm pack did not report exactly one tarball: ${output}`);

	const [entry] = entries;
	assert(
		typeof entry === "object" &&
			entry !== null &&
			typeof (entry as { filename?: unknown }).filename === "string",
		`npm pack did not report a filename: ${output}`,
	);

	return (entry as { filename: string }).filename;
};

const assertSucceeded = (
	result: { status: number | null; stdout: string; stderr: string },
	description: string,
): void => {
	assertEquals(
		result.status,
		0,
		`${description} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
	);
};

/**
 * Copies the workspace as a release checkout looks, minus installed
 * dependencies and build output.
 */
const copyWorkspace = (destination: string): void => {
	for (const entry of [
		"package.json",
		"pnpm-workspace.yaml",
		"pnpm-lock.yaml",
		"moon.yml",
		"tsconfig.base.json",
		"README.md",
		"CHANGELOG.md",
		"packages",
	]) {
		const source = join(workspaceRoot, entry);
		if (existsSync(source)) {
			cpSync(source, join(destination, entry), { recursive: true });
		}
	}
};

/**
 * A packed artifact whose manifest declares a different release version reports
 * that version from its CLI. The fixture version is never published, so nothing
 * here can rewrite registry history. `node_modules` and `dist` are excluded from
 * the copy because their symlinks make a raw copy slow or wrong.
 */
const fixtureVersion = "0.7.0-issue28.1";

/** Builds the CLI into a directory inside the package, which resolves its deps. */
const buildCli = async (): Promise<{ cli: string; cleanUp: () => Promise<void> }> => {
	const outDir = await mkdtemp(join(packageRoot, ".artifact-build-"));

	try {
		assertSucceeded(
			run("node", ["scripts/build.ts", "--out-dir", outDir], packageRoot, childEnv),
			"build of the CLI under test",
		);
	} catch (error) {
		await rm(outDir, { recursive: true, force: true });
		throw error;
	}

	const cli = join(outDir, "cli.js");
	assert(existsSync(cli), `${cli} is missing after the build`);

	return { cli, cleanUp: () => rm(outDir, { recursive: true, force: true }) };
};

Deno.test("cli - reports the manifest version verbatim, with and without CI", async () => {
	const manifestVersion = readVersion(join(packageRoot, "package.json"));
	const workDir = await mkdtemp(join(tmpdir(), "cssforge-built-cli-"));
	const { cli, cleanUp } = await buildCli();

	try {
		for (const [description, env] of [
			["a plain environment", childEnv],
			// citty prints its version through consola, which decorates log
			// output once `CI` is set. Scripts and CI parse `--version`, so the
			// output must not depend on the environment.
			["CI", { ...childEnv, CI: "1" }],
			// The same reporter change is triggered by other CI markers.
			["CI and GITHUB_ACTIONS", { ...childEnv, CI: "1", GITHUB_ACTIONS: "true" }],
		] as const) {
			const result = run(process.execPath, [cli, "--version"], packageRoot, env);
			assertSucceeded(result, `cssforge --version in ${description}`);
			assertEquals(
				result.stdout.trim(),
				manifestVersion,
				`cssforge --version in ${description} must print the manifest version verbatim`,
			);
		}

		// citty prints `meta.version` through its own usage output, where a
		// hard-coded metadata version would surface even though `--version` is
		// answered by the CLI itself.
		const help = run(process.execPath, [cli, "--help"], packageRoot, childEnv);
		assertSucceeded(help, "cssforge --help");
		assert(
			help.stdout.includes(manifestVersion),
			`cssforge --help must print the manifest version, got:\n${help.stdout}`,
		);

		// A version flag next to other arguments stays a normal command, which
		// is how citty resolves its own version flag.
		const projectDir = join(workDir, "project");
		await mkdir(projectDir, { recursive: true });
		const configPath = join(projectDir, "cssforge.config.ts");
		const cssOutput = join(projectDir, "output.css");
		await writeFile(
			configPath,
			`export default {
	spacing: { custom: { size: { value: { 2: "0.5rem" } } } },
};
`,
			"utf8",
		);

		const combined = run(
			process.execPath,
			[cli, "--version", "--config", configPath, "--mode", "css", "--css", cssOutput],
			projectDir,
			{ ...childEnv, CI: "1" },
		);
		assertSucceeded(combined, "cssforge --version with other arguments");
		assert(
			!combined.stdout.split("\n").some((line) => line.trim() === manifestVersion),
			"a version flag combined with other arguments must not print the version",
		);
		assert(
			(await readFile(cssOutput, "utf8")).includes("--spacing-size-2"),
			"a version flag combined with other arguments must still run the command",
		);
	} finally {
		await rm(workDir, { recursive: true, force: true });
		await cleanUp();
	}
}, 180_000);

Deno.test("cli - a packed artifact reports the version its manifest declares", async () => {
	const workDir = await mkdtemp(join(tmpdir(), "cssforge-artifact-version-"));
	const workspace = join(workDir, "workspace");

	try {
		copyWorkspace(workspace);
		assert(
			!existsSync(join(workspace, "node_modules")),
			"the copied workspace must not carry node_modules",
		);

		// Write the fixture release version into the copy's metadata. This is
		// what `changeset version` does to the real workspace, so the generated
		// module and jsr.json are the ones that must be produced for the build.
		const fixtureManifest = join(workspace, "packages/cssforge/package.json");
		writeFileSync(
			fixtureManifest,
			withVersion(readFileSync(fixtureManifest, "utf8"), fixtureVersion),
		);
		writeFileSync(
			join(workspace, "packages/cssforge/CHANGELOG.md"),
			`# @hebilicious/cssforge\n\n## ${fixtureVersion}\n\n### Patch Changes\n\n- fixture entry for the artifact version test\n`,
		);

		assertSucceeded(
			run("pnpm", ["install", "--ignore-scripts"], workspace),
			"pnpm install in the fixture copy",
		);
		assertSucceeded(
			run("node", ["packages/cssforge/scripts/version.ts"], workspace),
			"version sync in the fixture copy",
		);
		assertSucceeded(
			run("pnpm", ["exec", "tsup"], join(workspace, "packages/cssforge")),
			"tsup build in the fixture copy",
		);

		const packed = run(
			"npm",
			["pack", "--json", "--pack-destination", workDir],
			join(workspace, "packages/cssforge"),
		);
		assertSucceeded(packed, "npm pack with the fixture version");

		const filename = parsePackFilename(packed.stdout);
		assert(
			filename.includes(fixtureVersion),
			`the packed tarball ${filename} does not carry the fixture version`,
		);
		const tarball = join(workDir, filename);

		const consumer = join(workDir, "consumer");
		await mkdir(consumer, { recursive: true });
		writeFileSync(
			join(consumer, "package.json"),
			`${JSON.stringify(
				{
					name: "cssforge-artifact-version",
					private: true,
					type: "module",
					dependencies: { "@hebilicious/cssforge": `file:${tarball}` },
				},
				null,
				"\t",
			)}\n`,
		);
		assertSucceeded(
			run("npm", ["install", "--no-audit", "--no-fund"], consumer),
			"npm install of the packed artifact",
		);

		const installedRoot = join(consumer, "node_modules", "@hebilicious/cssforge");
		const installedVersion = readVersion(join(installedRoot, "package.json"));
		assertEquals(
			installedVersion,
			fixtureVersion,
			"the installed artifact does not carry the fixture version",
		);

		const installedCli = join(installedRoot, "dist", "cli.js");
		const reported = run(process.execPath, [installedCli, "--version"], consumer);
		assertSucceeded(reported, "the installed artifact --version");
		assertEquals(
			reported.stdout.trim(),
			fixtureVersion,
			"the installed artifact reports a version that differs from its package.json",
		);

		const executable = join(
			consumer,
			"node_modules",
			".bin",
			process.platform === "win32" ? "cssforge.cmd" : "cssforge",
		);
		assert(existsSync(executable), "npm did not expose the cssforge executable");

		const viaExecutable = run(executable, ["--version"], consumer);
		assertSucceeded(viaExecutable, "the installed cssforge executable --version");
		assertEquals(
			viaExecutable.stdout.trim(),
			fixtureVersion,
			"the installed cssforge executable reports a stale version",
		);
	} finally {
		await rm(workDir, { recursive: true, force: true });
	}
}, 240_000);

Deno.test("cli - rejects metadata that disagrees with the package version", async () => {
	const workDir = await mkdtemp(join(tmpdir(), "cssforge-version-check-"));
	const workspace = join(workDir, "workspace");

	try {
		copyWorkspace(workspace);
		const packageDir = join(workspace, "packages/cssforge");
		const check = () => run("node", ["scripts/version.ts", "--check"], packageDir);
		const sync = () => run("node", ["scripts/version.ts"], packageDir);

		assertSucceeded(sync(), "version sync in the fixture copy");
		assertSucceeded(check(), "version check on consistent metadata");

		const jsrPath = join(packageDir, "jsr.json");
		writeFileSync(jsrPath, withVersion(readFileSync(jsrPath, "utf8"), "0.9.9"));

		// The gate must observe drift rather than repair it, so it is never
		// allowed to run the writing mode first.
		const rejected = check();
		assert(
			rejected.status !== 0,
			"the consistency check accepted a jsr.json that disagrees with package.json",
		);
		assert(
			`${rejected.stderr}${rejected.stdout}`.includes("jsr.json declares 0.9.9"),
			`the consistency check did not explain the disagreement: ${rejected.stderr}`,
		);

		// The generated module is the channel JSR publishes, so drift there must
		// be rejected too.
		assertSucceeded(sync(), "version sync after the jsr.json edit");
		const generatedPath = join(packageDir, "src/version.ts");
		writeFileSync(
			generatedPath,
			readFileSync(generatedPath, "utf8").replace(
				/export const version = "[^"]+";/,
				'export const version = "9.9.9";',
			),
		);
		const staleGenerated = check();
		assert(
			staleGenerated.status !== 0,
			"the consistency check accepted a generated module that disagrees with package.json",
		);
		assert(
			`${staleGenerated.stderr}${staleGenerated.stdout}`.includes(
				"src/version.ts declares 9.9.9",
			),
			`the consistency check did not explain the generated-module drift: ${staleGenerated.stderr}`,
		);

		// The published tarball ships this changelog, so a release without a
		// matching entry must not pass.
		assertSucceeded(sync(), "version sync after the generated-module edit");
		const changelogPath = join(packageDir, "CHANGELOG.md");
		const changelog = readFileSync(changelogPath, "utf8");
		writeFileSync(
			changelogPath,
			changelog.replace(/^## .+$/m, "## 0.0.0-no-entry-for-this-version"),
		);
		const missingEntry = check();
		assert(
			missingEntry.status !== 0,
			"the consistency check accepted a release with no matching changelog entry",
		);
		assert(
			`${missingEntry.stderr}${missingEntry.stdout}`.includes('has no "## '),
			`the consistency check did not explain the changelog drift: ${missingEntry.stderr}`,
		);
	} finally {
		await rm(workDir, { recursive: true, force: true });
	}
}, 120_000);
