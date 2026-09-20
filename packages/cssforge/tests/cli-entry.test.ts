import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { assertEquals, Deno } from "./vitest-compat.ts";

// citty prints usage through consola, which silences log output in test
// environments (`TEST` and `NODE_ENV=test`, both set by vitest). Consumers run
// the CLI from a shell, so the child process gets a non-test environment.
const childEnv = { ...process.env };
delete childEnv.TEST;
delete childEnv.NODE_ENV;

Deno.test("cli - runs when the entry point is invoked through a symlink", async () => {
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

		assertEquals(help.status, 0);
		assertEquals(help.stdout.includes("USAGE"), true);

		const generate = spawnSync(
			process.execPath,
			[linkedCliPath, "--config", configPath, "--mode", "css", "--css", cssOutput],
			{ cwd: tempDir, encoding: "utf8", env: childEnv },
		);

		assertEquals(generate.status, 0);
		assertEquals(generate.stderr, "");
		assertEquals(existsSync(cssOutput), true);
		assertEquals((await readFile(cssOutput, "utf8")).includes("--spacing-size-2"), true);
	} finally {
		await rm(tempDir, { recursive: true, force: true });
	}
});
