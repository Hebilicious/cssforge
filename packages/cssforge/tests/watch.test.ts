import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { childEnv } from "./helpers.ts";
import { assert, assertEquals, Deno } from "./vitest-compat.ts";

const configSource = `import { size } from "./tokens.ts";

export default {
	spacing: {
		custom: {
			size: {
				value: {
					2: size,
				},
			},
		},
	},
};
`;

const cliEntry = new URL("../src/cli.ts", import.meta.url).href;

/**
 * Starts `watch()`, rewrites the token module the config imports and then the
 * config itself, and prints the generated CSS after each rebuild.
 */
const watchScript = `
const { readFile, writeFile } = await import("node:fs/promises");
const { watch } = await import(${JSON.stringify(cliEntry)});

await watch({
	config: process.env.CSSFORGE_CONFIG,
	mode: "css",
	cssOutput: process.env.CSSFORGE_CSS,
	jsonOutput: process.env.CSSFORGE_JSON,
	tsOutput: process.env.CSSFORGE_TS,
});

const waitFor = async (needle) => {
	for (let attempt = 0; attempt < 100; attempt += 1) {
		await new Promise((resolve) => setTimeout(resolve, 100));
		try {
			const css = await readFile(process.env.CSSFORGE_CSS, "utf8");
			if (css.includes(needle)) return css;
		} catch {
			continue;
		}
	}
	return "";
};

await writeFile(process.env.CSSFORGE_TOKENS, 'export const size = "2rem";\\n', "utf8");
const afterTokenChange = await waitFor("--spacing-size-2: 2rem");

await writeFile(process.env.CSSFORGE_CONFIG, ${JSON.stringify(`import { size } from "./tokens.ts";

export default {
	spacing: {
		custom: {
			size: {
				value: {
					2: size,
					4: "1rem",
				},
			},
		},
	},
};
`)}, "utf8");
const afterConfigChange = await waitFor("--spacing-size-4: 1rem");

// A config that fails to load must not stop the watcher: repair it with a new
// value and expect another rebuild.
await writeFile(process.env.CSSFORGE_CONFIG, 'export default { spacing: { custom: { size: { value: { 2: "9rem" } } } }', "utf8");
await new Promise((resolve) => setTimeout(resolve, 500));
await writeFile(process.env.CSSFORGE_CONFIG, 'export default { spacing: { custom: { size: { value: { 2: "9rem" } } } } };', "utf8");
const afterRecovery = await waitFor("--spacing-size-2: 9rem");

console.log(JSON.stringify({ afterTokenChange, afterConfigChange, afterRecovery }));
process.exit(0);
`;

Deno.test("cli - watch mode regenerates the output when a token module or the config changes", async () => {
	const dir = await mkdtemp(join(tmpdir(), "cssforge-watch-deps-"));

	try {
		const config = join(dir, "cssforge.config.ts");
		const tokens = join(dir, "tokens.ts");
		const css = join(dir, "output.css");
		await writeFile(config, configSource, "utf8");
		await writeFile(tokens, `export const size = "0.5rem";\n`, "utf8");

		const child = spawn(process.execPath, ["--input-type=module", "-e", watchScript], {
			cwd: dir,
			env: {
				...childEnv,
				CSSFORGE_CONFIG: config,
				CSSFORGE_TOKENS: tokens,
				CSSFORGE_CSS: css,
				CSSFORGE_JSON: join(dir, "output.json"),
				CSSFORGE_TS: join(dir, "output.ts"),
			},
			stdio: ["ignore", "pipe", "pipe"],
		});

		let stdout = "";
		let stderr = "";
		child.stdout.on("data", (chunk) => (stdout += String(chunk)));
		child.stderr.on("data", (chunk) => (stderr += String(chunk)));

		const exitCode = await new Promise<number | null>((resolve) => {
			child.on("close", resolve);
		});

		assertEquals(exitCode, 0, `watch() failed: ${stderr}`);

		const output = stdout
			.split("\n")
			.map((line) => line.trim())
			.filter(Boolean)
			.pop();

		if (output === undefined) {
			throw new Error(`the watch scenario printed no result: ${stdout}`);
		}

		const { afterTokenChange, afterConfigChange, afterRecovery } = JSON.parse(output) as {
			afterTokenChange: string;
			afterConfigChange: string;
			afterRecovery: string;
		};

		assert(
			afterTokenChange.includes("--spacing-size-2: 2rem"),
			`the rebuild must use the new token value: ${afterTokenChange}`,
		);
		assert(
			!afterTokenChange.includes("0.5rem"),
			`the rebuild must not keep the old token value: ${afterTokenChange}`,
		);
		assert(
			afterConfigChange.includes("--spacing-size-4: 1rem"),
			`a second config change must regenerate too: ${afterConfigChange}`,
		);
		assert(
			afterConfigChange.includes("--spacing-size-2: 2rem"),
			`the second rebuild must keep the token module value: ${afterConfigChange}`,
		);
		assert(
			afterRecovery.includes("--spacing-size-2: 9rem"),
			`a failed rebuild must not stop watching: ${afterRecovery}`,
		);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
}, 60000);
