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
	type ModeValues,
	type Operation,
	paperAdapter,
	type RemoteAdapter,
	RemoteError,
	type RemoteOptions,
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

interface FakeRemoteSettings {
	kind: string;
	/** The modes the target holds. */
	modes: string[];
	/** `name`: the key is the custom property, as on Paper. `id`: the remote assigns an id. */
	keys: "name" | "id";
	/** The mapping of the remote. The default is Paper's. */
	map?: RemoteAdapter["map"];
}

/**
 * An in-memory design file. It keeps the rules that sync depends on: an alias must name an
 * existing token of the same type, a change addresses an existing key, and duplicate names
 * are allowed. With `keys: "name"` it behaves as Paper, whose key is the token name; with
 * `keys: "id"` it assigns ids and keeps them across renames. `store` changes a value as the
 * remote normalizes it.
 */
class FakeRemote {
	tokens: RemoteToken[] = [];
	requests = 0;
	/** Names whose create or update the remote refuses. */
	refuse = new Set<string>();
	store = (value: string) => value;
	/** The number of reads that succeed before every later read fails. */
	readsBeforeFailure = Number.POSITIVE_INFINITY;
	/** The options of the last `resolve`. */
	options: RemoteOptions | undefined;
	/** Accept creates without giving their key, as a faulty adapter would. */
	omitKeys = false;
	private nextId = 1;
	private readonly settings: FakeRemoteSettings;
	readonly adapter: RemoteAdapter;

	constructor(settings: FakeRemoteSettings) {
		this.settings = settings;
		this.adapter = {
			kind: settings.kind,
			// The mapping of the real Paper remote: only the transport is fake.
			map: settings.map ?? paperAdapter().map,
			// A fake of a kind with options takes any.
			checkOptions: () => {},
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
					resolve: async (file, options) => {
						request();
						this.options = options;
						return {
							file: file.replace(/^.*\/file\//, ""),
							fileName: "Tokens",
							modes: settings.modes,
							options,
						};
					},
					read: async () => {
						request();
						if (this.readsBeforeFailure <= 0) {
							throw new RemoteError("RemoteUnavailable", "The remote stopped.");
						}
						this.readsBeforeFailure -= 1;
						return this.tokens.map((token) => ({
							...token,
							values: { ...token.values },
						}));
					},
					apply: async (_target, operations) => {
						request();
						const renamed = new Map<string, string>();
						return operations.map((operation) => this.apply(operation, renamed));
					},
				};
			},
		};
	}

	/** Adds a token as a designer would. A tool with ids may record no custom property. */
	add(name: string, type: string, values: ModeValues, label = name) {
		const key = this.settings.keys === "name" ? name : `V${this.nextId++}`;
		this.tokens.push({ key, label, ...(name ? { name } : {}), type, values });
	}

	byKey = (key: string) => this.tokens.find((token) => token.key === key);

	private find = (key: string) => this.tokens.find((token) => token.key === key);

	private stored = (values: ModeValues): ModeValues =>
		Object.fromEntries(
			Object.entries(values).map(([mode, value]) => [mode, this.store(value)]),
		);

	private apply(operation: Operation, renamed: Map<string, string>): ApplyResult {
		const refused = (message: string): ApplyResult => ({ operation, ok: false, message });
		if (operation.op === "create") {
			if (this.refuse.has(operation.name)) return refused("Refused.");
			for (const value of Object.values(operation.values)) {
				const alias = /^var\((--[\w-]+)\)$/.exec(value)?.[1];
				const target = this.tokens.find((token) => token.name === alias);
				if (alias && target?.type !== operation.type) {
					return refused(`Invalid value "${value}".`);
				}
			}
			const key = this.settings.keys === "name" ? operation.name : `V${this.nextId++}`;
			this.tokens.push({
				key,
				label: operation.name,
				name: operation.name,
				type: operation.type,
				values: this.stored(operation.values),
				description: operation.description,
			});
			return this.omitKeys ? { operation, ok: true } : { operation, ok: true, key };
		}
		const token = this.find(renamed.get(operation.key) ?? operation.key);
		if (!token) return refused("Token not found.");
		switch (operation.op) {
			case "update":
				if (this.refuse.has(operation.name)) return refused("Refused.");
				token.values = this.stored(operation.values);
				return { operation, ok: true, key: token.key };
			case "rename": {
				token.label = operation.to;
				token.name = operation.to;
				if (this.settings.keys === "name") {
					renamed.set(token.key, operation.to);
					token.key = operation.to;
				}
				return { operation, ok: true, key: token.key };
			}
			case "delete":
				this.tokens = this.tokens.filter((candidate) => candidate !== token);
				return { operation, ok: true };
		}
	}

	byName = (name: string) => this.tokens.find((token) => token.name === name);
	value = (name: string) => this.byName(name)?.values.default;
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

/** One color with a `.dark` override, and one `light-dark()` pair. */
const themedConfig = {
	colors: {
		palette: { value: { brand: { 500: "oklch(60% 0.2 250)" } } },
		theme: {
			value: {
				base: {
					value: {
						surface: {
							value: { accent: "var(--brand)" },
							variables: { brand: "palette.brand.500" },
							settings: { variantNameOnly: true },
						},
					},
				},
				night: {
					value: {
						surface: {
							value: { accent: "oklch(30% 0.1 250)" },
							settings: { variantNameOnly: true },
						},
					},
					settings: { selector: ".dark" },
				},
				light: { value: { text: { value: { body: "oklch(20% 0 0)" } } } },
				dark: { value: { text: { value: { body: "oklch(95% 0 0)" } } } },
			},
			settings: { lightDark: { light: "light", dark: "dark" } },
		},
	},
};

let projectDir = "";
let paper: FakeRemote;

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

/** One spacing token, for remotes whose keys the test counts. */
const spacingOnly = (size: string) => ({
	spacing: { custom: { size: { value: { 1: size } } } },
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
	paper = new FakeRemote({ kind: "paper", modes: ["default"], keys: "name" });
	await writeConfig(baseConfig);
});

afterEach(async () => {
	await rm(projectDir, { recursive: true, force: true });
});

const openSession = (remotes: RemoteAdapter[] = [paper.adapter]) =>
	createSession(cssforge, {
		target: "library",
		context: { cwd: projectDir, remotes },
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

const created = (name: string, type: string, value: string, sourcePath: string) => ({
	op: "create",
	name,
	type,
	values: { default: value },
	description: `cssforge: ${sourcePath}`,
});

test("push - creates the configuration tokens on an empty remote, each alias after its target", async () => {
	await using session = openSession();
	await expectValue(
		session.call(syncRemoteAdd, { file: "https://app.paper.design/file/F1" }),
	);

	const report = await expectValue(session.call(syncPush, {}));

	expect(report.applied).toEqual([
		{
			operation: created(
				"--palette-brand-500",
				"color",
				"oklch(60% 0.2 250)",
				"palette.brand.500",
			),
			ok: true,
			key: "--palette-brand-500",
		},
		{
			operation: created(
				"--theme-light-surface-accent",
				"color",
				"var(--palette-brand-500)",
				"theme.light.surface.accent",
			),
			ok: true,
			key: "--theme-light-surface-accent",
		},
		{
			operation: created(
				"--spacing-size-1",
				"spacing",
				"0.25rem",
				"spacing.custom.size.1",
			),
			ok: true,
			key: "--spacing-size-1",
		},
		{
			operation: created(
				"--spacing-size-2",
				"spacing",
				"0.5rem",
				"spacing.custom.size.2",
			),
			ok: true,
			key: "--spacing-size-2",
		},
	]);
	expect(report.operations).toEqual([]);
	expect(report.target).toEqual({
		file: "F1",
		fileName: "Tokens",
		modes: ["default"],
		options: {},
	});
});

test("push - reports each configuration token that has no place on Paper, with the reason", async () => {
	await using session = openSession();
	await expectValue(session.call(syncRemoteAdd, { file: "F1" }));

	const report = await expectValue(session.call(syncPush, { "dry-run": true }));

	expect(report.skipped).toEqual([
		{
			name: "--palette-brand-600",
			sourcePath: "palette.brand.600",
			reason: "Paper does not take color-mix() values.",
		},
		{
			name: "--theme-dark-surface-accent",
			sourcePath: "theme.dark.surface.accent",
			mode: ".dark",
			reason: 'The remote has no mode ".dark". It holds: default.',
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
			key: "--spacing-size-1",
			name: "--spacing-size-1",
			type: "spacing",
			values: { default: "0.375rem" },
			description: "cssforge: spacing.custom.size.1",
		},
		{ op: "delete", key: "--spacing-size-2", label: "--spacing-size-2" },
	]);
	expect(paper.value("--spacing-size-1")).toEqual("0.375rem");
	expect(paper.byName("--spacing-size-2")).toBeUndefined();
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
	const edited = paper.byName("--spacing-size-1");
	if (edited) edited.values = { default: "12px" };

	const held = await expectValue(session.call(syncPush, {}));

	expect(held.applied).toEqual([]);
	expect(held.inbox).toEqual([
		{
			id: "spacing-size-1",
			kind: "edited",
			key: "--spacing-size-1",
			label: "--spacing-size-1",
			type: "spacing",
			remoteValues: { default: "12px" },
			localValues: { default: "0.25rem" },
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
	paper.add("--brand-accent", "color", { default: "oklch(70% 0.2 30)" });

	const fetched = await expectValue(session.call(syncFetch, {}));
	expect(fetched.inbox).toEqual([
		{
			id: "brand-accent",
			kind: "new",
			key: "--brand-accent",
			label: "--brand-accent",
			type: "color",
			remoteValues: { default: "oklch(70% 0.2 30)" },
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
		{ op: "delete", key: "--brand-accent", label: "--brand-accent" },
	]);
	expect(paper.byName("--brand-accent")).toBeUndefined();
	expect(report.inbox).toEqual([]);
});

test("inbox - adopt renames a token the remote created to the name the configuration gives it", async () => {
	await using session = await pushedSession();
	paper.add("--brand-accent", "color", { default: "oklch(70% 0.2 30)" });
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
		{
			op: "rename",
			key: "--brand-accent",
			from: "--brand-accent",
			to: "--palette-brand-accent",
		},
	]);
	expect(paper.value("--palette-brand-accent")).toEqual("oklch(70% 0.2 30)");
	expect(paper.byName("--brand-accent")).toBeUndefined();

	const after = await expectValue(session.call(syncPush, {}));
	expect(after.applied).toEqual([]);
	expect(after.inbox).toEqual([]);
});

test("inbox - adopt with a new value renames the token, then updates it under its new key", async () => {
	await using session = await pushedSession();
	paper.add("--brand-accent", "color", { default: "oklch(70% 0.2 30)" });
	await expectValue(session.call(syncFetch, {}));
	await writeConfig(withAccent("oklch(72% 0.2 30)"));
	await expectValue(
		session.call(syncInboxAdopt, { item: "brand-accent", path: "palette.brand.accent" }),
	);

	const report = await expectValue(session.call(syncPush, {}));

	expect(report.applied.map(({ operation, ok }) => [operation.op, ok])).toEqual([
		["rename", true],
		["update", true],
	]);
	expect(paper.value("--palette-brand-accent")).toEqual("oklch(72% 0.2 30)");
	const after = await expectValue(session.call(syncPush, {}));
	expect(after.applied).toEqual([]);
});

test("push - an operation the remote refuses is reported and sent again at the next push", async () => {
	await using session = openSession();
	await expectValue(session.call(syncRemoteAdd, { file: "F1" }));
	paper.refuse.add("--spacing-size-2");

	const first = await expectValue(session.call(syncPush, {}));

	expect(first.applied.find(({ ok }) => !ok)).toEqual({
		operation: created("--spacing-size-2", "spacing", "0.5rem", "spacing.custom.size.2"),
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

test("remote add - binding the same target again keeps the sync state", async () => {
	await using session = await pushedSession();

	await expectValue(session.call(syncRemoteAdd, { file: "F1" }));

	const kept = await expectValue(session.call(syncPlan, {}));
	expect(kept.operations).toEqual([]);
});

test("remote add - binding another file starts the sync again", async () => {
	await using session = await pushedSession();

	await expectValue(session.call(syncRemoteAdd, { file: "F2" }));

	const restarted = await session.call(syncPlan, {});
	expect(restarted.ok ? undefined : restarted.error._tag).toEqual("NotFetched");
});

test("remote add - binding the same file with other options starts the sync again", async () => {
	await using session = await pushedSession();

	await expectValue(
		session.call(syncRemoteAdd, { file: "F1", options: { collection: "Brand" } }),
	);

	expect(paper.options).toEqual({ collection: "Brand" });
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
	paper.add("--brand-accent", "color", { default: "oklch(70% 0.2 30)" });
	paper.add("--accent", "color", { default: "oklch(70% 0.2 30)" });
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
	expect(paper.tokens).toHaveLength(4);

	paper.readsBeforeFailure = Number.POSITIVE_INFINITY;
	const next = await expectValue(session.call(syncPush, {}));

	expect(next.applied).toEqual([]);
	expect(next.inbox).toEqual([]);
});

test("modes - a remote with modes gets one token per custom property, with a value for each mode", async () => {
	const figma = new FakeRemote({
		kind: "figma",
		modes: ["default", ".dark", "light", "dark"],
		keys: "id",
	});
	await writeConfig(themedConfig);
	await using session = openSession([figma.adapter]);
	await expectValue(
		session.call(syncRemoteAdd, {
			kind: "figma",
			file: "F1",
			options: { collection: "Tokens" },
		}),
	);

	const report = await expectValue(session.call(syncPush, {}));

	expect(report.applied).toEqual([
		{
			operation: created(
				"--palette-brand-500",
				"color",
				"oklch(60% 0.2 250)",
				"palette.brand.500",
			),
			ok: true,
			key: "V1",
		},
		{
			operation: {
				op: "create",
				name: "--accent",
				type: "color",
				values: { default: "var(--palette-brand-500)", ".dark": "oklch(30% 0.1 250)" },
				description: "cssforge: theme.base.surface.accent",
			},
			ok: true,
			key: "V2",
		},
		{
			operation: {
				op: "create",
				name: "--theme-text-body",
				type: "color",
				values: { light: "oklch(20% 0 0)", dark: "oklch(95% 0 0)" },
				description: "cssforge: theme.text.body",
			},
			ok: true,
			key: "V3",
		},
	]);
	expect(report.skipped).toEqual([]);
	expect(report.target.options).toEqual({ collection: "Tokens" });
	const after = await expectValue(session.call(syncPush, {}));
	expect(after.applied).toEqual([]);
});

test("modes - a token a designer renames keeps its link to the configuration through its key", async () => {
	const figma = new FakeRemote({ kind: "figma", modes: ["default"], keys: "id" });
	await writeConfig(spacingOnly("4px"));
	await using session = openSession([figma.adapter]);
	await expectValue(session.call(syncRemoteAdd, { kind: "figma", file: "F1" }));
	await expectValue(session.call(syncPush, {}));
	const token = figma.byName("--spacing-size-1");
	if (token) {
		token.label = "spacing/size/1";
		delete token.name;
	}
	await writeConfig(spacingOnly("6px"));

	const report = await expectValue(session.call(syncPush, {}));

	expect(report.inbox).toEqual([]);
	expect(report.applied.map(({ operation }) => operation)).toEqual([
		{
			op: "update",
			key: "V1",
			name: "--spacing-size-1",
			type: "spacing",
			values: { default: "0.375rem" },
			description: "cssforge: spacing.custom.size.1",
		},
	]);
	expect(figma.byKey("V1")?.values).toEqual({ default: "0.375rem" });
});

test("inbox - items that share a label get distinct ids, and a decision settles only its own", async () => {
	const figma = new FakeRemote({ kind: "figma", modes: ["default"], keys: "id" });
	await writeConfig(spacingOnly("4px"));
	await using session = openSession([figma.adapter]);
	await expectValue(session.call(syncRemoteAdd, { kind: "figma", file: "F1" }));
	await expectValue(session.call(syncPush, {}));
	figma.add("", "color", { default: "#ff0000" }, "brand");
	figma.add("", "color", { default: "#00ff00" }, "brand");

	const fetched = await expectValue(session.call(syncFetch, {}));
	expect(fetched.inbox.map((item) => item.id)).toEqual(["brand#V2", "brand#V3"]);

	await expectValue(session.call(syncInboxReject, { item: "brand#V2" }));
	await expectValue(session.call(syncPush, {}));

	expect(figma.byKey("V2")).toBeUndefined();
	expect(figma.byKey("V3")?.values).toEqual({ default: "#00ff00" });
});

test("push - a create the remote accepts without a key is refused, and the state stays readable", async () => {
	await using session = openSession();
	await expectValue(session.call(syncRemoteAdd, { file: "F1" }));
	paper.omitKeys = true;

	const report = await expectValue(session.call(syncPush, {}));

	expect(report.applied.every(({ ok }) => !ok)).toEqual(true);
	expect(report.applied[0]?.message).toEqual(
		"The remote accepted the change but gave no key for the token.",
	);
	paper.omitKeys = false;
	const next = await expectValue(session.call(syncFetch, {}));
	expect(next.inbox.map((item) => item.kind)).toEqual([
		"collision",
		"collision",
		"collision",
		"collision",
	]);
});

test("modes - a selector with a | is a mode name kept whole", async () => {
	const figma = new FakeRemote({
		kind: "figma",
		modes: ["default", "[lang|=en]"],
		keys: "id",
	});
	await writeConfig({
		colors: {
			palette: { value: {} },
			theme: {
				value: {
					base: {
						value: {
							surface: {
								value: { accent: "#000000" },
								settings: { variantNameOnly: true },
							},
						},
					},
					english: {
						value: {
							surface: {
								value: { accent: "#ffffff" },
								settings: { variantNameOnly: true },
							},
						},
						settings: { selector: "[lang|=en]" },
					},
				},
			},
		},
	});
	await using session = openSession([figma.adapter]);
	await expectValue(session.call(syncRemoteAdd, { kind: "figma", file: "F1" }));

	const report = await expectValue(session.call(syncPush, {}));

	expect(report.skipped).toEqual([]);
	expect(figma.byName("--accent")?.values).toEqual({
		default: "#000000",
		"[lang|=en]": "#ffffff",
	});
});

test("modes - each mode of a paired color gets its own branch of every light-dark() it builds on", async () => {
	const figma = new FakeRemote({
		kind: "figma",
		modes: ["default", "light", "dark"],
		keys: "id",
		map: (token) => ({ type: "color", value: token.resolvedValue }),
	});
	const hover = { mix: { from: "theme.background.primary", with: "black", amount: 5 } };
	await writeConfig({
		colors: {
			palette: {
				value: { base: { white: "oklch(100% 0 0)", ink: "oklch(14.5% 0 0)" } },
			},
			theme: {
				value: {
					light: {
						value: {
							background: {
								value: { primary: "var(--white)", hover },
								variables: { white: "palette.base.white" },
							},
						},
					},
					dark: {
						value: {
							background: {
								value: { primary: "var(--ink)", hover },
								variables: { ink: "palette.base.ink" },
							},
						},
					},
				},
				settings: { lightDark: { light: "light", dark: "dark" } },
			},
		},
	});
	await using session = openSession([figma.adapter]);
	await expectValue(session.call(syncRemoteAdd, { kind: "figma", file: "F1" }));

	await expectValue(session.call(syncPush, {}));

	expect(figma.byName("--theme-background-hover")?.values).toEqual({
		light: "color-mix(in oklch, oklch(100% 0 none), black 5%)",
		dark: "color-mix(in oklch, oklch(14.5% 0 none), black 5%)",
	});
});
