import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createSession } from "@acid-cat/core-ts";
import { afterEach, beforeEach, expect, test } from "vitest";
import {
	type ApplyResult,
	cssforge,
	type Operation,
	paperAdapter,
	type RemoteAdapter,
	RemoteError,
	type RemoteToken,
	syncFetch,
	syncInboxAdopt,
	syncInboxOverwrite,
	syncInboxReject,
	syncPlan,
	syncPush,
	syncRemoteAdd,
	toJsonSchema,
} from "../src/capabilities.ts";
import { childEnv } from "./helpers.ts";

/**
 * An in-memory Paper file. It keeps the rules of Paper that sync depends on: an alias
 * must name an existing token of the same type, `set_tokens` targets an existing name,
 * and duplicate names are allowed. `store` changes a value as Paper normalizes it.
 */
class FakePaper {
	tokens: RemoteToken[] = [];
	requests = 0;
	/** Names whose create or update the remote refuses. */
	refuse = new Set<string>();
	store = (value: string) => value;
	/** The number of reads that succeed before every later read fails. */
	readsBeforeFailure = Number.POSITIVE_INFINITY;

	readonly adapter: RemoteAdapter = {
		kind: "paper",
		// The mapping of the real Paper remote: only the transport is fake.
		map: paperAdapter().map,
		open: async () => {
			let calls = 0;
			const request = () => {
				calls += 1;
				this.requests += 1;
			};
			return {
				get calls() {
					return calls;
				},
				close: () => {},
				describe: async (file) => {
					request();
					return { id: file.replace(/^.*\/file\//, ""), name: "Tokens" };
				},
				read: async () => {
					request();
					if (this.readsBeforeFailure <= 0) {
						throw new RemoteError("RemoteUnavailable", "Paper stopped.");
					}
					this.readsBeforeFailure -= 1;
					return this.tokens.map((token) => ({ ...token }));
				},
				apply: async (_file, operations) => {
					request();
					return operations.map((operation) => this.apply(operation));
				},
			};
		},
	};

	private find = (name: string) => this.tokens.find((token) => token.name === name);

	private apply(operation: Operation): ApplyResult {
		const refused = (message: string): ApplyResult => ({ operation, ok: false, message });
		switch (operation.op) {
			case "create": {
				if (this.refuse.has(operation.name)) return refused("Refused.");
				const alias = /^var\((--[\w-]+)\)$/.exec(operation.value)?.[1];
				if (alias && this.find(alias)?.type !== operation.type) {
					return refused(`Invalid value "${operation.value}".`);
				}
				this.tokens.push({
					name: operation.name,
					type: operation.type,
					value: this.store(operation.value),
					description: operation.description,
				});
				return { operation, ok: true };
			}
			case "update": {
				const token = this.find(operation.name);
				if (!token || this.refuse.has(operation.name)) return refused("Refused.");
				token.value = this.store(operation.value);
				return { operation, ok: true };
			}
			case "rename": {
				const token = this.find(operation.from);
				if (!token) return refused("Token not found.");
				token.name = operation.to;
				return { operation, ok: true };
			}
			case "delete": {
				if (!this.find(operation.name)) return refused("Token not found.");
				this.tokens = this.tokens.filter((token) => token.name !== operation.name);
				return { operation, ok: true };
			}
		}
	}

	value = (name: string) => this.find(name)?.value;
}

/** A palette color, an alias to it, two sizes, and three tokens Paper has no place for. */
const baseConfig = {
	colors: {
		palette: {
			value: {
				brand: {
					500: "oklch(60% 0.2 250)",
					600: { mix: { from: "palette.brand.500", with: "black", amount: 20 } },
				},
			},
		},
		theme: {
			value: {
				light: {
					value: {
						surface: {
							value: { accent: "var(--brand)" },
							variables: { brand: "palette.brand.500" },
						},
					},
				},
				dark: {
					value: { surface: { value: { accent: "oklch(30% 0.1 250)" } } },
					settings: { selector: ".dark" },
				},
			},
		},
	},
	spacing: { custom: { size: { value: { 1: "4px", 2: "8px" } } } },
	motion: { duration: { ui: { value: { press: "120ms" } } } },
};

let projectDir = "";
let paper: FakePaper;

const writeConfig = (config: unknown) =>
	writeFile(
		join(projectDir, "cssforge.config.ts"),
		`export default ${JSON.stringify(config)};\n`,
		"utf8",
	);

const withSpacing = (sizes: Record<string, string>) => ({
	...baseConfig,
	spacing: { custom: { size: { value: sizes } } },
});

const withAccent = (accent: string) => ({
	...baseConfig,
	colors: {
		...baseConfig.colors,
		palette: {
			value: { brand: { ...baseConfig.colors.palette.value.brand, accent } },
		},
	},
});

beforeEach(async () => {
	projectDir = await mkdtemp(join(tmpdir(), "cssforge-sync-"));
	paper = new FakePaper();
	await writeConfig(baseConfig);
});

afterEach(async () => {
	await rm(projectDir, { recursive: true, force: true });
});

const openSession = () =>
	createSession(cssforge, {
		target: "library",
		context: { cwd: projectDir, remotes: [paper.adapter] },
		toJsonSchema,
	});

/** Calls a capability, and gives its value, or fails the test with its failure. */
const expectValue = async <T>(
	result: Promise<{ ok: true; value: T } | { ok: false; error: unknown }>,
) => {
	const settled = await result;
	if (!settled.ok)
		throw new Error(`Expected a value. Received ${JSON.stringify(settled.error)}`);
	return settled.value;
};

/** A session with the remote added and the configuration pushed once. */
const pushedSession = async () => {
	const session = openSession();
	await expectValue(
		session.call(syncRemoteAdd, { file: "https://app.paper.design/file/F1" }),
	);
	await expectValue(session.call(syncPush, {}));
	return session;
};

test("push - creates the configuration tokens on an empty remote, each alias after its target", async () => {
	await using session = openSession();
	await expectValue(
		session.call(syncRemoteAdd, { file: "https://app.paper.design/file/F1" }),
	);

	const report = await expectValue(session.call(syncPush, {}));

	expect(report.applied.map(({ operation, ok }) => ({ ...operation, ok }))).toEqual([
		{
			op: "create",
			name: "--palette-brand-500",
			type: "color",
			value: "oklch(60% 0.2 250)",
			description: "cssforge: palette.brand.500",
			ok: true,
		},
		{
			op: "create",
			name: "--theme-light-surface-accent",
			type: "color",
			value: "var(--palette-brand-500)",
			description: "cssforge: theme.light.surface.accent",
			ok: true,
		},
		{
			op: "create",
			name: "--spacing-size-1",
			type: "spacing",
			value: "0.25rem",
			description: "cssforge: spacing.custom.size.1",
			ok: true,
		},
		{
			op: "create",
			name: "--spacing-size-2",
			type: "spacing",
			value: "0.5rem",
			description: "cssforge: spacing.custom.size.2",
			ok: true,
		},
	]);
	expect(report.operations).toEqual([]);
	expect(report.file).toEqual({ id: "F1", name: "Tokens" });
});

test("push - reports each configuration token that has no place on Paper, with the reason", async () => {
	await using session = openSession();
	await expectValue(session.call(syncRemoteAdd, { file: "F1" }));

	const report = await expectValue(session.call(syncPush, { "dry-run": true }));

	expect(report.skipped).toEqual([
		{
			name: "--palette-brand-600",
			sourcePath: "palette.brand.600",
			reason: "Paper does not take color-mix() or light-dark() values.",
		},
		{
			name: "--theme-dark-surface-accent",
			sourcePath: "theme.dark.surface.accent",
			reason: "It is scoped to |.dark, and Paper has no modes.",
		},
		{
			name: "--motion-duration-ui-press",
			sourcePath: "motion.duration.ui.press",
			reason: "Paper has no duration tokens.",
		},
	]);
	expect(report.applied).toEqual([]);
	expect(paper.tokens).toEqual([]);
});

test("push - a push with no change reads the remote once and sends nothing", async () => {
	await using session = await pushedSession();
	paper.requests = 0;

	const report = await expectValue(session.call(syncPush, {}));

	expect(report.applied).toEqual([]);
	expect(report.callsUsed).toEqual(paper.requests);
	expect(paper.requests).toEqual(1);
});

test("push - updates a changed token and deletes a token removed from the configuration", async () => {
	await using session = await pushedSession();
	await writeConfig(withSpacing({ 1: "6px" }));

	const report = await expectValue(session.call(syncPush, {}));

	expect(report.applied.map(({ operation }) => operation)).toEqual([
		{
			op: "update",
			name: "--spacing-size-1",
			type: "spacing",
			value: "0.375rem",
			description: "cssforge: spacing.custom.size.1",
		},
		{ op: "delete", name: "--spacing-size-2" },
	]);
	expect(paper.value("--spacing-size-1")).toEqual("0.375rem");
	expect(paper.value("--spacing-size-2")).toBeUndefined();
});

test("fetch - a value the remote stores in another form is not a change", async () => {
	paper.store = (value) => value.replace("oklch(60% 0.2 250)", "oklch(60.0% 0.200 250)");
	await using session = await pushedSession();

	const report = await expectValue(session.call(syncFetch, {}));

	expect(report.operations).toEqual([]);
	expect(report.inbox).toEqual([]);
});

test("inbox - a value edited on the remote waits until overwrite gives the configuration value back", async () => {
	await using session = await pushedSession();
	const edited = paper.tokens.find((token) => token.name === "--spacing-size-1");
	if (edited) edited.value = "12px";

	const held = await expectValue(session.call(syncPush, {}));

	expect(held.applied).toEqual([]);
	expect(held.inbox).toEqual([
		{
			id: "spacing-size-1",
			kind: "edited",
			name: "--spacing-size-1",
			type: "spacing",
			remoteValue: "12px",
			localValue: "0.25rem",
			actions: ["overwrite"],
		},
	]);
	expect(paper.value("--spacing-size-1")).toEqual("12px");

	await expectValue(session.call(syncInboxOverwrite, { item: "spacing-size-1" }));
	const restored = await expectValue(session.call(syncPush, {}));

	expect(paper.value("--spacing-size-1")).toEqual("0.25rem");
	expect(restored.inbox).toEqual([]);
});

test("inbox - a token the remote created is deleted by the push after a reject", async () => {
	await using session = await pushedSession();
	paper.tokens.push({
		name: "--brand-accent",
		type: "color",
		value: "oklch(70% 0.2 30)",
	});

	const fetched = await expectValue(session.call(syncFetch, {}));
	expect(fetched.inbox).toEqual([
		{
			id: "brand-accent",
			kind: "new",
			name: "--brand-accent",
			type: "color",
			remoteValue: "oklch(70% 0.2 30)",
			actions: ["adopt", "reject"],
		},
	]);

	const decided = await expectValue(
		session.call(syncInboxReject, { item: "brand-accent" }),
	);
	expect(decided.callsUsed).toEqual(0);
	expect(decided.skipped.map((token) => token.name)).toEqual([
		"--palette-brand-600",
		"--theme-dark-surface-accent",
		"--motion-duration-ui-press",
	]);
	const report = await expectValue(session.call(syncPush, {}));

	expect(report.applied.map(({ operation }) => operation)).toEqual([
		{ op: "delete", name: "--brand-accent" },
	]);
	expect(paper.value("--brand-accent")).toBeUndefined();
	expect(report.inbox).toEqual([]);
});

test("inbox - adopt renames a token the remote created to the name the configuration gives it", async () => {
	await using session = await pushedSession();
	paper.tokens.push({
		name: "--brand-accent",
		type: "color",
		value: "oklch(70% 0.2 30)",
	});
	await expectValue(session.call(syncFetch, {}));

	const early = await session.call(syncInboxAdopt, {
		item: "brand-accent",
		path: "palette.brand.accent",
	});
	expect(early.ok).toEqual(false);
	if (!early.ok) expect(early.error._tag).toEqual("InvalidDecision");

	await writeConfig(withAccent("oklch(70% 0.2 30)"));
	await expectValue(
		session.call(syncInboxAdopt, { item: "brand-accent", path: "palette.brand.accent" }),
	);
	const report = await expectValue(session.call(syncPush, {}));

	expect(report.applied.map(({ operation }) => operation)).toEqual([
		{ op: "rename", from: "--brand-accent", to: "--palette-brand-accent" },
	]);
	expect(paper.value("--palette-brand-accent")).toEqual("oklch(70% 0.2 30)");
	expect(paper.value("--brand-accent")).toBeUndefined();

	const after = await expectValue(session.call(syncPush, {}));
	expect(after.applied).toEqual([]);
	expect(after.inbox).toEqual([]);
});

test("push - an operation the remote refuses is reported and sent again at the next push", async () => {
	await using session = openSession();
	await expectValue(session.call(syncRemoteAdd, { file: "F1" }));
	paper.refuse.add("--spacing-size-2");

	const first = await expectValue(session.call(syncPush, {}));

	expect(first.applied.find(({ ok }) => !ok)).toEqual({
		operation: {
			op: "create",
			name: "--spacing-size-2",
			type: "spacing",
			value: "0.5rem",
			description: "cssforge: spacing.custom.size.2",
		},
		ok: false,
		message: "Refused.",
	});
	expect(first.operations.map((operation) => operation.op)).toEqual(["create"]);

	paper.refuse.clear();
	const second = await expectValue(session.call(syncPush, {}));

	expect(second.applied.map(({ operation, ok }) => [operation.op, ok])).toEqual([
		["create", true],
	]);
	expect(paper.value("--spacing-size-2")).toEqual("0.5rem");
});

test("plan - fails with RemoteNotConfigured before remote add, and NotFetched before a fetch", async () => {
	await using session = openSession();

	const unbound = await session.call(syncPlan, {});
	expect(unbound.ok ? undefined : unbound.error._tag).toEqual("RemoteNotConfigured");

	await expectValue(session.call(syncRemoteAdd, { file: "F1" }));
	const unread = await session.call(syncPlan, {});
	expect(unread.ok ? undefined : unread.error._tag).toEqual("NotFetched");
});

test("remote add - binding the same file keeps the sync state, binding another file starts again", async () => {
	await using session = await pushedSession();

	await expectValue(session.call(syncRemoteAdd, { file: "F1" }));
	const kept = await expectValue(session.call(syncPlan, {}));
	expect(kept.operations).toEqual([]);

	await expectValue(session.call(syncRemoteAdd, { file: "F2" }));
	const restarted = await session.call(syncPlan, {});
	expect(restarted.ok ? undefined : restarted.error._tag).toEqual("NotFetched");
});

test("cli - cssforge sync plan runs its capability and gives a failure as JSON", () => {
	const cliPath = fileURLToPath(new URL("../src/cli.ts", import.meta.url));

	const plan = spawnSync(process.execPath, [cliPath, "sync", "plan", "--agent"], {
		cwd: projectDir,
		encoding: "utf8",
		env: childEnv,
	});

	expect(plan.status).toEqual(1);
	expect(JSON.parse(plan.stdout)).toMatchObject({ _tag: "RemoteNotConfigured" });
});

test("push - a pushed token whose new value has no place on Paper keeps its Paper copy", async () => {
	await using session = await pushedSession();
	await writeConfig({
		...baseConfig,
		colors: {
			...baseConfig.colors,
			palette: {
				value: {
					brand: {
						400: "oklch(50% 0.2 250)",
						500: { mix: { from: "palette.brand.400", with: "black", amount: 10 } },
					},
				},
			},
		},
	});

	const report = await expectValue(session.call(syncPush, {}));

	expect(report.applied.map(({ operation }) => operation.op)).toEqual(["create"]);
	expect(report.skipped.map((token) => token.name)).toContain("--palette-brand-500");
	expect(paper.value("--palette-brand-500")).toEqual("oklch(60% 0.2 250)");
	expect(paper.value("--theme-light-surface-accent")).toEqual("var(--palette-brand-500)");
});

test("inbox - two remote tokens cannot be adopted as the same configuration token", async () => {
	await using session = await pushedSession();
	paper.tokens.push(
		{ name: "--brand-accent", type: "color", value: "oklch(70% 0.2 30)" },
		{ name: "--accent", type: "color", value: "oklch(70% 0.2 30)" },
	);
	await expectValue(session.call(syncFetch, {}));
	await writeConfig(withAccent("oklch(70% 0.2 30)"));
	await expectValue(
		session.call(syncInboxAdopt, { item: "brand-accent", path: "palette.brand.accent" }),
	);

	const second = await session.call(syncInboxAdopt, {
		item: "accent",
		path: "palette.brand.accent",
	});

	expect(second.ok ? undefined : second.error._tag).toEqual("InvalidDecision");
});

test("push - tokens the remote accepted stay owned when the read-back after the push fails", async () => {
	await using session = openSession();
	await expectValue(session.call(syncRemoteAdd, { file: "F1" }));
	paper.readsBeforeFailure = 1;

	const failed = await session.call(syncPush, {});
	expect(failed.ok ? undefined : failed.error._tag).toEqual("RemoteUnavailable");
	expect(paper.tokens.map((token) => token.name)).toHaveLength(4);

	paper.readsBeforeFailure = Number.POSITIVE_INFINITY;
	const next = await expectValue(session.call(syncPush, {}));

	expect(next.applied).toEqual([]);
	expect(next.inbox).toEqual([]);
});
