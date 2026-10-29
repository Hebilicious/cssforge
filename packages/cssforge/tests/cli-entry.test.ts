import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { childEnv } from "./helpers.ts";

test("cli - runs when the entry point is invoked through a symlink", async () => {
	const tempDir = await mkdtemp(join(tmpdir(), "cssforge-cli-entry-"));

	try {
		const cliPath = fileURLToPath(new URL("../src/cli.ts", import.meta.url));
		const linkedCliPath = join(tempDir, "cssforge");
		const configPath = join(tempDir, "cssforge.config.ts");
		const cssOutput = join(tempDir, "output.css");
		await symlink(cliPath, linkedCliPath);
		await writeFile(
			configPath,
			`export default {
				spacing: {
					custom: {
						size: {
							value: {
								2: "0.5rem",
							},
						},
					},
				},
			};`,
			"utf8",
		);

		const help = spawnSync(process.execPath, [linkedCliPath, "--help"], {
			cwd: tempDir,
			encoding: "utf8",
			env: childEnv,
		});

		expect(help.status).toEqual(0);
		expect(help.stdout.includes("USAGE")).toEqual(true);

		const generate = spawnSync(
			process.execPath,
			[linkedCliPath, "--config", configPath, "--mode", "css", "--css", cssOutput],
			{ cwd: tempDir, encoding: "utf8", env: childEnv },
		);

		expect(generate.status).toEqual(0);
		expect(generate.stderr).toEqual("");
		expect(existsSync(cssOutput)).toEqual(true);
		expect((await readFile(cssOutput, "utf8")).includes("--spacing-size-2")).toEqual(
			true,
		);
	} finally {
		await rm(tempDir, { recursive: true, force: true });
	}
});
