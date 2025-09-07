import { defineCommand, runMain } from "citty";
import chokidar from "chokidar";
import fs from "node:fs/promises";
import { resolve } from "node:path";
import { generateCSS, generateJSON, generateTS } from "./generator.ts";
import process from "node:process";
import type { CSSForgeConfig } from "./config.ts";
import type { CommandDef } from "citty";

const writeFileRecursive = (path: string, data: string) =>
  fs.mkdir(path.replace(/\/[^/]*$/, ""), { recursive: true }).then(() =>
    fs.writeFile(path, data)
  );

export interface BuildOptions {
  config: string;
  mode: "css" | "json" | "ts" | "all";
  cssOutput: string;
  jsonOutput: string;
  tsOutput: string;
}

export async function build(
  { config, tsOutput, cssOutput, jsonOutput, mode }: BuildOptions,
): Promise<{ success: boolean; error?: unknown }> {
  try {
    console.log({ config, tsOutput, cssOutput, jsonOutput, mode });
    const absoluteconfig = resolve(process.cwd(), config);
    const absoluteCssOutput = resolve(process.cwd(), cssOutput);
    const absoluteJsonOutput = resolve(process.cwd(), jsonOutput);
    const absoluteTsOutput = resolve(process.cwd(), tsOutput);

    // Import config with cache busting
    const userConfig = await import(`${absoluteconfig}?t=${Date.now()}`);

    if (mode === "css" || mode === "all") {
      await writeFileRecursive(
        absoluteCssOutput,
        generateCSS(userConfig.default as CSSForgeConfig),
      );
      console.log(`✔ Generated CSS written to ${cssOutput}`);
    }

    if (mode === "json" || mode === "all") {
      await writeFileRecursive(
        absoluteJsonOutput,
        generateJSON(userConfig.default as CSSForgeConfig),
      );
      console.log(`✔ Generated JSON written to ${jsonOutput}`);
    }

    if (mode === "ts" || mode === "all") {
      await writeFileRecursive(
        absoluteTsOutput,
        generateTS(userConfig.default as CSSForgeConfig),
      );
      console.log(`✔ Generated TypeScript written to ${tsOutput}`);
    }

    return { success: true };
  } catch (error) {
    console.error(`Error during build:`, error);
    return { success: false, error };
  }
}

export interface WatchOptions extends BuildOptions {
  onRebuild?: () => void;
}

export async function watch(
  { onRebuild, ...buildOptions }: WatchOptions,
): Promise<() => void> {
  console.log(`👀 Watching ${buildOptions.config} for changes...`);

  // Initial build
  await build(buildOptions);

  // Watch for changes
  const watcher = chokidar.watch(buildOptions.config, {
    persistent: true,
    ignoreInitial: true,
  });

  watcher.on("change", async () => {
    console.log(`🔄 Config changed, regenerating...`);
    await build(buildOptions);
    onRebuild?.();
  });

  // Return cleanup function
  return () => watcher.close();
}

const mainCommand = defineCommand({
  meta: {
    name: "cssforge",
    version: "0.1.0",
    description: "Generate CSS variables from a configuration file",
  },
  args: {
    watch: {
      type: "boolean",
      description: "Watch for changes in the config file",
      alias: "w",
    },
    config: {
      type: "string",
      description: "Path to the config file",
      default: "./cssforge.config.ts",
    },
    mode: {
      type: "string",
      description: "Output mode (css, json, all)",
      alias: "m",
      default: "all",
    },
    "prefix": {
      type: "string",
      description: "A prefix applied before all path",
      default: "",
    },
    "json": {
      type: "string",
      description: "Optional path for an output JSON file",
      default: "./.cssforge/output.json",
    },
    "css": {
      type: "string",
      description: "Path for the output CSS file",
      default: "./.cssforge/output.css",
    },
    "ts": {
      type: "string",
      description: "Path for the output TypeScript file",
      default: "./.cssforge/output.ts",
    },
  },
  async run({ args }) {
    const { watch: shouldWatch, config, css, json, ts, mode, prefix } = args;
    const realPath = (p: string) => resolve(prefix, p);
    const settings = {
      mode,
      config: realPath(config),
      cssOutput: realPath(css),
      tsOutput: realPath(ts),
      jsonOutput: realPath(json),
    } as BuildOptions;
    if (shouldWatch) {
      const cleanup = await watch(settings);

      // Handle process termination
      process.on("SIGINT", async () => {
        await cleanup();
        console.log("\n🛑 Stopped watching");
        process.exit(0);
      });
    } else {
      const { success } = await build(settings);
      process.exit(success ? 0 : 1);
    }
  },
});

// Run if called directly
if (import.meta.main) {
  runMain(mainCommand);
}

// Export for programmatic usage
export default mainCommand as CommandDef;
