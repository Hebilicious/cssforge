import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { childEnv } from "./helpers.ts";

const cliPath = fileURLToPath(new URL("../src/cli.ts", import.meta.url));

const configWith = (sizes: string) => `import { size } from "./tokens.ts";

export default {
	spacing: { custom: { size: { value: { 2: size, ${sizes} } } } },
};
`;

interface Built {
	ok: boolean;
	failure?: { _tag: string };
}

test("cli - watch rebuilds when a token module or the config changes, and after a failure", async () => {
	const dir = await mkdtemp(join(tmpdir(), "cssforge-watch-"));
	const config = join(dir, "cssforge.config.ts");
	const tokens = join(dir, "tokens.ts");
	const css = join(dir, "output.css");
	await writeFile(config, configWith(""), "utf8");
	await writeFile(tokens, `export const size = "0.5rem";\n`, "utf8");

	const child = spawn(
		process.execPath,
		[cliPath, "watch", "tokens.built", "--mode", "css", "--css", css],
		{ cwd: dir, env: childEnv },
	);
	let stderr = "";
	child.stderr.on("data", (chunk) => {
		stderr += String(chunk);
	});
	const lines = createInterface({ input: child.stdout })[Symbol.asyncIterator]();
	/** The next build: one JSON line on standard output. */
	const nextBuild = async (): Promise<Built> => {
		const { value, done } = await lines.next();
		if (done) throw new Error(`The watch ended. stderr:\n${stderr}`);
		return (JSON.parse(value) as { data: Built }).data;
	};
	const cssNow = () => readFile(css, "utf8");

	try {
		expect((await nextBuild()).ok).toEqual(true);
		expect(await cssNow()).toContain("--spacing-size-2: 0.5rem;");

		// A token module that the config imports is watched too.
		await writeFile(tokens, `export const size = "2rem";\n`, "utf8");
		expect((await nextBuild()).ok).toEqual(true);
		expect(await cssNow()).toContain("--spacing-size-2: 2rem;");

		await writeFile(config, configWith(`4: "1rem"`), "utf8");
		expect((await nextBuild()).ok).toEqual(true);
		expect(await cssNow()).toContain("--spacing-size-4: 1rem;");

		// A config that does not load is a failed build, and the watch goes on.
		await writeFile(config, "export default { spacing: {", "utf8");
		expect((await nextBuild()).failure?._tag).toEqual("ConfigLoadFailed");

		await writeFile(config, configWith(`4: "9rem"`), "utf8");
		expect((await nextBuild()).ok).toEqual(true);
		expect(await cssNow()).toContain("--spacing-size-4: 9rem;");

		const exited = new Promise<number | null>((resolve) => child.on("close", resolve));
		child.kill("SIGINT");
		// 130 is the exit code of an interrupted watch in the AcidCat CLI binding.
		expect(await exited).toEqual(130);
	} finally {
		child.kill();
		await rm(dir, { recursive: true, force: true });
	}
}, 60_000);
