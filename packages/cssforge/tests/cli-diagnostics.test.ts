import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { childEnv } from "./helpers.ts";

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

test("cli - prints a build warning to stderr and still writes the output", async () => {
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

		expect(result.status, result.stderr).toEqual(0);
		const warnings = result.stderr
			.split("\n")
			.filter((line) => line.startsWith("cssforge: warning: "));
		expect(warnings.length, result.stderr).toEqual(1);
		expect(warnings[0]?.includes("typography_fluid.body@m"), warnings[0]).toBeTruthy();
		expect(
			(await readFile(cssPath, "utf8")).includes("--typography_fluid-body-m:"),
			"Expected the CSS output to be written",
		).toBeTruthy();
	} finally {
		await rm(tempDir, { recursive: true, force: true });
	}
});
