import { spawnSync } from "node:child_process";
import { cpSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { assert, assertEquals, Deno } from "./vitest-compat.ts";

const packageRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const workspaceRoot = resolve(packageRoot, "../..");

// citty prints usage through consola, which silences log output in test
// environments (`TEST` and `NODE_ENV=test`, both set by vitest). The CLI runs
// from a shell for real consumers, so children get a non-test environment.
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

/**
 * Replaces the `version` field of a JSON manifest without depending on the
 * version the workspace currently carries, so the tests keep working after the
 * next release bump.
 */
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
 * Copies the workspace the way a release checkout looks, minus the installed
 * dependencies and build output. `pnpm install` and `npm pack` run inside the
 * copy afterwards.
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
 * The promise: a packed artifact whose manifest declares a different release
 * version reports that version from its CLI, without `cli.ts` being edited.
 *
 * The fixture version is written into a copy of the workspace before packing,
 * so the assertion runs against a real tarball laid out by `npm pack` and
 * installed by `npm install`. The copy is filtered to the files a release
 * checkout needs, because `node_modules` and `dist` contain symlinks that make
 * a raw copy slow or wrong. The fixture is a version that has never been
 * published, so nothing here can republish or rewrite registry history.
 */
const fixtureVersion = "0.7.0-issue28.1";

Deno.test("cli - reports the manifest version verbatim, with and without CI", () => {
	const manifestVersion = readVersion(join(packageRoot, "package.json"));

	// The promise is about the built artifact, so build it here: the test task
	// does not depend on the build, and an implicit dependency would be a
	// different promise than "the built CLI prints this".
	const built = run("npx", ["tsup"], packageRoot);
	assertSucceeded(built, "tsup build for the built-CLI check");

	const cli = join(packageRoot, "dist", "cli.js");
	assert(existsSync(cli), `${cli} is missing after the build`);

	for (const [description, env] of [
		["a plain environment", childEnv],
		// citty prints its version through consola, which decorates log output
		// once `CI` is set. Scripts and CI parse `--version`, so the output must
		// not depend on the environment.
		["CI", { ...childEnv, CI: "1" }],
		// The same reporter change is triggered by other CI markers.
		["CI and GITHUB_ACTIONS", { ...childEnv, CI: "1", GITHUB_ACTIONS: "true" }],
	] as const) {
		for (const flag of ["--version", "-v"]) {
			const result = run(process.execPath, [cli, flag], packageRoot, env);
			assertSucceeded(result, `cssforge ${flag} in ${description}`);
			assertEquals(
				result.stdout.trim(),
				manifestVersion,
				`cssforge ${flag} in ${description} must print the manifest version verbatim`,
			);
		}
	}

	// A version flag next to other arguments stays a normal build, which is how
	// citty resolves its own version flag.
	const combined = run(
		process.execPath,
		[cli, "--version", "--mode", "css"],
		packageRoot,
		{ ...childEnv, CI: "1" },
	);
	assert(
		combined.stdout.trim() !== manifestVersion,
		"a version flag combined with other arguments must not short-circuit the command",
	);
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

		const compiledCli = join(workspace, "packages/cssforge/dist/cli.js");
		assert(
			readFileSync(compiledCli, "utf8").includes(fixtureVersion),
			"the fixture build did not inline the fixture version into dist/cli.js",
		);

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
		const bundled = readFileSync(installedCli, "utf8");
		assert(
			bundled.includes(`var version = "${fixtureVersion}"`),
			"the built CLI did not inline the version from src/version.ts",
		);

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
