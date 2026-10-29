/**
 * Smoke test for the secondary JSR channel.
 *
 * JSR publishes the TypeScript source declared in `jsr.json`, not `dist`, so
 * this verifies that those entry points stay publishable and executable: the
 * declared exports exist, the manifest versions agree, and both the module
 * entry and the CLI entry generate output when Node runs those sources.
 *
 * Node resolves the bare imports of those sources from `node_modules`, so the
 * `imports` map that JSR publishes with is checked against the runtime
 * dependencies in `package.json` instead.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, matchesGlob, resolve } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

type JsrManifest = {
	name: string;
	version: string;
	exports: Record<string, string>;
	imports: Record<string, string>;
	publish?: { include?: string[] };
};

type PackageManifest = {
	name: string;
	version: string;
	dependencies: Record<string, string>;
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

const readStringRecord = (value: unknown, path: string, field: string) => {
	const record = value ?? {};
	check(isRecord(record), `${path} "${field}" must be an object`);
	const entries = Object.entries(record);
	check(
		entries.every((entry) => typeof entry[1] === "string"),
		`${path} "${field}" must map names to strings`,
	);

	return Object.fromEntries(entries) as Record<string, string>;
};

/** Reads a manifest and validates the fields this script relies on. */
const readManifest = (path: string): PackageManifest => {
	const parsed = parseJsonFile(path);
	check(
		typeof parsed.name === "string" && typeof parsed.version === "string",
		`${path} must declare "name" and "version"`,
	);

	return {
		name: parsed.name,
		version: parsed.version,
		dependencies: readStringRecord(parsed.dependencies, path, "dependencies"),
	};
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
		imports: readStringRecord(parsed.imports, path, "imports"),
		publish: { include },
	};
};

const runEntry = (entry: string, args: string[], cwd: string): string => {
	const result = spawnSync(process.execPath, [entry, ...args], {
		cwd,
		encoding: "utf8",
		env: { ...process.env, TEST: undefined, NODE_ENV: undefined },
	});
	if (result.error) {
		throw new Error(`node could not start: ${result.error.message}`);
	}
	if (result.status !== 0) {
		throw new Error(
			`node ${entry} ${args.join(" ")} exited with code ${result.status}\n` +
				`stdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
		);
	}

	return result.stdout;
};

const main = async (): Promise<void> => {
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

	for (const [name, version] of Object.entries(manifest.dependencies)) {
		const expected = `npm:${name}@${version}`;
		check(
			jsr.imports[name] === expected,
			`jsr.json imports ${name} as ${jsr.imports[name] ?? "nothing"} but package.json depends on ${expected}`,
		);
	}

	const workDir = await mkdtemp(join(tmpdir(), "cssforge-jsr-smoke-"));
	try {
		const moduleUrl = pathToFileURL(moduleEntry).href;
		const configPath = join(workDir, "cssforge.config.ts");
		const cssOutput = join(workDir, "output.css");
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
			cliEntry,
			["--config", configPath, "--mode", "css", "--css", cssOutput],
			workDir,
		);
		const css = await readFile(cssOutput, "utf8");
		check(
			css.includes("--spacing-size-2: 0.5rem;"),
			"the JSR CLI entry did not generate the expected CSS",
		);

		// JSR ships sources, so the CLI metadata there comes from the
		// generated `src/version.ts` rather than from the build.
		const reported = runEntry(cliEntry, ["--version"], workDir).trim();
		check(
			reported === manifest.version,
			`the JSR CLI entry reports ${reported} but package.json is at ${manifest.version}`,
		);

		const moduleCheck = join(workDir, "module-check.mjs");
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
		runEntry(moduleCheck, [], workDir);
		console.log(
			`jsr smoke test: ${jsr.name}@${jsr.version} entries ${jsr.exports["."]} and ${jsr.exports["./cli"]} verified with node`,
		);
	} finally {
		await rm(workDir, { recursive: true, force: true });
	}
};

await main();
