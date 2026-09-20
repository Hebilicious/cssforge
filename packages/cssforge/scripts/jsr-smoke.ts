/**
 * Smoke test for the secondary JSR channel.
 *
 * JSR publishes the TypeScript source declared in `jsr.json`, not `dist`, so
 * this verifies that those entry points stay publishable and executable: the
 * declared exports exist, the manifest versions agree, and both the module
 * entry and the CLI entry generate output.
 *
 * Deno is the real consumer of this channel, so when Deno is installed the same
 * checks also run under Deno. Pass `--require-deno` to turn a missing Deno into
 * a failure, which is what CI does.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, matchesGlob, resolve } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

type JsrManifest = {
	name: string;
	version: string;
	exports: Record<string, string>;
	publish?: { include?: string[] };
};

type PackageManifest = {
	name: string;
	version: string;
};

type Runtime = {
	name: string;
	command: string;
};

const packageRoot = resolve(import.meta.dirname, "..");

function check(condition: unknown, message: string): asserts condition {
	if (!condition) {
		throw new Error(message);
	}
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null;

const parseJsonFile = (path: string): Record<string, unknown> => {
	const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
	check(isRecord(parsed), `${path} must contain a JSON object`);

	return parsed;
};

/** Reads a manifest and validates the fields this script relies on. */
const readManifest = (path: string): PackageManifest => {
	const parsed = parseJsonFile(path);
	check(
		typeof parsed.name === "string" && typeof parsed.version === "string",
		`${path} must declare "name" and "version"`,
	);

	return { name: parsed.name, version: parsed.version };
};

/** Reads the JSR manifest and validates the entries it publishes. */
const readJsrManifest = (path: string): JsrManifest => {
	const parsed = parseJsonFile(path);
	check(
		typeof parsed.name === "string" && typeof parsed.version === "string",
		`${path} must declare "name" and "version"`,
	);
	check(isRecord(parsed.exports), `${path} must declare "exports"`);

	const exports = Object.entries(parsed.exports).filter(
		(entry): entry is [string, string] => typeof entry[1] === "string",
	);
	check(exports.length > 0, `${path} must declare at least one export`);

	const publish = isRecord(parsed.publish) ? parsed.publish : {};
	const include = Array.isArray(publish.include)
		? publish.include.filter((pattern): pattern is string => typeof pattern === "string")
		: [];
	check(include.length > 0, `${path} must declare which files it publishes`);

	return {
		name: parsed.name,
		version: parsed.version,
		exports: Object.fromEntries(exports),
		publish: { include },
	};
};

const run = (runtime: Runtime, args: string[], cwd: string): string => {
	const result = spawnSync(runtime.command, args, {
		cwd,
		encoding: "utf8",
		env: { ...process.env, TEST: undefined, NODE_ENV: undefined },
	});
	if (result.error) {
		throw new Error(`${runtime.name} could not start: ${result.error.message}`);
	}
	if (result.status !== 0) {
		throw new Error(
			`${runtime.name} ${args.join(" ")} exited with code ${result.status}\n` +
				`stdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
		);
	}

	return result.stdout;
};

const runEntry = (runtime: Runtime, entry: string, args: string[], cwd: string) =>
	run(
		runtime,
		runtime.name === "deno"
			? ["run", "-A", "--no-lock", entry, ...args]
			: [entry, ...args],
		cwd,
	);

const findDeno = (): string | undefined => {
	const result = spawnSync("deno", ["--version"], { encoding: "utf8" });

	return result.status === 0 ? "deno" : undefined;
};

const main = async (): Promise<void> => {
	const requireDeno = process.argv.includes("--require-deno");
	const manifest = readManifest(join(packageRoot, "package.json"));
	const jsr = readJsrManifest(join(packageRoot, "jsr.json"));

	check(
		jsr.name === manifest.name,
		`jsr.json publishes ${jsr.name} but package.json declares ${manifest.name}`,
	);
	check(
		jsr.version === manifest.version,
		`jsr.json is at ${jsr.version} but package.json is at ${manifest.version}`,
	);

	const include = jsr.publish?.include ?? [];
	const isIncluded = (file: string): boolean =>
		include.some((pattern) => matchesGlob(file.replace(/^\.\//, ""), pattern));

	check(typeof jsr.exports["."] === "string", "jsr.json must export a module entry");
	check(typeof jsr.exports["./cli"] === "string", "jsr.json must export a cli entry");

	const moduleEntry = resolve(packageRoot, jsr.exports["."] ?? "");
	const cliEntry = resolve(packageRoot, jsr.exports["./cli"] ?? "");
	check(existsSync(moduleEntry), `the JSR module entry ${jsr.exports["."]} is missing`);
	check(existsSync(cliEntry), `the JSR CLI entry ${jsr.exports["./cli"]} is missing`);
	check(
		isIncluded(jsr.exports["."] ?? ""),
		`${jsr.exports["."]} is not covered by jsr.json publish.include`,
	);
	check(
		isIncluded(jsr.exports["./cli"] ?? ""),
		`${jsr.exports["./cli"]} is not covered by jsr.json publish.include`,
	);

	const deno = findDeno();
	check(!requireDeno || deno !== undefined, "deno is required but was not found");

	const runtimes: Runtime[] = [
		{ name: "node", command: process.execPath },
		...(deno ? [{ name: "deno", command: deno }] : []),
	];

	// The fixtures live inside the package so that Deno resolves the bare npm
	// specifiers of the JSR entries from this package manifest.
	const workDir = await mkdtemp(join(packageRoot, ".jsr-smoke-"));
	try {
		const moduleUrl = pathToFileURL(moduleEntry).href;
		for (const runtime of runtimes) {
			const configPath = join(workDir, `cssforge.${runtime.name}.config.ts`);
			const cssOutput = join(workDir, `output.${runtime.name}.css`);
			await writeFile(
				configPath,
				`import { defineConfig } from "${moduleUrl}";

export default defineConfig({
	spacing: { custom: { size: { value: { 2: "0.5rem" } } } },
});
`,
				"utf8",
			);

			runEntry(
				runtime,
				cliEntry,
				["--config", configPath, "--mode", "css", "--css", cssOutput],
				workDir,
			);
			const css = await readFile(cssOutput, "utf8");
			check(
				css.includes("--spacing-size-2: 0.5rem;"),
				`the JSR CLI entry did not generate the expected CSS with ${runtime.name}`,
			);

			const moduleCheck = join(workDir, `module-check.${runtime.name}.mjs`);
			await writeFile(
				moduleCheck,
				`const mod = await import(${JSON.stringify(moduleUrl)});

for (const name of ["defineConfig", "generateCSS", "generateStyleDictionaryJSON"]) {
	if (typeof mod[name] !== "function") {
		throw new Error(\`the JSR module entry does not export \${name}()\`);
	}
}

const css = mod.generateCSS(
	mod.defineConfig({ spacing: { custom: { size: { value: { 2: "0.5rem" } } } } }),
);

if (!css.includes("--spacing-size-2")) {
	throw new Error("the JSR module entry did not generate the expected CSS");
}
`,
				"utf8",
			);
			runEntry(runtime, moduleCheck, [], workDir);
		}

		const checked = runtimes.map((runtime) => runtime.name).join(" and ");
		console.log(
			`jsr smoke test: ${jsr.name}@${jsr.version} entries ${jsr.exports["."]} and ${jsr.exports["./cli"]} verified with ${checked}`,
		);
	} finally {
		await rm(workDir, { recursive: true, force: true });
	}
};

await main();
