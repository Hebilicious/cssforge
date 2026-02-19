/**
 * This script demonstrates programmatic generation.
 * For most workflows, prefer the CLI.
 */

import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { CSSForgeConfig } from "../../packages/cssforge/src/config.ts";
import { generateCSS } from "../../packages/cssforge/src/mod.ts";
import config from "./cssforge.config.ts";

async function writeCSS(
  config: Partial<CSSForgeConfig>,
  outputPath: string,
): Promise<void> {
  const css = generateCSS(config);
  await writeFile(outputPath, css, "utf8");
}

const currentFilePathname = fileURLToPath(import.meta.url);
const currentDir = dirname(currentFilePathname);

writeCSS(config, join(currentDir, "cssforge.css"));
