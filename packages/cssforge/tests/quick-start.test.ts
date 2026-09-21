import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { ArgsDef } from "citty";
import mainCommand from "../src/cli.ts";
import { assert, assertEquals, Deno } from "./vitest-compat.ts";

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
	assert(start >= 0, `README.md must contain a '${heading}' section`);
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
		assertEquals(typeof value, "string", `the CLI must declare a default for --${name}`);

		return value as string;
	};

	return { css: defaultOf("css"), ts: defaultOf("ts") };
};

Deno.test("quick start - documented usage matches generated tokens and output paths", async () => {
	const readme = await readFile(
		fileURLToPath(new URL("../../../README.md", import.meta.url)),
		"utf8",
	);
	const configFixture = await readFixture("cssforge.config.ts.txt");
	const cssExample = await readFixture("consumer.css.txt");
	const tsExample = await readFixture("consumer.ts.txt");

	const { css: cssPath, ts: tsPath } = documentedOutputPaths();
	assertEquals(cssPath, "./.cssforge/output.css");
	assertEquals(tsPath, "./.cssforge/output.ts");
	assertEquals(cssExample.match(/@import\s+"([^"]+)"/)?.[1], cssPath);
	assertEquals(tsExample.match(/from\s+"([^"]+)"/)?.[1], tsPath);

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
		assertEquals(generate.status, 0, generate.stderr);

		const cssOutput = resolve(projectDir, cssPath);
		const tsOutput = resolve(projectDir, tsPath);
		assertEquals(existsSync(cssOutput), true);
		assertEquals(existsSync(tsOutput), true);

		const css = await readFile(cssOutput, "utf8");
		const declared = new Set(
			[...css.matchAll(/(--[\w-]+)\s*:/g)].map((match) => match[1]),
		);

		// Every custom property the CSS example consumes must be declared.
		const consumed = [...cssExample.matchAll(/var\((--[\w-]+)\)/g)].map(
			(match) => match[1],
		);
		assert(consumed.length > 0, "the CSS example must consume custom properties");
		assertEquals(
			consumed.filter((name) => !declared.has(name)),
			[],
		);

		// No token name in the Quick Start may be missing from the generated
		// declarations, so the documented drift cannot return silently.
		const quickStart = readmeSection(readme, "Quick Start");
		const fences = [...quickStart.matchAll(/^```([^\n]*)\n([\s\S]*?)^```$/gm)].map(
			(match) => ({ language: match[1], body: match[2] }),
		);
		assertEquals(
			fences.filter((fence) => !allowedFenceLanguages.includes(fence.language)),
			[],
			"the Quick Start must only fence code in languages this scan understands",
		);
		const referenced = fences
			.filter((fence) => scannedFenceLanguages.includes(fence.language))
			.flatMap((fence) =>
				[...fence.body.matchAll(/--[a-zA-Z][\w-]*/g)].map((match) => match[0]),
			);
		assert(referenced.length > 0, "the Quick Start must reference generated tokens");
		assertEquals(
			[...new Set(referenced)].filter((name) => !declared.has(name)),
			[],
		);

		// README.md must contain the fixtures exactly.
		assert(
			readme.includes(configFixture.trimEnd()),
			"README.md does not contain the Quick Start configuration fixture",
		);
		assert(
			readme.includes(cssExample.trimEnd()),
			"README.md does not contain the CSS usage fixture",
		);
		assert(
			readme.includes(tsExample.trimEnd()),
			"README.md does not contain the TypeScript usage fixture",
		);

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
		assert(existsSync(tsc), "typescript is required to type-check the example");
		const typecheck = spawnSync(tsc, ["--project", join(projectDir, "tsconfig.json")], {
			cwd: projectDir,
			encoding: "utf8",
			env: childEnv,
		});
		assertEquals(typecheck.status, 0, `${typecheck.stdout}\n${typecheck.stderr}`);

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
		assertEquals(runExample.status, 0, runExample.stderr);

		const token = JSON.parse(runExample.stdout) as {
			key: string;
			value: string;
			variable: string;
		};
		assertEquals(token, {
			key: "--spacing-size-2",
			value: "0.5rem",
			variable: "--spacing-size-2: 0.5rem;",
		});
	} finally {
		await rm(projectDir, { recursive: true, force: true });
	}
});
