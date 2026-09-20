/**
 * Publishes the built package to one distribution channel.
 *
 * npm is the primary channel and is published with trusted publishing (OIDC),
 * which the release workflow enables through `id-token: write`. JSR stays
 * available as the secondary channel for Deno users.
 *
 * A version that is already on the channel is skipped instead of republished,
 * so a failed or retried release run never fails on an already-published npm
 * version.
 *
 * Usage: node ./scripts/publish.ts <npm|jsr> [--dry-run]
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import process from "node:process";

type Channel = "npm" | "jsr";

type PackageManifest = {
	name: string;
	version: string;
};

const packageRoot = resolve(import.meta.dirname, "..");
const requiredArtifacts = ["dist/mod.js", "dist/mod.d.ts", "dist/cli.js"];

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

const isNpmVersionPublished = async (name: string, version: string): Promise<boolean> => {
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

const isJsrVersionPublished = async (name: string, version: string): Promise<boolean> => {
	const response = await fetch(`https://jsr.io/${name}/meta.json`);
	if (response.status === 404) {
		return false;
	}
	if (!response.ok) {
		throw new Error(`JSR registry returned ${response.status} for ${name}`);
	}
	const meta = (await response.json()) as { versions?: Record<string, unknown> };

	return Object.keys(meta.versions ?? {}).includes(version);
};

const run = (command: string, args: string[], dryRun: boolean): void => {
	console.log(`${dryRun ? "would run" : "running"}: ${command} ${args.join(" ")}`);
	if (dryRun) {
		return;
	}
	const result = spawnSync(command, args, {
		cwd: packageRoot,
		stdio: "inherit",
	});
	if (result.error) {
		throw new Error(`${command} could not start: ${result.error.message}`);
	}
	if (result.status !== 0) {
		throw new Error(`${command} ${args.join(" ")} exited with code ${result.status}`);
	}
};

const capture = (command: string, args: string[]): string => {
	const result = spawnSync(command, args, {
		cwd: packageRoot,
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
 * A published JSR entry point that fails to run is silent, so the release has to
 * observe real output. The minimum dependency age is disabled because the
 * version was published seconds ago.
 */
const verifyJsrChannel = (manifest: PackageManifest): void => {
	const specifier = `jsr:${manifest.name}@${manifest.version}`;
	const help = capture("deno", [
		"run",
		"-A",
		"--no-lock",
		"--minimum-dependency-age=0",
		`${specifier}/cli`,
		"--help",
	]);
	if (!help.includes("USAGE")) {
		throw new Error(`${specifier}/cli did not print its usage`);
	}

	const moduleCheck = [
		`const mod = await import(${JSON.stringify(specifier)});`,
		`const css = mod.generateCSS(mod.defineConfig({ spacing: { custom: { size: { value: { 2: "0.5rem" } } } } }));`,
		`if (!css.includes("--spacing-size-2")) {`,
		`	throw new Error("the published JSR module entry did not generate the expected CSS");`,
		`}`,
		`console.log("module entry ok");`,
	].join("\n");
	const result = capture("deno", [
		"eval",
		"--no-lock",
		"--minimum-dependency-age=0",
		moduleCheck,
	]);
	if (!result.includes("module entry ok")) {
		throw new Error(`${specifier} did not import cleanly: ${result}`);
	}
};

const verifyWithRetry = async (verify: () => void, attempts = 3): Promise<void> => {
	for (let attempt = 1; attempt <= attempts; attempt++) {
		try {
			verify();
			return;
		} catch (error) {
			if (attempt === attempts) {
				throw error;
			}
			console.log(
				`jsr: verification attempt ${attempt} failed, retrying in 5s: ${(error as Error).message}`,
			);
			await new Promise((resolve) => setTimeout(resolve, 5000));
		}
	}
};

/**
 * Publishes with retries. A registry can report a failure after accepting the
 * upload, so the registry is checked again before deciding to retry, and a
 * channel that already has the version never publishes twice.
 */
const publishWithRetry = async (
	command: string[],
	dryRun: boolean,
	isPublished: () => Promise<boolean>,
	attempts = 3,
): Promise<void> => {
	const [executable, ...args] = command;
	for (let attempt = 1; attempt <= attempts; attempt++) {
		try {
			run(executable, args, dryRun);
			return;
		} catch (error) {
			if (dryRun || (await isPublished())) {
				return;
			}
			if (attempt === attempts) {
				throw error;
			}
			const delay = attempt * 10_000;
			console.log(
				`publish attempt ${attempt} failed, retrying in ${delay / 1000}s: ${(error as Error).message.split("\n")[0]}`,
			);
			await new Promise((resolve) => setTimeout(resolve, delay));
		}
	}
};

const main = async (): Promise<void> => {
	const channel = process.argv[2];
	const dryRun = process.argv.includes("--dry-run");
	if (channel !== "npm" && channel !== "jsr") {
		throw new Error(`unknown channel "${channel ?? ""}", expected npm or jsr`);
	}

	const manifest = readManifest();
	console.log(
		`${channel}: ${manifest.name}@${manifest.version}${dryRun ? " (dry run)" : ""}`,
	);

	for (const artifact of requiredArtifacts) {
		if (!existsSync(join(packageRoot, artifact))) {
			throw new Error(`${artifact} is missing, build the package before publishing`);
		}
	}

	const isPublished: Record<Channel, () => Promise<boolean>> = {
		npm: () => isNpmVersionPublished(manifest.name, manifest.version),
		jsr: () => isJsrVersionPublished(manifest.name, manifest.version),
	};
	const publishCommand: Record<Channel, string[]> = {
		// Trusted publishing supplies the OIDC credential, and the registry
		// generates provenance during the same exchange.
		npm: ["npm", "publish"],
		jsr: ["npx", "jsr", "publish"],
	};

	const checkPublished = isPublished[channel];
	const alreadyPublished = await checkPublished();
	if (alreadyPublished) {
		console.log(
			`${channel}: ${manifest.name}@${manifest.version} is already published, skipping`,
		);
	} else {
		await publishWithRetry(publishCommand[channel], dryRun, checkPublished);
	}

	if (channel === "jsr" && !dryRun) {
		// Verify either way: a retried run re-checks the published artifact
		// instead of republishing it.
		await verifyWithRetry(() => verifyJsrChannel(manifest));
		console.log(`${channel}: verified ${manifest.name}@${manifest.version}`);
	}

	if (!dryRun) {
		console.log(
			`${channel}: ${alreadyPublished ? "already published" : "published"} ${manifest.name}@${manifest.version}`,
		);
	}
};

await main();
