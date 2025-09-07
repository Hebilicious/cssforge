/**
 * /!\ This script uses deno and is only for demonstration purposes.
 * Note that you can use the CLI instead of this script.
 */

import type { CSSForgeConfig } from "../../src/config.ts";
import { generateCSS } from "../../src/mod.ts";
import config from "./cssforge.config.ts";

async function writeCSS(
  config: Partial<CSSForgeConfig>,
  outputPath: string,
): Promise<void> {
  const css = generateCSS(config);
  await Deno.writeTextFile(outputPath, css);
}

// Get the directory of the current file
const currentFilePathname = new URL(".", import.meta.url).pathname;

writeCSS(config, currentFilePathname + "cssforge.css");
