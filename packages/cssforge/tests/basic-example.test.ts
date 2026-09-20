import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import * as basicExampleModule from "../../../example/basic/cssforge.config.ts";
import type { CSSForgeConfig } from "../src/mod.ts";
import { generateCSS } from "../src/mod.ts";
import { assert, assertEquals, Deno } from "./vitest-compat.ts";

/**
 * `example/basic` is excluded from the Moon workspace, so its stylesheet and
 * markup are only observable as files next to its configuration.
 */
const exampleFile = (name: string) =>
	fileURLToPath(new URL(`../../../example/basic/${name}`, import.meta.url));

/**
 * `example/basic` has no `package.json`, so TypeScript types its configuration
 * as a CommonJS module while Vitest transforms it as ESM and resolves the
 * default export. The declared properties the test asserts below fail loudly if
 * that interop ever stops yielding the configuration.
 */
const basicExampleConfig = basicExampleModule.default as Partial<CSSForgeConfig>;

/** A custom property declaration: the name followed by its colon. */
const declaredProperties = (css: string): Set<string> =>
	new Set([...css.matchAll(/(?<![\w-])(--[\w-]+)\s*:/g)].map((match) => match[1]));

/** A custom property consumption: the complete name inside `var(...)`. */
const consumedProperties = (source: string): Set<string> =>
	new Set([...source.matchAll(/var\(\s*(--[\w-]+)\s*[,)]/g)].map((match) => match[1]));

const importedStylesheets = (css: string): string[] =>
	[...css.matchAll(/@import\s+["']([^"']+)["']/g)].map((match) => match[1]);

Deno.test("example/basic consumes only custom properties its configuration generates", async () => {
	const declared = declaredProperties(generateCSS(basicExampleConfig));
	const consumed = new Set([
		...consumedProperties(await readFile(exampleFile("index.html"), "utf8")),
		...consumedProperties(await readFile(exampleFile("main.css"), "utf8")),
	]);

	const undeclared = [...consumed].filter((name) => !declared.has(name)).sort();

	assertEquals(
		undeclared,
		[],
		`example/basic consumes custom properties its configuration never generates: ${undeclared.join(", ")}`,
	);
});

Deno.test("example/basic imports the generated stylesheet from the CLI default output path", async () => {
	const imports = importedStylesheets(await readFile(exampleFile("main.css"), "utf8"));

	assert(
		imports.includes("./.cssforge/output.css"),
		`example/basic/main.css must import "./.cssforge/output.css", got: ${imports.join(", ")}`,
	);
});
