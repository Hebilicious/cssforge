/**
 * Script to parse README.md and generate documentation within delimiters.
 *
 * Delimiters:
 *  startDefinition: <!-- md:generate defineConfig
 *  startCode: -->
 *  end: <!-- /md:generate -->
 */

import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { md } from "mdbox";

const README_PATH = join(Deno.cwd(), "README.md");

const START_DEFINITION = "<!-- md:generate defineConfig"; // begins the TS snippet line
const START_CODE = "-->"; // marks end of TS header section
const END_BLOCK = "<!-- /md:generate -->"; // marks end of whole block

// Template generator
function buildReplacement(tsSource: string, css: string): string {
  const tsBlock = md.codeBlock(tsSource.trim(), "typescript");
  const cssBlock = md.codeBlock(css.trim(), "css");
  // Only return the inner content to place between START_CODE and END_BLOCK
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
  const srcModUrl = pathToFileURL(join(Deno.cwd(), "src", "mod.ts")).href;
  const importLine = `import { defineConfig } from "${srcModUrl}";\n`;

  // Normalize to create a default export expression
  let normalized = tsSource.trim();
  if (!hasDefaultExport) {
    if (hasConfigVar) {
      normalized = `${normalized}\nexport default config;`;
    } else if (hasDefineConfigCall) {
      // The snippet likely ends with defineConfig({...}) without export; wrap by assigning to config
      normalized = `const config = (${
        normalized.replace(/;?\s*$/, "")
      });\nexport default config;`;
    } else {
      // As a last resort, try to wrap the whole snippet into defineConfig
      normalized = `const config = defineConfig(${normalized});\nexport default config;`;
    }
  }

  return `${importLine}${normalized}\n`;
}

// Parse all blocks functionally
async function processReadme(): Promise<boolean> {
  const original = await Deno.readTextFile(README_PATH);
  const lines = original.split(/\r?\n/);

  type Block = { startIdx: number; codeIdx: number; endIdx: number };
  const blocks: Block[] = [];

  // Single pass to collect indices
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
        i = endIdx; // jump forward
      }
    }
  }

  if (blocks.length === 0) {
    console.log("No md:generate blocks found.");
    return false;
  }

  // We'll rebuild the README with replacements
  const resultLines: string[] = [];
  let cursor = 0;

  // Prepare temp dir
  const tempRoot = await Deno.makeTempDir({ prefix: "cssforge-readme-" });
  // temp dir already created by makeTempDir

  for (const block of blocks) {
    // Push lines before the block untouched
    while (cursor < block.startIdx) {
      resultLines.push(lines[cursor++]);
    }

    // Extract TS between startDefinition (exclusive) and START_CODE (exclusive)
    const tsPreLines = lines.slice(block.startIdx + 1, block.codeIdx);
    const tsSource = tsPreLines.filter((l) => !l.trim().startsWith("```")).join("\n")
      .trim();

    // Create a temporary config file containing the snippet and an import for defineConfig.
    const tempConfigPath = join(tempRoot, `config-${crypto.randomUUID()}.ts`);

    const wrappedSource = wrapSource(tsSource);

    await Deno.writeTextFile(tempConfigPath, wrappedSource);

    // Run CLI to generate CSS output into a temp file
    const tempCssPath = join(tempRoot, `output-${crypto.randomUUID()}.css`);
    const cliPath = join(Deno.cwd(), "src", "cli.ts");
    const cmd = new Deno.Command("deno", {
      args: [
        "run",
        "-A",
        cliPath,
        "--config",
        tempConfigPath,
        "--mode",
        "css",
        "--css",
        tempCssPath,
      ],
      stdout: "piped",
      stderr: "piped",
    });
    const res = await cmd.output();
    if (!res.success) {
      const stdErr = new TextDecoder().decode(res.stderr);
      console.error("CLI error:\n", stdErr);
      throw new Error("CLI execution failed");
    }
    const css = await Deno.readTextFile(tempCssPath);

    // Build newly generated content (to be placed between START_CODE and END_BLOCK)
    const replacement = buildReplacement(tsSource, css);

    // Keep startDefinition line
    resultLines.push(lines[block.startIdx]);
    // Preserve original snippet as source of truth
    for (let k = block.startIdx + 1; k < block.codeIdx; k++) {
      resultLines.push(lines[k]);
    }
    // Keep START_CODE line
    resultLines.push(lines[block.codeIdx]);
    // Insert fresh generated content (replace anything previously between START_CODE and END_BLOCK)
    if (replacement.length) {
      resultLines.push(replacement);
    }
    // Keep END_BLOCK line
    resultLines.push(lines[block.endIdx]);

    cursor = block.endIdx + 1; // Skip past the entire old block
  }

  // Append any trailing lines
  while (cursor < lines.length) {
    resultLines.push(lines[cursor++]);
  }

  // Cleanup temp dir
  try {
    await Deno.remove(tempRoot, { recursive: true });
  } catch (e) {
    console.warn("Failed to remove temp directory", e);
  }

  const updated = resultLines.join("\n");
  if (updated !== original) {
    await Deno.writeTextFile(README_PATH, updated);
    console.log("README.md updated successfully.");
    return true;
  } else {
    console.log("README.md had no changes.");
    return false;
  }
}

await processReadme();
