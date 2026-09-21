/**
 * Builds the package with the generated release metadata left untouched.
 *
 * The build used to synchronise `src/version.ts` and `jsr.json` from
 * `package.json` before bundling. That made the build a writer of release
 * metadata, which is exactly what the CI consistency gate exists to police:
 * `moon ci` runs tasks concurrently, so a build could repair `src/version.ts`
 * while `cssforge:version-check` was reading it and a drifting commit would be
 * accepted or rejected depending on scheduling.
 *
 * Building from the committed generated module removes that race. A release
 * always regenerates the metadata first (`moon run root:version`, which runs
 * `changeset version` and `cssforge:version-sync`), so what the build reads is
 * what the release published. `moon run cssforge:version-check` fails loudly
 * when the committed metadata disagrees, instead of a build silently fixing it.
 *
 * `--out-dir` is forwarded to tsup so a caller that must not touch the declared
 * `dist` output (a test, for example) can build somewhere else.
 *
 * Usage: node ./scripts/build.ts [--out-dir <path>]
 */
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import process from "node:process";

const packageRoot = resolve(import.meta.dirname, "..");

const main = (): void => {
	const outDirIndex = process.argv.indexOf("--out-dir");
	const outDir = outDirIndex === -1 ? undefined : process.argv[outDirIndex + 1];
	if (outDirIndex !== -1 && !outDir) {
		throw new Error("--out-dir requires a path");
	}

	const result = spawnSync("npx", ["tsup", ...(outDir ? ["--out-dir", outDir] : [])], {
		cwd: packageRoot,
		stdio: "inherit",
	});
	if (result.error) {
		throw new Error(`npx tsup could not start: ${result.error.message}`);
	}
	if (result.status !== 0) {
		throw new Error(`npx tsup exited with code ${result.status}`);
	}
};

main();
