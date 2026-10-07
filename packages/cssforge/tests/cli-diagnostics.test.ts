import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { childEnv } from "./helpers.ts";
import { assert, assertEquals, Deno } from "./vitest-compat.ts";

const cliPath = fileURLToPath(new URL("../src/cli.ts", import.meta.url));

const configSource = `export default {
	typography: {
		fluid: {
			body: {
				value: {
					minWidth: 320,
					maxWidth: 1280,
					minFontSize: 10,
					maxFontSize: 16,
					minTypeScale: 1,
					maxTypeScale: 1,
					positiveSteps: 0,
					negativeSteps: 0,
				},
			},
		},
	},
};`;

Deno.test("cli - prints a build warning to stderr and still writes the output", async () => {
	const tempDir = await mkdtemp(join(tmpdir(), "cssforge-diagnostics-cli-"));

	try {
		const configPath = join(tempDir, "cssforge.config.ts");
		const cssPath = join(tempDir, "output.css");
		await writeFile(configPath, configSource, "utf8");

		const result = spawnSync(
			process.execPath,
			[cliPath, "--config", configPath, "--mode", "css", "--css", cssPath],
			{ cwd: tempDir, encoding: "utf8", env: childEnv },
		);

		assertEquals(result.status, 0, result.stderr);
		const warnings = result.stderr
			.split("\n")
			.filter((line) => line.startsWith("cssforge: warning: "));
		assertEquals(warnings.length, 1, result.stderr);
		assert(warnings[0]?.includes("typography_fluid.body@m"), warnings[0]);
		assert(
			(await readFile(cssPath, "utf8")).includes("--typography_fluid-body-m:"),
			"Expected the CSS output to be written",
		);
	} finally {
		await rm(tempDir, { recursive: true, force: true });
	}
});
