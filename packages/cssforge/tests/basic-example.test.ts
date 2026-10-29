import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import * as basicExampleModule from "../../../example/basic/cssforge.config.ts";
import type { CSSForgeConfig } from "../src/mod.ts";
import { generateCSS } from "../src/mod.ts";

// `example/basic` is excluded from the Moon workspace, so its stylesheet and
// markup are only observable as files.
const exampleFile = (name: string) =>
	fileURLToPath(new URL(`../../../example/basic/${name}`, import.meta.url));

// No `package.json` there, so TypeScript types the configuration as CommonJS
// while Vitest resolves the default export.
const basicExampleConfig = basicExampleModule.default as Partial<CSSForgeConfig>;

const declaredProperties = (css: string): Set<string> =>
	new Set([...css.matchAll(/(?<![\w-])(--[\w-]+)\s*:/g)].map((match) => match[1]));

const consumedProperties = (source: string): Set<string> =>
	new Set([...source.matchAll(/var\(\s*(--[\w-]+)\s*[,)]/g)].map((match) => match[1]));

const importedStylesheets = (css: string): string[] =>
	[...css.matchAll(/@import\s+["']([^"']+)["']/g)].map((match) => match[1]);

test("example/basic consumes only custom properties its configuration generates", async () => {
	const declared = declaredProperties(generateCSS(basicExampleConfig));
	const consumed = new Set([
		...consumedProperties(await readFile(exampleFile("index.html"), "utf8")),
		...consumedProperties(await readFile(exampleFile("main.css"), "utf8")),
	]);

	const undeclared = [...consumed].filter((name) => !declared.has(name)).sort();

	expect(
		undeclared,
		`example/basic consumes custom properties its configuration never generates: ${undeclared.join(", ")}`,
	).toEqual([]);
});

test("example/basic imports the generated stylesheet from the CLI default output path", async () => {
	const imports = importedStylesheets(await readFile(exampleFile("main.css"), "utf8"));

	expect(
		imports.includes("./.cssforge/output.css"),
		`example/basic/main.css must import "./.cssforge/output.css", got: ${imports.join(", ")}`,
	).toBeTruthy();
});
