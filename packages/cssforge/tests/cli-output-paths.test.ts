import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, win32 } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { writeFileRecursive } from "../src/cli.ts";
import { childEnv } from "./helpers.ts";

const cssForgeConfig = `export default {
	spacing: {
		custom: {
			size: {
				value: {
					2: "0.5rem",
				},
			},
		},
	},
};`;

/**
 * The directory shapes a user can pass to `--css`, `--json`, `--ts` and
 * `--style-dictionary`. The bare shape has no directory component, which is what
 * a parent directory built by string slicing gets wrong.
 */
const outputDirectoryShapes = (dir: string) =>
	[
		["filename in the current directory", ""],
		["nested relative path", "./nested"],
		["absolute path", resolve(dir, "absolute/deep")],
		["path containing spaces", "./dir with spaces"],
	] as const;

/** The file each output flag writes for `--mode all`. */
const outputFileNames = [
	["--css", "output.css"],
	["--json", "output.json"],
	["--ts", "output.ts"],
	["--style-dictionary", "tokens.sd.json"],
] as const;

/** Runs `run` with the process cwd set to a throwaway directory. */
const inTempCwd = async (run: (dir: string) => Promise<void>) => {
	const dir = await mkdtemp(join(tmpdir(), "cssforge-output-paths-"));
	const previousCwd = process.cwd();
	process.chdir(dir);
	try {
		await run(dir);
	} finally {
		process.chdir(previousCwd);
		await rm(dir, { recursive: true, force: true });
	}
};

/** Asserts the path is a file, never a directory, with exactly `expected` content. */
const assertFileWithContents = async (path: string, expected: string) => {
	const stats = await stat(path);
	expect(stats.isDirectory(), `${path} must not be a directory`).toEqual(false);
	expect(stats.isFile(), `${path} must be a file`).toEqual(true);
	expect(await readFile(path, "utf8")).toEqual(expected);
};

test("writeFileRecursive - creates the parent directory and writes the file for every path shape", async () => {
	await inTempCwd(async (dir) => {
		for (const [shape, outputDir] of outputDirectoryShapes(dir)) {
			const outputPath = join(outputDir, "output.css");
			const contents = `/* ${shape} */`;
			await writeFileRecursive(outputPath, contents);
			await assertFileWithContents(resolve(dir, outputPath), contents);
		}
	});
});

test("writeFileRecursive - resolves a Windows output path's parent with the win32 dirname", async () => {
	const windowsOutput = String.raw`C:\project\.cssforge\output.css`;
	const windowsParent = String.raw`C:\project\.cssforge`;

	// The platform-aware primitive the helper is required to depend on.
	expect(win32.dirname(windowsOutput)).toEqual(windowsParent);

	await inTempCwd(async (dir) => {
		await writeFileRecursive(windowsOutput, "css{}", win32.dirname);

		// POSIX treats backslashes as ordinary characters, so here the Windows
		// path is a literal relative path. What this observes is the parent the
		// helper chose: the containing directory, never the output file path.
		const parentStats = await stat(join(dir, windowsParent));
		expect(
			parentStats.isDirectory(),
			`${windowsParent} must be created as a directory`,
		).toEqual(true);
		await assertFileWithContents(join(dir, windowsOutput), "css{}");
	});
});

const sourceCliEntry = fileURLToPath(new URL("../src/cli.ts", import.meta.url));
const builtCliEntry = fileURLToPath(new URL("../dist/cli.js", import.meta.url));

// The `test` moon task depends on `~:build`, so the built entry is always
// present when the suite runs through its owning target. Both entries are
// registered unconditionally so a missing bundle fails loudly instead of
// silently dropping the built-CLI coverage.
const cliEntries = [
	{ label: "src/cli.ts", entry: sourceCliEntry },
	{ label: "dist/cli.js", entry: builtCliEntry },
];

for (const { label, entry } of cliEntries) {
	test(`cli - writes every output kind for every path shape through the ${label} entry`, async () => {
		expect(
			existsSync(entry),
			`${entry} is missing; run \`moon run cssforge:build\` before running this suite directly`,
		).toEqual(true);

		const dir = await mkdtemp(join(tmpdir(), "cssforge-cli-paths-"));

		try {
			await writeFile(join(dir, "cssforge.config.ts"), cssForgeConfig, "utf8");

			for (const [shape, outputDir] of outputDirectoryShapes(dir)) {
				const outputs = outputFileNames.map(
					([flag, fileName]) => [flag, join(outputDir, fileName)] as const,
				);

				const generate = spawnSync(
					process.execPath,
					[
						entry,
						"--config",
						"./cssforge.config.ts",
						"--mode",
						"all",
						...outputs.flatMap(([flag, outputPath]) => [flag, outputPath]),
					],
					{ cwd: dir, encoding: "utf8", env: childEnv },
				);

				expect(
					generate.status,
					`${label} failed for ${shape}: ${generate.stderr}`,
				).toEqual(0);

				for (const [flag, outputPath] of outputs) {
					const target = resolve(dir, outputPath);
					const stats = await stat(target);
					expect(stats.isDirectory(), `${flag} wrote a directory at ${target}`).toEqual(
						false,
					);
					expect(stats.isFile(), `${flag} must write a file at ${target}`).toEqual(true);
					expect(
						(await readFile(target, "utf8")).includes("--spacing-size-2"),
						`${flag} must write the generated token to ${target}`,
					).toEqual(true);
				}
			}
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});
}
