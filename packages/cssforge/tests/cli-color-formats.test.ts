import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build, parseColorFormats } from "../src/cli.ts";
import { assert, assertEquals, assertThrows, Deno } from "./vitest-compat.ts";

const configSource = `export default {
	colors: {
		palette: {
			value: { coral: { 100: { hex: "#FF7F50" } } },
		},
	},
};`;

interface BuildPaths {
	config: string;
	css: string;
	json: string;
	ts: string;
	styleDictionary: string;
}

const pathsIn = (tempDir: string): BuildPaths => ({
	config: join(tempDir, "cssforge.config.ts"),
	css: join(tempDir, "output.css"),
	json: join(tempDir, "output.json"),
	ts: join(tempDir, "output.ts"),
	styleDictionary: join(tempDir, "tokens.sd.json"),
});

const buildWithFormats = (paths: BuildPaths, colorFormats: unknown) =>
	build({
		config: paths.config,
		mode: "all",
		cssOutput: paths.css,
		jsonOutput: paths.json,
		tsOutput: paths.ts,
		styleDictionaryOutput: paths.styleDictionary,
		colorFormats: colorFormats as never,
	});

Deno.test("parseColorFormats - reads a comma separated list and drops duplicates", () => {
	assertEquals(parseColorFormats(undefined), undefined);
	assertEquals(parseColorFormats(""), []);
	assertEquals(parseColorFormats("hex, rgb"), ["hex", "rgb"]);
	assertEquals(parseColorFormats("rgb,hex,rgb"), ["rgb", "hex"]);
});

Deno.test("parseColorFormats - rejects a format the generator cannot emit", () => {
	const error = assertThrows(() => parseColorFormats("hex,hsl"));

	assert(
		error.message.includes("hsl") && error.message.includes("hex"),
		`Expected the error to name the rejected value and the accepted formats. Received: ${error.message}`,
	);
});

Deno.test("build - --color-formats adds the formats to every output", async () => {
	const tempDir = await mkdtemp(join(tmpdir(), "cssforge-color-formats-"));

	try {
		const paths = pathsIn(tempDir);
		await writeFile(paths.config, configSource, "utf8");

		const result = await buildWithFormats(paths, parseColorFormats("hex,rgb"));

		assertEquals(result.success, true);

		const css = await readFile(paths.css, "utf8");
		const json = JSON.parse(await readFile(paths.json, "utf8"));
		const ts = await readFile(paths.ts, "utf8");
		const styleDictionary = JSON.parse(await readFile(paths.styleDictionary, "utf8"));

		assertEquals(css.includes("--palette-coral-100: #ff7f50;"), true);
		assertEquals(json.palette.coral["100"].color, {
			hex: "#ff7f50",
			rgb: "rgb(255 127 80)",
		});
		assertEquals(ts.includes('"rgb": "rgb(255 127 80)"'), true);
		assertEquals(styleDictionary.palette.coral["100"].$color, {
			hex: "#ff7f50",
			rgb: "rgb(255 127 80)",
		});
	} finally {
		await rm(tempDir, { recursive: true, force: true });
	}
});

Deno.test("build - rejects an unknown color format for JavaScript callers", async () => {
	const tempDir = await mkdtemp(join(tmpdir(), "cssforge-color-formats-invalid-"));

	try {
		const paths = pathsIn(tempDir);
		await writeFile(paths.config, configSource, "utf8");

		const result = await buildWithFormats(paths, ["hsl"]);

		assertEquals(result.success, false);
		const message =
			result.error instanceof Error ? result.error.message : String(result.error);
		assertEquals(message.includes("hsl"), true);
	} finally {
		await rm(tempDir, { recursive: true, force: true });
	}
});
