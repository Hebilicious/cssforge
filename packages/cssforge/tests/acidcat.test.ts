import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { createSession, renderCatalog } from "@acid-cat/core-ts";
import { afterEach, beforeEach, expect, test } from "vitest";
import {
	configCheck,
	cssforge,
	toJsonSchema,
	tokensBuild,
	tokensGenerate,
} from "../src/app.ts";
import { childEnv } from "./helpers.ts";

const cliPath = fileURLToPath(new URL("../src/cli.ts", import.meta.url));

const spacingConfig = (size: string) =>
	`export default { spacing: { custom: { size: { value: { 2: "${size}" } } } } };\n`;

let projectDir = "";

beforeEach(async () => {
	projectDir = await mkdtemp(join(tmpdir(), "cssforge-acidcat-"));
	await writeFile(join(projectDir, "cssforge.config.ts"), spacingConfig("8px"), "utf8");
});

afterEach(async () => {
	await rm(projectDir, { recursive: true, force: true });
});

const openSession = () =>
	createSession(cssforge, { target: "cli", context: { cwd: projectDir }, toJsonSchema });

test("catalog - the committed catalog is the one the application writes", async () => {
	const committed = await readFile(
		fileURLToPath(new URL("../cssforge.acidcat.json", import.meta.url)),
		"utf8",
	);

	expect(
		committed,
		"cssforge.acidcat.json is stale: run `moon run cssforge:catalog-write`",
	).toEqual(renderCatalog(cssforge, { toJsonSchema }));
});

test("app - tokens.generate gives an output as text and writes nothing", async () => {
	await using session = openSession();

	const result = await session.call(tokensGenerate, { format: "css" });

	expect(result.ok, JSON.stringify(result)).toEqual(true);
	if (!result.ok) return;
	expect(result.value.format).toEqual("css");
	expect(result.value.content).toContain("--spacing-size-2: 0.5rem;");
	expect(result.value.dependencies).toEqual([join(projectDir, "cssforge.config.ts")]);
});

test("app - tokens.build writes each output under the root of the input", async () => {
	await using session = openSession();

	const result = await session.call(tokensBuild, {
		mode: "css",
		root: "site",
		config: "../cssforge.config.ts",
		css: "tokens.css",
	});

	expect(result.ok, JSON.stringify(result)).toEqual(true);
	if (!result.ok) return;
	const cssPath = join(projectDir, "site", "tokens.css");
	expect(result.value.files).toEqual([{ format: "css", path: cssPath }]);
	expect(await readFile(cssPath, "utf8")).toContain("--spacing-size-2: 0.5rem;");
});

test("app - config.check tells a missing file from a rejected configuration", async () => {
	await using session = openSession();
	await writeFile(
		join(projectDir, "invalid.config.ts"),
		`export default { spacing: { custom: { size: { value: { "row gap": "8px" } } } } };\n`,
		"utf8",
	);

	const missing = await session.call(configCheck, { config: "missing.config.ts" });
	const invalid = await session.call(configCheck, { config: "invalid.config.ts" });

	expect(missing.ok).toEqual(false);
	if (!missing.ok) {
		expect(missing.error._tag).toEqual("ConfigLoadFailed");
		expect(missing.error.path).toEqual(join(projectDir, "missing.config.ts"));
	}
	expect(invalid.ok).toEqual(false);
	if (!invalid.ok) {
		expect(invalid.error._tag).toEqual("InvalidConfig");
		expect(invalid.error.message).toContain("row gap");
	}
});

/** Starts the CLI, and reads its standard output one line at a time. */
const startCli = (args: string[]) => {
	const child = spawn(process.execPath, [cliPath, ...args], {
		cwd: projectDir,
		env: childEnv,
	}) as ChildProcessWithoutNullStreams;
	let stderr = "";
	child.stderr.on("data", (chunk) => {
		stderr += String(chunk);
	});
	const lines = createInterface({ input: child.stdout })[Symbol.asyncIterator]();
	const nextLine = async () => {
		const { value, done } = await lines.next();
		if (done) throw new Error(`The CLI closed its output. stderr:\n${stderr}`);
		return JSON.parse(value) as Record<string, unknown>;
	};
	const exited = new Promise<number | null>((resolve) => child.on("close", resolve));
	return { child, nextLine, exited };
};

test("cli - the watch flag writes one occurrence per build until interrupted", async () => {
	const cssPath = join(projectDir, "output.css");
	const { child, nextLine, exited } = startCli(["-w", "--mode", "css", "--css", cssPath]);

	try {
		const first = await nextLine();
		expect(first.data).toEqual({
			ok: true,
			files: [{ format: "css", path: cssPath }],
			diagnostics: [],
			dependencies: [join(projectDir, "cssforge.config.ts")],
		});
		expect(await readFile(cssPath, "utf8")).toContain("--spacing-size-2: 0.5rem;");

		// The first occurrence comes once every file of the build is watched, so a
		// change right after it gives a new build.
		await writeFile(
			join(projectDir, "cssforge.config.ts"),
			spacingConfig("16px"),
			"utf8",
		);

		const second = await nextLine();
		expect((second.data as { ok: boolean }).ok).toEqual(true);
		expect(await readFile(cssPath, "utf8")).toContain("--spacing-size-2: 1rem;");

		child.kill("SIGINT");
		// 130 is the exit code of an interrupted watch in the AcidCat CLI binding.
		expect(await exited).toEqual(130);
	} finally {
		child.kill();
	}
}, 30_000);

test("mcp - cssforge mcp serves the capabilities as tools", async () => {
	const { child, nextLine, exited } = startCli(["mcp"]);
	const send = (message: object) => child.stdin.write(`${JSON.stringify(message)}\n`);

	try {
		send({
			jsonrpc: "2.0",
			id: 1,
			method: "initialize",
			params: {
				protocolVersion: "2025-06-18",
				capabilities: {},
				clientInfo: { name: "cssforge-test", version: "1.0.0" },
			},
		});
		expect((await nextLine()).id).toEqual(1);
		send({ jsonrpc: "2.0", method: "notifications/initialized" });

		send({ jsonrpc: "2.0", id: 2, method: "tools/list" });
		const listed = (await nextLine()).result as { tools: { name: string }[] };
		expect(listed.tools.map((tool) => tool.name).sort()).toEqual([
			"config.check",
			"tokens.build",
			"tokens.generate",
		]);

		send({
			jsonrpc: "2.0",
			id: 3,
			method: "tools/call",
			params: { name: "tokens.generate", arguments: { format: "css" } },
		});
		const called = (await nextLine()).result as {
			structuredContent: { content: string };
		};
		expect(called.structuredContent.content).toContain("--spacing-size-2: 0.5rem;");

		// The server stops when its input ends.
		child.stdin.end();
		expect(await exited).toEqual(0);
	} finally {
		child.kill();
	}
}, 30_000);
