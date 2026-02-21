/**
 * Script to parse README.md and generate documentation within delimiters.
 *
 * Delimiters:
 *  startDefinition: <!-- md:generate defineConfig
 *  startCode: -->
 *  end: <!-- /md:generate -->
 */

import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { md } from "mdbox";
import type { CSSForgeConfig } from "../src/config.ts";
import { generateCSS } from "../src/generator.ts";

const PACKAGE_ROOT = process.cwd();
const README_PATH = resolve(PACKAGE_ROOT, "../../README.md");

const START_DEFINITION = "<!-- md:generate defineConfig";
const START_CODE = "-->";
const END_BLOCK = "<!-- /md:generate -->";

function buildReplacement(tsSource: string, css: string): string {
	const tsBlock = md.codeBlock(tsSource.trim(), "typescript");
	const cssBlock = md.codeBlock(css.trim(), "css");

	return [
		"",
		tsBlock,
		"",
		"This will generate the following CSS :",
		"",
		cssBlock,
		"",
	].join("\n");
}

function wrapSource(tsSource: string): string {
	const hasDefaultExport = /export\s+default\s+/m.test(tsSource);
	const hasDefineConfigCall = /defineConfig\s*\(/m.test(tsSource);
	const hasConfigVar = /\bconst\s+config\b|\blet\s+config\b|\bvar\s+config\b/m.test(
		tsSource,
	);
	const srcModUrl = pathToFileURL(join(PACKAGE_ROOT, "src", "mod.ts")).href;
	const importLine = `import { defineConfig } from "${srcModUrl}";\n`;

	let normalized = tsSource.trim();
	if (!hasDefaultExport) {
		if (hasConfigVar) {
			normalized = `${normalized}\nexport default config;`;
		} else if (hasDefineConfigCall) {
			normalized = `const config = (${normalized.replace(/;?\s*$/, "")});\nexport default config;`;
		} else {
			normalized = `const config = defineConfig(${normalized});\nexport default config;`;
		}
	}

	return `${importLine}${normalized}\n`;
}

async function processReadme(): Promise<boolean> {
	const original = await readFile(README_PATH, "utf8");
	const lines = original.split(/\r?\n/);

	type Block = { startIdx: number; codeIdx: number; endIdx: number };
	const blocks: Block[] = [];

	for (let i = 0; i < lines.length; i++) {
		if (lines[i].startsWith(START_DEFINITION)) {
			let codeIdx = -1;
			let endIdx = -1;

			for (let j = i + 1; j < lines.length; j++) {
				if (lines[j].trim() === START_CODE) {
					codeIdx = j;
				} else if (lines[j].trim() === END_BLOCK) {
					endIdx = j;
					break;
				}
			}

			if (codeIdx !== -1 && endIdx !== -1) {
				blocks.push({ startIdx: i, codeIdx, endIdx });
				i = endIdx;
			}
		}
	}

	if (blocks.length === 0) {
		console.log("No md:generate blocks found.");
		return false;
	}

	const resultLines: string[] = [];
	let cursor = 0;
	const tempRoot = await mkdtemp(join(tmpdir(), "cssforge-readme-"));

	try {
		for (const block of blocks) {
			while (cursor < block.startIdx) {
				resultLines.push(lines[cursor++]);
			}

			const tsPreLines = lines.slice(block.startIdx + 1, block.codeIdx);
			const tsSource = tsPreLines
				.filter((line) => !line.trim().startsWith("```"))
				.join("\n")
				.trim();

			const tempConfigPath = join(tempRoot, `config-${randomUUID()}.ts`);
			await writeFile(tempConfigPath, wrapSource(tsSource), "utf8");

			const configUrl = pathToFileURL(tempConfigPath).href;
			const userConfig = await import(`${configUrl}?t=${Date.now()}`);
			const css = generateCSS(userConfig.default as CSSForgeConfig);

			const replacement = buildReplacement(tsSource, css);

			resultLines.push(lines[block.startIdx]);
			for (let k = block.startIdx + 1; k < block.codeIdx; k++) {
				resultLines.push(lines[k]);
			}
			resultLines.push(lines[block.codeIdx]);

			if (replacement.length) {
				resultLines.push(replacement);
			}

			resultLines.push(lines[block.endIdx]);
			cursor = block.endIdx + 1;
		}

		while (cursor < lines.length) {
			resultLines.push(lines[cursor++]);
		}
	} finally {
		await rm(tempRoot, { recursive: true, force: true });
	}

	const updated = resultLines.join("\n");

	if (updated !== original) {
		await writeFile(README_PATH, updated, "utf8");
		console.log("README.md updated successfully.");
		return true;
	}

	console.log("README.md had no changes.");
	return false;
}

await processReadme();
