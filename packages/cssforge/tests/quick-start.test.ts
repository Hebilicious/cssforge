import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { ArgsDef } from "citty";
import { expect, test } from "vitest";
import mainCommand from "../src/cli.ts";

// The fixtures are excerpts of README.md that must match it byte for byte, so
// they keep a `.txt` suffix: the TypeScript one imports the generated
// `./.cssforge/output.ts`, which only exists once the CLI has run.

const fixtureDir = fileURLToPath(new URL("./fixtures/quick-start", import.meta.url));
const readFixture = (name: string) => readFile(join(fixtureDir, name), "utf8");

// Fences in any other language would be skipped by the drift scan, so
// unexpected ones fail instead.
const scannedFenceLanguages = ["css", "typescript"];
const allowedFenceLanguages = ["bash", ...scannedFenceLanguages];

/** Reads a level-2 README section up to the next level-2 heading. */
const readmeSection = (readme: string, title: string): string => {
	const heading = `## ${title}`;
	const start = readme.indexOf(heading);
	expect(start >= 0, `README.md must contain a '${heading}' section`).toBeTruthy();
	const end = readme.indexOf("\n## ", start + heading.length);

	return readme.slice(start, end === -1 ? readme.length : end);
};

// citty prints usage through consola, which is silenced when `TEST` or
// `NODE_ENV=test` is set by vitest. A shell consumer has neither.
const childEnv = { ...process.env };
delete childEnv.TEST;
delete childEnv.NODE_ENV;

const executableName = (name: string): string =>
	process.platform === "win32" ? `${name}.cmd` : name;

/** Reads the output paths the CLI documents as its defaults. */
const documentedOutputPaths = (): { css: string; ts: string } => {
	// citty types `args` as resolvable; this command declares a plain object.
	const args = (mainCommand.args ?? {}) as ArgsDef;
	const defaultOf = (name: string): string => {
		const value = args[name]?.default;
		expect(typeof value, `the CLI must declare a default for --${name}`).toEqual(
			"string",
		);

		return value as string;
	};

	return { css: defaultOf("css"), ts: defaultOf("ts") };
};

test("quick start - documented usage matches generated tokens and output paths", async () => {
	const readme = await readFile(
		fileURLToPath(new URL("../../../README.md", import.meta.url)),
		"utf8",
	);
	const configFixture = await readFixture("cssforge.config.ts.txt");
	const cssExample = await readFixture("consumer.css.txt");
	const tsExample = await readFixture("consumer.ts.txt");

	const { css: cssPath, ts: tsPath } = documentedOutputPaths();
	expect(cssPath).toEqual("./.cssforge/output.css");
	expect(tsPath).toEqual("./.cssforge/output.ts");
	expect(cssExample.match(/@import\s+"([^"]+)"/)?.[1]).toEqual(cssPath);
	expect(tsExample.match(/from\s+"([^"]+)"/)?.[1]).toEqual(tsPath);

	const projectDir = await mkdtemp(join(tmpdir(), "cssforge-quick-start-"));

	try {
		await writeFile(
			join(projectDir, "package.json"),
			`${JSON.stringify({ name: "cssforge-quick-start", private: true, type: "module" }, null, "\t")}\n`,
			"utf8",
		);

		// The fixture imports the published name, which resolves to built output
		// inside this repository. Point it at the source entry point instead.
		const sourceEntry = pathToFileURL(
			fileURLToPath(new URL("../src/mod.ts", import.meta.url)),
		).href;
		await writeFile(
			join(projectDir, "cssforge.config.ts"),
			configFixture.replace('"@hebilicious/cssforge"', `"${sourceEntry}"`),
			"utf8",
		);

		// The documented flow: `cssforge` in the project root, no arguments.
		const generate = spawnSync(
			process.execPath,
			[fileURLToPath(new URL("../src/cli.ts", import.meta.url))],
			{ cwd: projectDir, encoding: "utf8", env: childEnv },
		);
		expect(generate.status, generate.stderr).toEqual(0);

		const cssOutput = resolve(projectDir, cssPath);
		const tsOutput = resolve(projectDir, tsPath);
		expect(existsSync(cssOutput)).toEqual(true);
		expect(existsSync(tsOutput)).toEqual(true);

		const css = await readFile(cssOutput, "utf8");
		const declared = new Set(
			[...css.matchAll(/(--[\w-]+)\s*:/g)].map((match) => match[1]),
		);

		// Every custom property the CSS example consumes must be declared.
		const consumed = [...cssExample.matchAll(/var\((--[\w-]+)\)/g)].map(
			(match) => match[1],
		);
		expect(
			consumed.length > 0,
			"the CSS example must consume custom properties",
		).toBeTruthy();
		expect(consumed.filter((name) => !declared.has(name))).toEqual([]);

		// No token name in the Quick Start may be missing from the generated
		// declarations, so the documented drift cannot return silently.
		const quickStart = readmeSection(readme, "Quick Start");
		const fences = [...quickStart.matchAll(/^```([^\n]*)\n([\s\S]*?)^```$/gm)].map(
			(match) => ({ language: match[1], body: match[2] }),
		);
		expect(
			fences.filter((fence) => !allowedFenceLanguages.includes(fence.language)),
			"the Quick Start must only fence code in languages this scan understands",
		).toEqual([]);
		const referenced = fences
			.filter((fence) => scannedFenceLanguages.includes(fence.language))
			.flatMap((fence) =>
				[...fence.body.matchAll(/--[a-zA-Z][\w-]*/g)].map((match) => match[0]),
			);
		expect(
			referenced.length > 0,
			"the Quick Start must reference generated tokens",
		).toBeTruthy();
		expect([...new Set(referenced)].filter((name) => !declared.has(name))).toEqual([]);

		// README.md must contain the fixtures exactly.
		expect(
			readme.includes(configFixture.trimEnd()),
			"README.md does not contain the Quick Start configuration fixture",
		).toBeTruthy();
		expect(
			readme.includes(cssExample.trimEnd()),
			"README.md does not contain the CSS usage fixture",
		).toBeTruthy();
		expect(
			readme.includes(tsExample.trimEnd()),
			"README.md does not contain the TypeScript usage fixture",
		).toBeTruthy();

		// The documented property chain must type-check and resolve.
		const usagePath = join(projectDir, "consumer.ts");
		await writeFile(usagePath, tsExample, "utf8");
		// The compiler options the Quick Start documents for the generated `.ts`.
		await writeFile(
			join(projectDir, "tsconfig.json"),
			`${JSON.stringify(
				{
					compilerOptions: {
						target: "esnext",
						module: "nodenext",
						moduleResolution: "nodenext",
						strict: true,
						noEmit: true,
						skipLibCheck: true,
						allowImportingTsExtensions: true,
						types: [],
					},
					files: ["consumer.ts"],
				},
				null,
				"\t",
			)}\n`,
			"utf8",
		);

		const tsc = join(
			fileURLToPath(new URL("..", import.meta.url)),
			"node_modules",
			".bin",
			executableName("tsc"),
		);
		expect(
			existsSync(tsc),
			"typescript is required to type-check the example",
		).toBeTruthy();
		const typecheck = spawnSync(tsc, ["--project", join(projectDir, "tsconfig.json")], {
			cwd: projectDir,
			encoding: "utf8",
			env: childEnv,
		});
		expect(typecheck.status, `${typecheck.stdout}\n${typecheck.stderr}`).toEqual(0);

		const runExample = spawnSync(
			process.execPath,
			[
				"--input-type=module",
				"-e",
				`const { spacing2 } = await import(${JSON.stringify(
					pathToFileURL(usagePath).href,
				)});\nconsole.log(JSON.stringify(spacing2));`,
			],
			{ cwd: projectDir, encoding: "utf8", env: childEnv },
		);
		expect(runExample.status, runExample.stderr).toEqual(0);

		const token = JSON.parse(runExample.stdout) as {
			key: string;
			value: string;
			variable: string;
		};
		expect(token).toEqual({
			key: "--spacing-size-2",
			value: "0.5rem",
			variable: "--spacing-size-2: 0.5rem;",
		});
	} finally {
		await rm(projectDir, { recursive: true, force: true });
	}
});
