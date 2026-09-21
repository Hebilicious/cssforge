/**
 * Publication smoke test.
 *
 * Packs the package, installs that tarball in clean consumer projects with npm
 * and pnpm, and verifies the published surface: ESM exports, declarations, the
 * `cssforge` executable, and generated CSS/JSON/TypeScript output. Consumers
 * install nothing beyond the tarball, so this also proves that no repository
 * development dependency (such as `tsx`) is required.
 *
 * The installed CLI must also report the version the packed artifact declares,
 * which is what makes a misleading `--version` impossible to ship.
 *
 * Usage: node ./scripts/smoke-test.ts [--node <path-to-node>]
 * `--node` runs the consumer commands with that Node runtime instead of the one
 * executing this script, which is how the supported engine floor is tested.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, mkdtemp, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import process from "node:process";

type PackFile = {
	path: string;
	size: number;
	mode: number;
};

type PackResult = {
	filename: string;
	files: PackFile[];
};

type PackageManifest = {
	name: string;
	version: string;
	bin?: Record<string, string>;
	engines?: { node?: string };
};

type JsonOutput = {
	spacing: { custom: { size: Record<string, { key: string; value: string }> } };
};

type Consumer = {
	manager: "npm" | "pnpm";
	projectDir: string;
	tarball: string;
	node: string;
	env: NodeJS.ProcessEnv;
	/** The version the packed artifact declares. */
	expectedVersion: string;
};

const packageRoot = resolve(import.meta.dirname, "..");
const packageName = "@hebilicious/cssforge";

function check(condition: unknown, message: string): asserts condition {
	if (!condition) {
		throw new Error(message);
	}
}

const executableName = (name: string): string =>
	process.platform === "win32" ? `${name}.cmd` : name;

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null;

/** Reads a manifest and validates the fields this script relies on. */
const readManifest = (path: string): PackageManifest => {
	const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
	check(isRecord(parsed), `${path} must contain a JSON object`);
	const { name, version } = parsed;
	check(
		typeof name === "string" && typeof version === "string",
		`${path} must declare "name" and "version"`,
	);

	const bin = isRecord(parsed.bin) ? parsed.bin : {};
	const engines = isRecord(parsed.engines) ? parsed.engines : {};

	return {
		name,
		version,
		bin: Object.fromEntries(
			Object.entries(bin).filter(([, target]) => typeof target === "string"),
		) as Record<string, string>,
		engines: { node: typeof engines.node === "string" ? engines.node : undefined },
	};
};

/** Reads the `npm pack --json` report and validates the fields used below. */
const parsePackResult = (output: string, description: string): PackResult => {
	const parsed: unknown = JSON.parse(output);
	check(
		Array.isArray(parsed) && parsed.length === 1,
		`${description} did not report exactly one tarball`,
	);
	const [first]: unknown[] = parsed;
	check(
		isRecord(first) && typeof first.filename === "string",
		`${description} did not report a filename`,
	);
	check(Array.isArray(first.files), `${description} did not report the packed files`);

	const files: PackFile[] = first.files.map((entry: unknown) => {
		check(
			isRecord(entry) && typeof entry.path === "string" && typeof entry.mode === "number",
			`${description} reported a malformed file entry`,
		);

		return { path: entry.path, mode: entry.mode, size: 0 };
	});

	return { filename: first.filename, files };
};

/**
 * npm needs `--` to separate its flags from the script's; pnpm forwards that
 * `--` to the binary, where citty treats it as end-of-options and drops every
 * flag after it.
 */
const scriptInvocation = (manager: "npm" | "pnpm", cliArgs: string[]): string[] =>
	manager === "npm"
		? ["run", "cssforge", "--", ...cliArgs]
		: ["run", "cssforge", ...cliArgs];

const run = (
	command: string,
	args: string[],
	options: { cwd: string; env: NodeJS.ProcessEnv },
): string => {
	const result = spawnSync(command, args, {
		cwd: options.cwd,
		env: options.env,
		encoding: "utf8",
	});
	if (result.error) {
		throw new Error(`${command} could not start: ${result.error.message}`);
	}
	if (result.status !== 0) {
		throw new Error(
			`${command} ${args.join(" ")} exited with code ${result.status}\n` +
				`stdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
		);
	}

	return result.stdout;
};

/**
 * `--version` is citty's version flag (it only answers a bare `--version`), so
 * the reported string is the CLI metadata of the installed artifact. A package
 * manager prints its own banner around a script run and a pnpm shim can
 * interleave the CLI's own log output, so the version is located in the output
 * rather than assumed to be the whole of it.
 */
const assertReportsVersion = (
	command: string,
	args: string[],
	consumer: Consumer,
): string => {
	const output = run(command, [...args, "--version"], {
		cwd: consumer.projectDir,
		env: consumer.env,
	});
	const reported = output
		.split("\n")
		.map((line) => line.trim())
		.find((line) => line === consumer.expectedVersion);

	check(
		reported !== undefined,
		`${command} ${args.join(" ")} --version did not report ${consumer.expectedVersion}\n` +
			`stdout:\n${output}`,
	);

	return reported;
};

/**
 * `pnpm run <script> -- --version` cannot be asserted: pnpm 10 forwards the
 * separator, so the CLI receives `-- --version`, and citty then runs a normal
 * build instead of printing its version. That is pnpm's behaviour, not the
 * metadata's, so this only records which output was observed.
 */
const observeScriptVersion = (consumer: Consumer): string => {
	const output = run(consumer.manager, ["run", "cssforge", "--", "--version"], {
		cwd: consumer.projectDir,
		env: consumer.env,
	});

	return output.includes(consumer.expectedVersion) ? "reported" : "not forwarded";
};

const readNodeArgument = (): string | undefined => {
	const index = process.argv.indexOf("--node");
	if (index === -1) {
		return undefined;
	}
	const value = process.argv[index + 1];
	if (!value) {
		throw new Error("--node requires a path to a node executable");
	}

	return value;
};

// The pnpm consumer omits `type: module` on purpose: Node then has to detect
// the module type of a CommonJS-typed package, which is how consumers without
// that field load their `cssforge.config.ts`.
const consumerManifest = (manager: string, tarball: string): string =>
	`${JSON.stringify(
		{
			name: `cssforge-smoke-${manager}`,
			private: true,
			type: manager === "npm" ? "module" : undefined,
			scripts: { cssforge: "cssforge" },
			devDependencies: { [packageName]: `file:${tarball}` },
		},
		null,
		"\t",
	)}\n`;

const fixtureConfig = `import { defineConfig } from "${packageName}";

export default defineConfig({
	spacing: {
		custom: {
			size: {
				value: {
					2: "0.5rem",
				},
			},
		},
	},
});
`;

/** Reads a fenced code block from the `## Quick Start` section of the README. */
const readQuickStartBlock = (readme: string, language: string): string => {
	const heading = readme.indexOf("\n## Quick Start");
	check(heading !== -1, "the README has no `## Quick Start` section");
	const section = readme.slice(heading + 1);
	const nextHeading = section.indexOf("\n## ", 1);
	const quickStart = nextHeading === -1 ? section : section.slice(0, nextHeading);

	const pattern = new RegExp("```" + language + "\\n([\\s\\S]*?)```");
	const match = pattern.exec(quickStart);
	check(
		match?.[1] !== undefined,
		`the Quick Start section has no \`\`\`${language} code block`,
	);

	return match[1];
};

const consumedCustomProperties = (css: string): string[] => [
	...new Set([...css.matchAll(/var\((--[A-Za-z0-9_-]+)/g)].map((match) => match[1]!)),
];

const declaredCustomProperties = (css: string): string[] => [
	...new Set([...css.matchAll(/^\s*(--[A-Za-z0-9_-]+)\s*:/gm)].map((match) => match[1]!)),
];

const programmaticCheck = `import { defineConfig, generateCSS } from "${packageName}";

const css = generateCSS(
	defineConfig({ spacing: { custom: { size: { value: { 2: "0.5rem" } } } } }),
);

if (!css.includes("--spacing-size-2")) {
	throw new Error(\`generateCSS did not produce the expected variable: \${css}\`);
}

const cli = await import("${packageName}/cli");

if (typeof cli.build !== "function") {
	throw new Error("the ./cli export does not expose build()");
}

console.log("programmatic usage ok");
`;

const typeCheckSource = `import {
	defineConfig,
	generateCSS,
	generateStyleDictionaryJSON,
	type CSSForgeConfig,
} from "${packageName}";
import type { BuildOptions } from "${packageName}/cli";

const config: Partial<CSSForgeConfig> = defineConfig({
	spacing: { custom: { size: { value: { 2: "0.5rem" } } } },
});
const css: string = generateCSS(config);
const tokens: string = generateStyleDictionaryJSON(config);
const options: Partial<BuildOptions> = { mode: "css" };

export { css, tokens, options };
`;

const typeCheckConfig = `${JSON.stringify(
	{
		compilerOptions: {
			module: "nodenext",
			moduleResolution: "nodenext",
			target: "esnext",
			strict: true,
			noEmit: true,
			skipLibCheck: true,
			types: [],
		},
		files: ["type-check.ts"],
	},
	null,
	"\t",
)}\n`;

const verifyTarball = (manifest: PackageManifest, packed: PackResult): void => {
	const files = new Map(packed.files.map((file) => [file.path, file]));

	for (const required of [
		"package.json",
		"README.md",
		"CHANGELOG.md",
		"dist/mod.js",
		"dist/mod.d.ts",
		"dist/cli.js",
		"dist/cli.d.ts",
	]) {
		check(files.has(required), `the tarball is missing ${required}`);
	}

	const cli = files.get("dist/cli.js");
	check(
		cli !== undefined && (cli.mode & 0o111) !== 0,
		"dist/cli.js must be executable inside the tarball",
	);

	for (const [name, target] of Object.entries(manifest.bin ?? {})) {
		check(
			files.has(target.replace(/^\.\//, "")),
			`the "${name}" bin points at ${target}, which is not in the tarball`,
		);
	}
};

/**
 * Properties the Quick Start CSS example reads that the documented
 * configuration cannot declare. Empty now that the README example is correct;
 * the set stays because it is self-cleaning and catches new drift.
 */
const quickStartUndeclaredProperties = new Set<string>([]);

/** Runs the documented Quick Start flow against the packed artifact. */
const verifyQuickStart = async (consumer: Consumer): Promise<void> => {
	const { manager, projectDir, tarball, env } = consumer;
	const readme = readFileSync(
		join(projectDir, "node_modules", packageName, "README.md"),
		"utf8",
	);
	const config = readQuickStartBlock(readme, "typescript");
	const cssExample = readQuickStartBlock(readme, "css");

	const quickStartDir = join(projectDir, "quick-start");
	await mkdir(quickStartDir, { recursive: true });
	await writeFile(
		join(quickStartDir, "package.json"),
		consumerManifest(manager, tarball),
		"utf8",
	);
	await writeFile(join(quickStartDir, "cssforge.config.ts"), config, "utf8");
	// Reuse the parent consumer's install rather than paying for a second one.
	await symlink(
		join(projectDir, "node_modules"),
		join(quickStartDir, "node_modules"),
		"junction",
	);

	// The documented command with no arguments.
	run(manager, scriptInvocation(manager, []), { cwd: quickStartDir, env });

	const outputDir = join(quickStartDir, ".cssforge");
	const css = readFileSync(join(outputDir, "output.css"), "utf8");
	const declared = declaredCustomProperties(css);
	check(declared.length > 0, `${manager} Quick Start CSS declared no custom properties`);

	// Read rather than import: the generated `.ts` has no declared module type
	// in a pnpm consumer, which would emit a warning for no extra coverage.
	const generatedTs = readFileSync(join(outputDir, "output.ts"), "utf8");
	check(
		generatedTs.includes("export const cssForge"),
		"the Quick Start TypeScript output does not export a cssForge object",
	);

	const consumed = consumedCustomProperties(cssExample);
	check(
		consumed.length > 0,
		"the Quick Start CSS example does not consume any custom properties",
	);

	const undeclared = consumed.filter((property) => !declared.includes(property));
	const unexpected = undeclared.filter(
		(property) => !quickStartUndeclaredProperties.has(property),
	);
	check(
		unexpected.length === 0,
		`the Quick Start CSS example consumes ${unexpected.join(", ")}, which the ` +
			`documented configuration does not declare. Either the README and the ` +
			`configuration drifted apart, or the property belongs in ` +
			`quickStartUndeclaredProperties with a reference to issue #23.`,
	);

	// Keyed on the entry, not on current consumption, so a corrected README
	// cannot leave dead entries passing silently.
	const stale = [...quickStartUndeclaredProperties].filter(
		(property) => declared.includes(property) || !consumed.includes(property),
	);
	check(
		stale.length === 0,
		`quickStartUndeclaredProperties lists ${stale.join(", ")}, which the ` +
			`documented configuration now declares or the documented CSS example no ` +
			`longer consumes. The allowlist entry is stale because issue #23 has ` +
			`landed; remove it from quickStartUndeclaredProperties.`,
	);

	if (undeclared.length > 0) {
		console.log(
			`smoke test: ${manager} Quick Start CSS example consumes ` +
				`${undeclared.join(", ")}, allowlisted as undeclared until issue #23 lands`,
		);
	}
};

/** Every output kind the CLI can write, with the flag that selects its path. */
const outputKinds = [
	{ name: "css", flag: "--css", content: (text: string) => text.includes(":root") },
	{
		name: "json",
		flag: "--json",
		content: (text: string) => text.trimStart().startsWith("{"),
	},
	{
		name: "ts",
		flag: "--ts",
		content: (text: string) => text.includes("export const"),
	},
	{
		name: "style-dictionary",
		flag: "--style-dictionary",
		content: (text: string) => text.trimStart().startsWith("{"),
	},
] as const;

/**
 * Runs the packed artifact once per output shape and asserts each declared path
 * is a file with the expected content, never a directory named after the output.
 * Relative shapes are passed as genuinely relative arguments, and only the
 * project directory is pre-created so the CLI must create every output parent.
 */
const verifyOutputPaths = async (consumer: Consumer): Promise<void> => {
	const { manager, projectDir, tarball, env } = consumer;
	const installArgs =
		manager === "npm" ? ["install", "--no-audit", "--no-fund"] : ["install"];

	// One install shared by every shape: re-installing per shape would quadruple
	// the dominant cost of this harness.
	const baseDir = join(projectDir, "path-shapes");
	await mkdir(baseDir, { recursive: true });
	await writeFile(
		join(baseDir, "package.json"),
		consumerManifest(manager, tarball),
		"utf8",
	);
	await writeFile(join(baseDir, "cssforge.config.ts"), fixtureConfig, "utf8");
	run(manager, installArgs, { cwd: baseDir, env });

	const shapes: { name: string; prefix: string }[] = [
		{ name: "filename in the current directory", prefix: "" },
		{ name: "nested relative path", prefix: "nested/deep" },
		{ name: "absolute path", prefix: join(projectDir, "absolute-outputs") },
		{ name: "path containing spaces", prefix: "spaces here" },
	];

	for (const [index, shape] of shapes.entries()) {
		const shapeDir = join(baseDir, `shape-${index}`);

		await mkdir(shapeDir, { recursive: true });
		await symlink(
			join(baseDir, "node_modules"),
			join(shapeDir, "node_modules"),
			"junction",
		);
		await writeFile(
			join(shapeDir, "package.json"),
			consumerManifest(manager, tarball),
			"utf8",
		);
		await writeFile(join(shapeDir, "cssforge.config.ts"), fixtureConfig, "utf8");

		const args = ["--mode", "all", "--config", "./cssforge.config.ts"];
		const expected = new Map<string, string>();

		for (const kind of outputKinds) {
			const argument = shape.prefix
				? join(shape.prefix, `${kind.name}.out`)
				: `${kind.name}.out`;
			args.push(kind.flag, argument);
			expected.set(resolve(shapeDir, argument), kind.name);
		}

		// A pre-created parent here would mask a parent-creation regression.
		for (const [target] of expected) {
			const parent = dirname(target);
			check(
				parent === shapeDir || !existsSync(parent),
				`${manager} harness pre-created ${parent}, which would mask a ` +
					`parent-creation regression in the CLI (shape: ${shape.name})`,
			);
		}

		run(manager, scriptInvocation(manager, args), { cwd: shapeDir, env });

		for (const [target, kind] of expected) {
			const info = await stat(target).catch(() => undefined);
			check(
				info !== undefined,
				`${manager} did not write the ${kind} output at ${target} (shape: ${shape.name})`,
			);
			check(
				info.isFile(),
				`${manager} produced a ${kind} output at ${target} that is not a file ` +
					`(shape: ${shape.name})`,
			);

			const kindDefinition = outputKinds.find((entry) => entry.name === kind);
			check(kindDefinition !== undefined, `unknown output kind ${kind}`);
			const text = readFileSync(target, "utf8");
			check(
				text.length > 0 && kindDefinition.content(text),
				`${manager} ${kind} output at ${target} has unexpected content ` +
					`(shape: ${shape.name})`,
			);
		}
	}
};

const verifyConsumer = async (consumer: Consumer): Promise<void> => {
	const { manager, projectDir, tarball, node, env, expectedVersion } = consumer;

	await mkdir(projectDir, { recursive: true });
	await writeFile(
		join(projectDir, "package.json"),
		consumerManifest(manager, tarball),
		"utf8",
	);
	await writeFile(join(projectDir, "cssforge.config.ts"), fixtureConfig, "utf8");
	await writeFile(join(projectDir, "programmatic-check.mjs"), programmaticCheck, "utf8");

	run(manager, manager === "npm" ? ["install", "--no-audit", "--no-fund"] : ["install"], {
		cwd: projectDir,
		env,
	});

	const installedRoot = join(projectDir, "node_modules", packageName);
	check(existsSync(installedRoot), `${manager} did not install ${packageName}`);
	check(
		!existsSync(join(projectDir, "node_modules", ".bin", executableName("tsx"))),
		`the ${manager} consumer project must not need tsx`,
	);

	const installed = readManifest(join(installedRoot, "package.json"));
	check(
		installed.version === expectedVersion,
		`${manager} installed ${installed.version} but the packed artifact is ${expectedVersion}`,
	);
	check(
		Object.keys(installed.bin ?? {}).includes("cssforge"),
		`the installed ${manager} package does not declare the cssforge executable`,
	);
	check(
		typeof installed.engines?.node === "string",
		"the installed package must declare its supported Node engines",
	);

	const cliEntry = join(installedRoot, installed.bin?.cssforge ?? "dist/cli.js");
	check(
		readFileSync(cliEntry, "utf8").startsWith("#!/usr/bin/env node"),
		`${installed.bin?.cssforge} must keep its node shebang`,
	);

	const executable = join(projectDir, "node_modules", ".bin", executableName("cssforge"));
	check(existsSync(executable), `${manager} did not expose the cssforge executable`);
	if (process.platform !== "win32") {
		check(
			((await stat(executable)).mode & 0o111) !== 0,
			`${manager} exposed a cssforge executable without execute permission`,
		);
	}

	// The package script documented in the README.
	const helpArgs = scriptInvocation(manager, ["--help"]);
	const help = run(manager, helpArgs, {
		cwd: projectDir,
		env,
	});
	check(
		help.includes("USAGE") && help.includes("cssforge"),
		`${manager} ${helpArgs.join(" ")} did not print the CLI usage`,
	);

	// The executable symlink (npm) or shim (pnpm), invoked directly.
	run(executable, ["--help"], { cwd: projectDir, env });

	// The version the installed artifact reports when a consumer runs the
	// executable it actually calls. `assertReportsVersion` asserts that string
	// equals the version of the installed package.json.
	const reported = assertReportsVersion(executable, [], consumer);
	const viaScript = observeScriptVersion(consumer);
	console.log(
		`smoke test: ${manager} ${executableName("cssforge")} --version reports ${reported}, ` +
			`through \`${manager} run cssforge -- --version\` the version is ${viaScript}`,
	);

	run(
		manager,
		scriptInvocation(manager, ["--mode", "all", "--config", "./cssforge.config.ts"]),
		{
			cwd: projectDir,
			env,
		},
	);

	const outputDir = join(projectDir, ".cssforge");
	const css = readFileSync(join(outputDir, "output.css"), "utf8");
	check(css.includes("--spacing-size-2: 0.5rem;"), `${manager} CSS output is wrong`);

	const json = JSON.parse(
		readFileSync(join(outputDir, "output.json"), "utf8"),
	) as Partial<JsonOutput>;
	check(
		json.spacing?.custom?.size?.["2"]?.key === "--spacing-size-2",
		`${manager} JSON output is wrong`,
	);

	const typescript = readFileSync(join(outputDir, "output.ts"), "utf8");
	check(typescript.includes("--spacing-size-2"), `${manager} TypeScript output is wrong`);

	check(
		existsSync(join(outputDir, "tokens.sd.json")),
		`${manager} Style Dictionary output is missing`,
	);

	run(node, [join(projectDir, "programmatic-check.mjs")], {
		cwd: projectDir,
		env,
	});
};

const verifyDeclarations = async (consumer: Consumer): Promise<void> => {
	const { projectDir, env } = consumer;
	const tsc = join(packageRoot, "node_modules", ".bin", executableName("tsc"));

	check(existsSync(tsc), "typescript is required to verify declarations");

	await writeFile(join(projectDir, "type-check.ts"), typeCheckSource, "utf8");
	await writeFile(join(projectDir, "tsconfig.json"), typeCheckConfig, "utf8");

	run(tsc, ["--project", join(projectDir, "tsconfig.json")], {
		cwd: projectDir,
		env,
	});
};

const main = async (): Promise<void> => {
	const nodeArgument = readNodeArgument();
	const node = nodeArgument ?? process.execPath;
	const manifest = readManifest(join(packageRoot, "package.json"));
	const env: NodeJS.ProcessEnv = { ...process.env };
	// citty prints usage through consola, which silences log output in test
	// environments. Consumers do not run the CLI with these variables set.
	delete env.TEST;
	delete env.NODE_ENV;
	// Consumer commands run with the same Node (and its npm) as this process, or
	// with the runtime passed through --node.
	env.PATH = `${dirname(node)}${delimiter}${env.PATH ?? ""}`;

	const workDir = await mkdtemp(join(tmpdir(), "cssforge-smoke-"));
	const packDir = join(workDir, "pack");
	console.log(`smoke test: ${packageName}@${manifest.version} in ${workDir}`);

	try {
		await mkdir(packDir, { recursive: true });
		const packed = parsePackResult(
			run("npm", ["pack", "--json", "--pack-destination", packDir], {
				cwd: packageRoot,
				env,
			}),
			"npm pack",
		);
		verifyTarball(manifest, packed);
		const tarball = join(packDir, packed.filename);
		console.log(
			`smoke test: packed ${packed.filename} with ${packed.files.length} files`,
		);

		for (const manager of ["npm", "pnpm"] as const) {
			const consumer: Consumer = {
				manager,
				projectDir: join(workDir, manager),
				tarball,
				node,
				env,
				expectedVersion: manifest.version,
			};
			await verifyConsumer(consumer);
			await verifyQuickStart(consumer);
			await verifyOutputPaths(consumer);
			if (manager === "npm") {
				await verifyDeclarations(consumer);
			}
			console.log(`smoke test: ${manager} consumer verified`);
		}

		const nodeVersion = run(node, ["--version"], { cwd: workDir, env }).trim();
		const npmVersion = run(executableName("npm"), ["--version"], {
			cwd: workDir,
			env,
		}).trim();
		const pnpmVersion = run(executableName("pnpm"), ["--version"], {
			cwd: workDir,
			env,
		}).trim();
		console.log(
			`smoke test: passed with node ${nodeVersion}, npm ${npmVersion}, pnpm ${pnpmVersion}`,
		);
	} finally {
		await rm(workDir, { recursive: true, force: true });
	}
};

await main();
