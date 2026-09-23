/**
 * Publishes the plugin to npm.
 *
 * The release workflow enables trusted publishing (OIDC) through
 * `id-token: write`, and the registry generates provenance during the same
 * exchange. A version that is already published is skipped instead of
 * republished, so a failed or retried release run never fails on a version the
 * registry already has.
 *
 * Usage: node ./scripts/publish.ts [--dry-run]
 */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import process from "node:process";

interface PackageManifest {
	name: string;
	version: string;
}

const packageRoot = resolve(import.meta.dirname, "..");

/** Every entry point the published package must contain. */
const requiredArtifacts = [
	"dist/index.js",
	"dist/index.cjs",
	"dist/index.d.ts",
	"dist/vite.js",
	"dist/webpack.cjs",
	"client.d.ts",
];

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null;

const readManifest = (): PackageManifest => {
	const path = join(packageRoot, "package.json");
	const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));

	if (
		!isRecord(parsed) ||
		typeof parsed.name !== "string" ||
		typeof parsed.version !== "string"
	) {
		throw new Error(`${path} must declare "name" and "version"`);
	}

	return { name: parsed.name, version: parsed.version };
};

const isPublished = async (name: string, version: string): Promise<boolean> => {
	const response = await fetch(
		`https://registry.npmjs.org/${encodeURIComponent(name)}/${version}`,
	);

	if (response.status === 404) {
		return false;
	}
	if (!response.ok) {
		throw new Error(`npm registry returned ${response.status} for ${name}@${version}`);
	}

	return true;
};

const run = (command: string, args: string[], dryRun: boolean): void => {
	console.log(`${dryRun ? "would run" : "running"}: ${command} ${args.join(" ")}`);
	if (dryRun && command !== "pnpm") {
		return;
	}

	const result = spawnSync(command, args, { cwd: packageRoot, stdio: "inherit" });

	if (result.error) {
		throw new Error(`${command} could not start: ${result.error.message}`);
	}
	if (result.status !== 0) {
		throw new Error(`${command} ${args.join(" ")} exited with code ${result.status}`);
	}
};

/**
 * Packs the package into a tarball and returns its path.
 *
 * `pnpm pack` rewrites the `workspace:` dependency ranges the manifest uses into
 * the versions consumers resolve, which `npm publish` on its own would publish
 * verbatim.
 */
const pack = (version: string): string => {
	run("pnpm", ["pack"], false);

	const tarball = readdirSync(packageRoot).find(
		(name) => name.endsWith(`-${version}.tgz`) && !name.startsWith("."),
	);
	if (!tarball) {
		throw new Error(`pnpm pack did not produce a tarball for version ${version}`);
	}

	return join(packageRoot, tarball);
};

/**
 * Publishes with retries. A registry can report a failure after accepting the
 * upload, so the registry is checked again before deciding to retry.
 */
const publishWithRetry = async (
	name: string,
	version: string,
	tarball: string,
	dryRun: boolean,
	attempts = 3,
): Promise<void> => {
	for (let attempt = 1; attempt <= attempts; attempt++) {
		try {
			run("npm", ["publish", tarball], dryRun);
			return;
		} catch (error) {
			if (dryRun || (await isPublished(name, version))) {
				return;
			}
			if (attempt === attempts) {
				throw error;
			}

			const delay = attempt * 10_000;
			console.log(
				`publish attempt ${attempt} failed, retrying in ${delay / 1000}s: ${(error as Error).message.split("\n")[0]}`,
			);
			await new Promise((resolveDelay) => setTimeout(resolveDelay, delay));
		}
	}
};

const main = async (): Promise<void> => {
	const dryRun = process.argv.includes("--dry-run");
	const manifest = readManifest();
	console.log(`npm: ${manifest.name}@${manifest.version}${dryRun ? " (dry run)" : ""}`);

	for (const artifact of requiredArtifacts) {
		if (!existsSync(join(packageRoot, artifact))) {
			throw new Error(`${artifact} is missing, build the package before publishing`);
		}
	}

	if (await isPublished(manifest.name, manifest.version)) {
		console.log(
			`npm: ${manifest.name}@${manifest.version} is already published, skipping`,
		);
		return;
	}

	const tarball = pack(manifest.version);
	await publishWithRetry(manifest.name, manifest.version, tarball, dryRun);

	if (!dryRun) {
		console.log(`npm: published ${manifest.name}@${manifest.version}`);
	}
};

await main();
