import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build } from "../src/cli.ts";
import { assertEquals, Deno } from "./vitest-compat.ts";

const configSource = `export default {
	spacing: {
		custom: { size: { value: { 2: "8px" } } },
	},
};`;

// A JavaScript caller is not protected by the `BuildOptions` type cast, so the
// runtime check inside `build()` is the only thing rejecting an unsupported mode.
const callWithMode = (mode: unknown, paths: Record<string, string>) =>
	build({
		config: paths.config!,
		mode: mode as never,
		cssOutput: paths.css!,
		jsonOutput: paths.json!,
		tsOutput: paths.ts!,
	});

Deno.test("build - rejects an unsupported output mode for JavaScript callers", async () => {
	const tempDir = await mkdtemp(join(tmpdir(), "cssforge-build-invalid-mode-"));

	try {
		const paths = {
			config: join(tempDir, "cssforge.config.ts"),
			css: join(tempDir, "output.css"),
			json: join(tempDir, "output.json"),
			ts: join(tempDir, "output.ts"),
		};
		await writeFile(paths.config, configSource, "utf8");
		await writeFile(paths.css, "/* pre-existing css */", "utf8");

		const result = await callWithMode("typo", paths);

		assertEquals(result.success, false);
		const message =
			result.error instanceof Error ? result.error.message : String(result.error);
		assertEquals(message.includes("typo"), true);
		for (const mode of ["css", "json", "ts", "style-dictionary", "all"]) {
			assertEquals(message.includes(mode), true);
		}
		assertEquals(await readFile(paths.css, "utf8"), "/* pre-existing css */");
		assertEquals(existsSync(paths.json), false);
		assertEquals(existsSync(paths.ts), false);
	} finally {
		await rm(tempDir, { recursive: true, force: true });
	}
});

Deno.test("build - accepts every supported output mode", async () => {
	const tempDir = await mkdtemp(join(tmpdir(), "cssforge-build-valid-modes-"));

	try {
		const expectedOutputs: Record<string, readonly string[]> = {
			css: ["css"],
			json: ["json"],
			ts: ["ts"],
			"style-dictionary": [],
			all: ["css", "json", "ts"],
		};

		for (const [mode, produced] of Object.entries(expectedOutputs)) {
			const paths = {
				config: join(tempDir, `${mode}.config.ts`),
				css: join(tempDir, `${mode}.css`),
				json: join(tempDir, `${mode}.json`),
				ts: join(tempDir, `${mode}.ts`),
			};
			await writeFile(paths.config, configSource, "utf8");

			const result = await callWithMode(mode, paths);

			assertEquals(result.success, true, `mode ${mode} should succeed`);
			assertEquals(existsSync(paths.css), produced.includes("css"));
			assertEquals(existsSync(paths.json), produced.includes("json"));
			assertEquals(existsSync(paths.ts), produced.includes("ts"));
		}
	} finally {
		await rm(tempDir, { recursive: true, force: true });
	}
});
