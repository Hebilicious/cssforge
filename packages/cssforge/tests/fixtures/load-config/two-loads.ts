/**
 * Loads a config twice in one process, rewriting a token module in between, and
 * prints both loads as JSON.
 *
 * The scenario runs in a plain Node process because `loadConfig` targets Node's
 * module loader: when a test runner transforms imports, the dynamic import
 * inside the loader goes through that runner's module graph instead, so the
 * synchronous module hooks the loader relies on never run.
 */
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { loadConfig } from "../../../src/mod.ts";

const dir = process.argv[2];

if (!dir) {
	throw new Error("Usage: node two-loads.ts <config-directory>");
}

const configPath = join(dir, "cssforge.config.ts");
const first = await loadConfig(configPath);
await writeFile(join(dir, "tokens.ts"), `export const size = "2rem";\n`, "utf8");
const second = await loadConfig(configPath);

console.log(JSON.stringify({ first, second }));
