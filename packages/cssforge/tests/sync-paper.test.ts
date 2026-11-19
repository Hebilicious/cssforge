import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createSession } from "@acid-cat/core-ts";
import { afterEach, beforeEach, expect, test } from "vitest";
import {
	cssforge,
	paperAdapter,
	syncFetch,
	syncPlan,
	syncPush,
	syncRemoteAdd,
	toJsonSchema,
} from "../src/capabilities.ts";

const fakePaper = fileURLToPath(new URL("./fixtures/fake-paper-mcp.ts", import.meta.url));

let projectDir = "";
let logPath = "";

beforeEach(async () => {
	projectDir = await mkdtemp(join(tmpdir(), "cssforge-sync-paper-"));
	logPath = join(projectDir, "paper.log");
	await writeFile(logPath, "", "utf8");
	process.env.FAKE_PAPER_STATE = join(projectDir, "paper.json");
	process.env.FAKE_PAPER_LOG = logPath;
	await writeFile(
		join(projectDir, "cssforge.config.ts"),
		`export default ${JSON.stringify({
			colors: { palette: { value: { brand: { 500: "oklch(60% 0.2 250)" } } } },
			typography: { weight: { body: { value: { bold: "700" } } } },
		})};\n`,
		"utf8",
	);
});

afterEach(async () => {
	delete process.env.FAKE_PAPER_STATE;
	delete process.env.FAKE_PAPER_LOG;
	await rm(projectDir, { recursive: true, force: true });
});

const openSession = (command: string, args: string[]) =>
	createSession(cssforge, {
		target: "library",
		context: { cwd: projectDir, remotes: [paperAdapter({ command, args })] },
		toJsonSchema,
	});

const toolCalls = async () =>
	(await readFile(logPath, "utf8"))
		.split("\n")
		.filter(Boolean)
		.map(
			(line) => JSON.parse(line) as { name: string; arguments: Record<string, unknown> },
		);

test("paper - remote add binds the file id that Paper reports for a file URL", async () => {
	await using session = openSession(process.execPath, [fakePaper]);

	const result = await session.call(syncRemoteAdd, {
		file: "https://app.paper.design/file/01FAKE/p-1-0",
	});

	expect(result.ok, JSON.stringify(result)).toEqual(true);
	if (!result.ok) return;
	expect(result.value.file).toEqual({ id: "01FAKE", name: "Fake file" });
	expect(await toolCalls()).toEqual([
		{
			name: "get_basic_info",
			arguments: { fileId: "https://app.paper.design/file/01FAKE/p-1-0" },
		},
	]);
});

test("paper - push sends Paper's token types, a font weight as a number, and reads the values back", async () => {
	await using session = openSession(process.execPath, [fakePaper]);
	await session.call(syncRemoteAdd, { file: "01FAKE" });

	const result = await session.call(syncPush, {});

	expect(result.ok, JSON.stringify(result)).toEqual(true);
	expect((await toolCalls()).slice(1)).toEqual([
		{ name: "get_tokens", arguments: { fileId: "01FAKE", format: "json" } },
		{
			name: "create_tokens",
			arguments: {
				fileId: "01FAKE",
				tokens: [
					{
						type: "color",
						name: "--palette-brand-500",
						value: "oklch(60% 0.2 250)",
						description: "cssforge: palette.brand.500",
					},
					{
						type: "fontWeight",
						name: "--typography-weight-body-bold",
						value: 700,
						description: "cssforge: typography.weight.body.bold",
					},
				],
			},
		},
		{ name: "get_tokens", arguments: { fileId: "01FAKE", format: "json" } },
	]);
	if (result.ok) expect(result.value.callsUsed).toEqual(3);
});

test("paper - a missing paper-design command fails as RemoteUnavailable", async () => {
	await using session = openSession(join(projectDir, "no-such-paper-design"), ["mcp"]);

	const result = await session.call(syncRemoteAdd, { file: "01FAKE" });

	expect(result.ok ? undefined : result.error._tag).toEqual("RemoteUnavailable");
	if (!result.ok) expect(result.error.message).toContain("was not found");
});

test("paper - a token name the state cannot hold fails the fetch and leaves the state readable", async () => {
	await using session = openSession(process.execPath, [fakePaper]);
	await session.call(syncRemoteAdd, { file: "01FAKE" });
	await writeFile(
		process.env.FAKE_PAPER_STATE ?? "",
		JSON.stringify([{ name: "brand", type: "color", value: "#ff0000" }]),
		"utf8",
	);

	const fetched = await session.call(syncFetch, {});
	const planned = await session.call(syncPlan, {});

	expect(fetched.ok ? undefined : fetched.error._tag).toEqual("RemoteFailed");
	expect(planned.ok ? undefined : planned.error._tag).toEqual("NotFetched");
});
