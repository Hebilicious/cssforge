import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { childEnv } from "./helpers.ts";
import { assertEquals, Deno } from "./vitest-compat.ts";

const cliPath = fileURLToPath(new URL("../src/cli.ts", import.meta.url));

/** A root alias whose only source is emitted under `.Another`. */
const scopedSourceConfig = `export default {
	colors: {
		palette: {
			value: {
				another: {
					value: { yellow: { hex: "#FFFF00" } },
					settings: { selector: ".Another" },
				},
			},
		},
		theme: {
			dark: {
				value: {
					background: {
						value: { primary: "var(--1)" },
						variables: { 1: "palette.another.yellow" },
						settings: { variantNameOnly: true },
					},
				},
				settings: { atRule: "@media (prefers-color-scheme: dark)" },
			},
		},
	},
};`;

/** The documented arrangement: the palette and the alias share the root element. */
const documentedConfig = scopedSourceConfig.replace(
	'selector: ".Another"',
	'selector: ":root.Another"',
);

const runCli = (args: string[], cwd: string) =>
	spawnSync(process.execPath, [cliPath, ...args], {
		cwd,
		encoding: "utf8",
		env: childEnv,
	});

const withConfig = async (
	configSource: string,
	run: (paths: { config: string; css: string; dir: string }) => void,
) => {
	const dir = await mkdtemp(join(tmpdir(), "cssforge-diagnostics-"));
	const config = join(dir, "cssforge.config.ts");
	const css = join(dir, "output.css");
	await writeFile(config, configSource, "utf8");

	try {
		run({ config, css, dir });
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
};

Deno.test("cli - scope diagnostics are printed while generation still succeeds", async () => {
	await withConfig(scopedSourceConfig, ({ config, css, dir }) => {
		const result = runCli(["--config", config, "--mode", "css", "--css", css], dir);

		assertEquals(result.status, 0, result.stderr);
		assertEquals(result.stderr.includes("cssforge: warning:"), true, result.stderr);
		assertEquals(
			result.stderr.includes("theme.dark.background.primary"),
			true,
			result.stderr,
		);
		assertEquals(result.stderr.includes("palette.another.yellow"), true, result.stderr);
		assertEquals(existsSync(css), true);
	});
});

Deno.test("cli - strict mode fails the build before writing outputs", async () => {
	await withConfig(scopedSourceConfig, ({ config, css, dir }) => {
		const result = runCli(
			["--config", config, "--mode", "css", "--css", css, "--strict"],
			dir,
		);

		assertEquals(result.status, 1, result.stdout);
		assertEquals(result.stderr.includes("strict mode"), true, result.stderr);
		assertEquals(existsSync(css), false);
	});
});

Deno.test("cli - a configuration without scope diagnostics stays quiet", async () => {
	await withConfig(documentedConfig, ({ config, css, dir }) => {
		const result = runCli(["--config", config, "--mode", "css", "--css", css], dir);

		assertEquals(result.status, 0, result.stderr);
		assertEquals(result.stderr.includes("cssforge: warning:"), false, result.stderr);
		assertEquals(existsSync(css), true);
	});
});
