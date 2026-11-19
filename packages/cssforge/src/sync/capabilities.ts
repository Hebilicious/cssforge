/**
 * The token sync capabilities: they keep the tokens of a design tool (a remote) in sync
 * with a CSS Forge configuration. The configuration is the source of truth. What the
 * remote changes waits in an inbox until a decision settles it.
 *
 * @module
 */

import { resolve } from "node:path";
import type { Capability, Result } from "@acid-cat/core-ts";
import { capabilitiesFor, fail, ok } from "@acid-cat/core-ts";
import { z } from "zod";
import type { ForgeContext } from "../capabilities.ts";
import { defaultConfigPath, ForgeError, listConfigTokens } from "../forge.ts";
import { desiredTokens, type SkippedToken } from "./modes.ts";
import { paperAdapter } from "./paper.ts";
import {
	type BaseEntry,
	type Decision,
	type DesiredToken,
	type InboxItem,
	type Operation,
	planSync,
	type RemoteToken,
	type SyncPlan,
} from "./plan.ts";
import {
	type ApplyResult,
	type RemoteAdapter,
	RemoteError,
	type RemoteOptions,
	type RemoteSession,
	type RemoteTarget,
} from "./remote.ts";
import {
	REMOTE_NAME,
	readState,
	StateError,
	type SyncState,
	statePath,
	writeState,
} from "./state.ts";

// --- Types ---------------------------------------------------------------------------------

/** The members of every sync input, with the defaults filled in. */
export interface SyncInput {
	config: string;
	root?: string;
	remote: string;
}

/** The input of `sync.remote.add`. */
export interface RemoteAddInput {
	root?: string;
	name: string;
	kind: string;
	file: string;
	options: RemoteOptions;
}

/** The input of `sync.push`. */
export interface PushInput extends SyncInput {
	"dry-run": boolean;
}

/** The input of `sync.inbox.adopt`. */
export interface AdoptInput extends SyncInput {
	item: string;
	path: string;
}

/** The input of `sync.inbox.reject` and `sync.inbox.overwrite`. */
export interface ItemInput extends SyncInput {
	item: string;
}

export type { SkippedToken };

/** The plan of a sync, as the capabilities report it. */
export interface SyncReport {
	remote: string;
	target: RemoteTarget;
	/** When the remote tokens were read. */
	fetchedAt: string;
	/** The changes the next push sends. */
	operations: Operation[];
	inbox: InboxItem[];
	skipped: SkippedToken[];
	/** The requests made to the remote by this call. */
	callsUsed: number;
}

/** The report of `sync.push`. */
export interface PushReport extends SyncReport {
	/** What the remote did with each operation. Empty for a dry run. */
	applied: ApplyResult[];
}

/** The report of `sync.remote.add`. */
export interface RemoteAddReport {
	remote: string;
	kind: string;
	target: RemoteTarget;
	/** The absolute path of the state file. */
	state: string;
	callsUsed: number;
}

/** The report of a decision. */
export interface DecisionReport {
	remote: string;
	decision: Decision;
	/** The items that still wait for a decision. */
	inbox: InboxItem[];
	skipped: SkippedToken[];
	/** The requests made to the remote by this call: always 0. */
	callsUsed: number;
}

/** A failure of a sync capability. */
export interface SyncFailure<Tag extends string> {
	_tag: Tag;
	message: string;
	/** The file that the failure concerns. */
	path?: string;
}

type ReadTags =
	| "ConfigLoadFailed"
	| "InvalidConfig"
	| "RemoteNotConfigured"
	| "InvalidState";
type RemoteTags = "RemoteUnavailable" | "RemoteFailed";

/** The failures of the capabilities that read the configuration and the state. */
export type SyncReadFailures = { [Tag in ReadTags]: SyncFailure<Tag> };
/** The failures of the capabilities that also call the remote. */
export type SyncRemoteFailures = SyncReadFailures & {
	[Tag in RemoteTags]: SyncFailure<Tag>;
};
/** The failures of `sync.plan` and `sync.inbox.list`. */
export type SyncPlanFailures = SyncReadFailures & {
	NotFetched: SyncFailure<"NotFetched">;
};
/** The failures of `sync.remote.add`. */
export type RemoteAddFailures = {
	[Tag in RemoteTags | "UnknownKind" | "InvalidOptions"]: SyncFailure<Tag>;
};
/** The failures of a decision. */
export type DecisionFailures = SyncPlanFailures & {
	UnknownItem: SyncFailure<"UnknownItem">;
	InvalidDecision: SyncFailure<"InvalidDecision">;
};

// --- Schemas -------------------------------------------------------------------------------

const rootSchema = z
	.string()
	.min(1)
	.optional()
	.describe(
		"The directory that the configuration path and the state directory .cssforge/sync resolve against. The default is the working directory.",
	);

const remoteSchema = z
	.string()
	.regex(REMOTE_NAME, "A remote name is lowercase words joined by hyphens, e.g. paper.")
	.default("paper")
	.describe("The name of the remote, as `sync remote add --name` gave it.");

const syncShape = {
	config: z
		.string()
		.min(1)
		.default(defaultConfigPath)
		.describe("The path of the configuration file."),
	root: rootSchema,
	remote: remoteSchema,
};

const itemSchema = z
	.string()
	.min(1)
	.describe(
		"The id of the inbox item, made from the name of the token on the remote: brand-accent for --brand-accent.",
	);

const syncInput = z.strictObject(syncShape);
const pushInput = z.strictObject({
	...syncShape,
	"dry-run": z
		.boolean()
		.default(false)
		.describe("Read the remote and report the plan, but send nothing."),
});
const adoptInput = z.strictObject({
	...syncShape,
	item: itemSchema,
	path: z
		.string()
		.min(1)
		.describe(
			"The token path of the configuration token that the item becomes, added to the configuration before this call, e.g. palette.brand.accent. It is the path in the description of each pushed token (cssforge: <path>).",
		),
});
const itemInput = z.strictObject({ ...syncShape, item: itemSchema });
const remoteAddInput = z.strictObject({
	root: rootSchema,
	name: remoteSchema,
	kind: z.string().min(1).default("paper").describe("The kind of remote, e.g. paper."),
	file: z
		.string()
		.min(1)
		.describe("The file of the remote that the tokens sync with: its id or its URL."),
	options: z
		.record(z.string(), z.string())
		.default({})
		.describe(
			'The options of the kind of remote, as JSON, e.g. {"collection":"Tokens"}. Paper takes none.',
		),
});

const modeValuesSchema = z
	.record(z.string(), z.string())
	.describe("A value for each mode: default for :root, light and dark, or a selector.");

const targetSchema = z
	.strictObject({
		file: z.string().describe("The id of the file on the remote."),
		fileName: z.string(),
		modes: z.array(z.string()).describe("The modes the target holds."),
		options: z.record(z.string(), z.string()),
	})
	.describe("The part of the remote the tokens sync with.");

const operationSchema = z
	.discriminatedUnion("op", [
		z.strictObject({
			op: z.literal("create"),
			name: z.string(),
			type: z.string(),
			values: modeValuesSchema,
			description: z.string(),
		}),
		z.strictObject({
			op: z.literal("update"),
			key: z.string(),
			name: z.string(),
			type: z.string(),
			values: modeValuesSchema,
			description: z.string(),
		}),
		z.strictObject({
			op: z.literal("rename"),
			key: z.string(),
			from: z.string(),
			to: z.string(),
		}),
		z.strictObject({ op: z.literal("delete"), key: z.string(), label: z.string() }),
	])
	.describe("A change to send to the remote, which addresses a remote token by its key.");

const decisionSchema = z.discriminatedUnion("action", [
	z.strictObject({
		item: z.string(),
		key: z.string(),
		action: z.literal("adopt"),
		path: z.string(),
	}),
	z.strictObject({ item: z.string(), key: z.string(), action: z.literal("reject") }),
	z.strictObject({ item: z.string(), key: z.string(), action: z.literal("overwrite") }),
]);

const inboxItemSchema = z
	.strictObject({
		id: z.string(),
		kind: z.enum(["new", "edited", "deleted", "collision"]),
		key: z
			.string()
			.describe("The key of the token on the remote, or the key a deleted token had."),
		label: z.string().describe("The name of the token on the remote."),
		type: z.string(),
		remoteValues: modeValuesSchema.optional(),
		localValues: modeValuesSchema.optional(),
		actions: z.array(z.enum(["adopt", "reject", "overwrite"])),
		note: z.string().optional(),
	})
	.describe(
		"A change of the remote that waits for a decision. new: adopt or reject. edited, deleted and collision: overwrite with the value of the configuration.",
	);

const reportShape = {
	remote: z.string(),
	target: targetSchema,
	fetchedAt: z
		.string()
		.describe("When the remote tokens were read, as an ISO 8601 time."),
	operations: z
		.array(operationSchema)
		.describe("The changes the next push sends, in order."),
	inbox: z.array(inboxItemSchema),
	skipped: z
		.array(
			z.strictObject({
				name: z.string(),
				sourcePath: z.string(),
				mode: z.string().optional(),
				reason: z.string(),
			}),
		)
		.describe(
			"Configuration tokens, or modes of them, that have no place on the remote. A token with a mode listed here still syncs its other modes.",
		),
	callsUsed: z.number().int().describe("The requests made to the remote by this call."),
};

const syncReport = z.strictObject(reportShape);
const pushReport = z.strictObject({
	...reportShape,
	applied: z
		.array(
			z.strictObject({
				operation: operationSchema,
				ok: z.boolean(),
				message: z.string().optional(),
				key: z.string().optional().describe("The key of the token after the operation."),
			}),
		)
		.describe("What the remote did with each operation. Empty for a dry run."),
});
const remoteAddReport = z.strictObject({
	remote: z.string(),
	kind: z.string(),
	target: targetSchema,
	state: z.string().describe("The absolute path of the state file."),
	callsUsed: z.number().int(),
});
const decisionReport = z.strictObject({
	remote: z.string(),
	decision: decisionSchema,
	inbox: z.array(inboxItemSchema).describe("The items that still wait for a decision."),
	skipped: reportShape.skipped,
	callsUsed: z
		.number()
		.int()
		.describe("The requests made to the remote by this call: always 0."),
});

const failureSchema = <Tag extends string>(tag: Tag, description: string) =>
	z.strictObject({
		_tag: z.literal(tag).describe(description),
		message: z.string(),
		path: z.string().optional().describe("The file that the failure concerns."),
	});

const readFailures = {
	ConfigLoadFailed: failureSchema(
		"ConfigLoadFailed",
		"The configuration file could not be found or evaluated.",
	),
	InvalidConfig: failureSchema(
		"InvalidConfig",
		"CSS Forge rejects a value of the configuration.",
	),
	RemoteNotConfigured: failureSchema(
		"RemoteNotConfigured",
		"The remote has no state file: add it with `cssforge sync remote add`.",
	),
	InvalidState: failureSchema(
		"InvalidState",
		"The state file of the remote is not valid.",
	),
};
const remoteFailures = {
	RemoteUnavailable: failureSchema(
		"RemoteUnavailable",
		"The remote cannot be reached: its program is not installed or not running.",
	),
	RemoteFailed: failureSchema(
		"RemoteFailed",
		"The remote refused a request or answered in an unknown form.",
	),
};
const notFetched = {
	NotFetched: failureSchema(
		"NotFetched",
		"The remote has not been read yet: run `cssforge sync fetch` first.",
	),
};
const decisionFailures = {
	...readFailures,
	...notFetched,
	UnknownItem: failureSchema("UnknownItem", "The inbox has no item with this id."),
	InvalidDecision: failureSchema(
		"InvalidDecision",
		"The decision does not settle the item, or the adopted path does not fit.",
	),
};

// --- Operations ----------------------------------------------------------------------------

/** The adapters a context gives, or the Paper adapter. */
const adaptersOf = (context: ForgeContext): readonly RemoteAdapter[] =>
	context.remotes ?? [paperAdapter()];

const rootOf = (context: ForgeContext, input: { root?: string }) =>
	resolve(context.cwd, input.root ?? ".");

/** A failure of a sync operation, before it becomes a typed failure. */
class SyncError extends Error {
	readonly tag: string;

	constructor(tag: string, message: string) {
		super(message);
		this.name = "SyncError";
		this.tag = tag;
	}
}

/** Runs an operation, and gives every known error as a failure. Other errors are defects. */
async function attempt<Value, Failure extends { readonly _tag: string }>(
	operation: () => Promise<Value>,
): Promise<Result<Value, Failure>> {
	try {
		return ok(await operation());
	} catch (error) {
		if (
			error instanceof ForgeError ||
			error instanceof StateError ||
			error instanceof RemoteError ||
			error instanceof SyncError
		) {
			const path =
				"path" in error && typeof error.path === "string" ? error.path : undefined;
			const failure = {
				_tag: error.tag,
				message: error.message,
				...(path === undefined ? {} : { path }),
			};
			// The tag is only known at run time. Each capability declares every tag its
			// operation can throw in its failures schema, and the session validates the
			// failure against that schema.
			return fail(failure as unknown as Failure);
		}
		throw error;
	}
}

const adapterOf = (context: ForgeContext, kind: string): RemoteAdapter => {
	const adapter = adaptersOf(context).find((candidate) => candidate.kind === kind);
	if (!adapter) {
		const kinds = adaptersOf(context).map((candidate) => candidate.kind);
		throw new SyncError(
			"UnknownKind",
			`There is no remote kind "${kind}". Known kinds: ${kinds.join(", ")}.`,
		);
	}
	return adapter;
};

interface Loaded {
	root: string;
	state: SyncState;
	adapter: RemoteAdapter;
	desired: DesiredToken[];
	skipped: SkippedToken[];
}

async function load(context: ForgeContext, input: SyncInput): Promise<Loaded> {
	const root = rootOf(context, input);
	const state = await readState(root, input.remote);
	const adapter = adaptersOf(context).find((candidate) => candidate.kind === state.kind);
	if (!adapter) {
		throw new StateError(
			"InvalidState",
			`The state file names the remote kind "${state.kind}", which this version of cssforge does not know.`,
			statePath(root, input.remote),
		);
	}
	const tokens = await listConfigTokens(resolve(root, input.config));
	return { root, state, adapter, ...desiredTokens(tokens, adapter, state.target.modes) };
}

const fetchedOf = (state: SyncState, remote: string) => {
	if (state.fetched === null) {
		throw new SyncError(
			"NotFetched",
			`The remote "${remote}" has not been read yet. Run \`cssforge sync fetch --remote ${remote}\`.`,
		);
	}
	return state.fetched;
};

const planOf = (loaded: Loaded, remote: readonly RemoteToken[]): SyncPlan =>
	planSync({
		desired: loaded.desired,
		skipped: skippedNames(loaded),
		remote,
		base: loaded.state.base,
		decisions: loaded.state.decisions,
	});

/** The configuration tokens that have no mode on the remote at all. */
const skippedNames = (loaded: Loaded): Set<string> => {
	const desired = new Set(loaded.desired.map((token) => token.name));
	return new Set(
		loaded.skipped.flatMap((token) => (desired.has(token.name) ? [] : [token.name])),
	);
};

const reportOf = (
	input: SyncInput,
	loaded: Loaded,
	plan: SyncPlan,
	fetchedAt: string,
	callsUsed: number,
): SyncReport => ({
	remote: input.remote,
	target: loaded.state.target,
	fetchedAt,
	operations: plan.operations.map((planned) => planned.operation),
	inbox: plan.inbox,
	skipped: loaded.skipped,
	callsUsed,
});

/** Opens a session on the remote, runs `use`, and closes the session. */
async function withSession<T>(
	adapter: RemoteAdapter,
	signal: AbortSignal,
	use: (session: RemoteSession) => Promise<T>,
): Promise<T> {
	const session = await adapter.open(signal);
	try {
		return await use(session);
	} finally {
		session.close();
	}
}

/** Reads the remote and records the fetch in the state. */
async function fetchRemote(loaded: Loaded, session: RemoteSession, remote: string) {
	const tokens = await session.read(loaded.state.target);
	const fetched = { at: new Date().toISOString(), tokens };
	loaded.state = { ...loaded.state, fetched };
	await writeState(loaded.root, remote, loaded.state);
	return fetched;
}

/** The plan against the last fetch, with no request to the remote. */
const planFromFetch = (input: SyncInput, context: ForgeContext) =>
	attempt<SyncReport, SyncPlanFailures[keyof SyncPlanFailures]>(async () => {
		const loaded = await load(context, input);
		const fetched = fetchedOf(loaded.state, input.remote);
		return reportOf(input, loaded, planOf(loaded, fetched.tokens), fetched.at, 0);
	});

// --- Capabilities ----------------------------------------------------------------------------

const capability = capabilitiesFor<ForgeContext>();
const everyone = ["cli", "mcp", "library"];

/** `cssforge sync remote add`: bind a remote file to the configuration. */
export const syncRemoteAdd: Capability<
	ForgeContext,
	RemoteAddInput,
	RemoteAddReport,
	RemoteAddFailures,
	never,
	"sync.remote.add",
	Partial<RemoteAddInput>
> = capability({
	id: "sync.remote.add",
	description:
		"Bind a file of a design tool to the configuration as a remote, so that the token sync commands read and write that file only. Checks that the remote can open the file with the options (one request), and writes .cssforge/sync/<name>.json. Binding the same file with the same options again keeps the sync state; binding another target starts the sync again.",
	audience: everyone,
	destructive: true,
	idempotent: true,
	input: remoteAddInput,
	output: remoteAddReport,
	failures: {
		...remoteFailures,
		UnknownKind: failureSchema("UnknownKind", "The kind of remote is not known."),
		InvalidOptions: failureSchema(
			"InvalidOptions",
			"The kind of remote does not take the options.",
		),
	},
	run: (input, { context, signal }) =>
		attempt(async () => {
			const root = rootOf(context, input);
			const adapter = adapterOf(context, input.kind);
			adapter.checkOptions(input.options);
			return withSession(adapter, signal, async (session) => {
				const target = await session.resolve(input.file, input.options);
				const previous = await readState(root, input.name).catch(() => undefined);
				const kept =
					previous?.kind === input.kind && sameTarget(previous.target, target)
						? previous
						: undefined;
				const state: SyncState = kept
					? { ...kept, target }
					: {
							version: 1,
							kind: input.kind,
							target,
							base: [],
							fetched: null,
							decisions: [],
						};
				const path = await writeState(root, input.name, state);
				return {
					remote: input.name,
					kind: input.kind,
					target,
					state: path,
					callsUsed: session.calls,
				};
			});
		}),
});

/** `cssforge sync fetch`: read the remote and report the plan. */
export const syncFetch: Capability<
	ForgeContext,
	SyncInput,
	SyncReport,
	SyncRemoteFailures,
	never,
	"sync.fetch",
	Partial<SyncInput>
> = capability({
	id: "sync.fetch",
	description:
		"Read the tokens of the remote (one request), record them in the state file, and report the plan: the changes the next push sends, the inbox of changes the remote made, and the configuration tokens that have no place on the remote. Sends nothing to the remote.",
	audience: everyone,
	destructive: false,
	idempotent: true,
	input: syncInput,
	output: syncReport,
	failures: { ...readFailures, ...remoteFailures },
	run: (input, { context, signal }) =>
		attempt(async () => {
			const loaded = await load(context, input);
			return withSession(loaded.adapter, signal, async (session) => {
				const fetched = await fetchRemote(loaded, session, input.remote);
				return reportOf(
					input,
					loaded,
					planOf(loaded, fetched.tokens),
					fetched.at,
					session.calls,
				);
			});
		}),
});

/** `cssforge sync plan`: the plan against the last fetch, with no request. */
export const syncPlan: Capability<
	ForgeContext,
	SyncInput,
	SyncReport,
	SyncPlanFailures,
	never,
	"sync.plan",
	Partial<SyncInput>
> = capability({
	id: "sync.plan",
	description:
		"Report the plan against the tokens of the last fetch, with no request to the remote: the changes the next push sends, the inbox, and the configuration tokens that have no place on the remote. Use it after a change of the configuration or a decision.",
	audience: everyone,
	readOnly: true,
	input: syncInput,
	output: syncReport,
	failures: { ...readFailures, ...notFetched },
	run: (input, { context }) => planFromFetch(input, context),
});

/** `cssforge sync push`: read the remote, then send the plan. */
export const syncPush: Capability<
	ForgeContext,
	PushInput,
	PushReport,
	SyncRemoteFailures,
	never,
	"sync.push",
	Partial<PushInput>
> = capability({
	id: "sync.push",
	description:
		"Read the remote, then send the changes of the plan: create and update the tokens of the configuration, delete the ones removed from it, and carry out the decisions on inbox items. Items without a decision stay in the inbox, and their tokens are not changed. One request to read, up to two to write and one to read the stored values back; only the first when the plan is empty.",
	audience: everyone,
	destructive: true,
	idempotent: true,
	input: pushInput,
	output: pushReport,
	failures: { ...readFailures, ...remoteFailures },
	run: (input, { context, signal }) =>
		attempt(async () => {
			const loaded = await load(context, input);
			return withSession(loaded.adapter, signal, async (session) => {
				const fetched = await fetchRemote(loaded, session, input.remote);
				const plan = planOf(loaded, fetched.tokens);
				const operations = plan.operations.map((planned) => planned.operation);
				const applied =
					input["dry-run"] || operations.length === 0
						? []
						: withKeys(
								await session.apply(
									loaded.state.target,
									operations,
									keysOf(loaded.state),
								),
							);
				if (!input["dry-run"] && applied.length === 0) {
					const next = settle(loaded.state, plan, applied, fetched.tokens);
					await writeState(loaded.root, input.remote, next);
				}
				if (!input["dry-run"] && applied.length > 0) {
					// Record what the remote accepted before anything else can fail.
					const accepted = settle(loaded.state, plan, applied, null);
					await writeState(loaded.root, input.remote, accepted);
					// Then read the tokens back, so that the base records each value as the remote
					// stored it. Without this, a change made on the remote before the next fetch
					// would read as the remote's own form of the value.
					const stored = await session.read(loaded.state.target);
					const next = settle(loaded.state, plan, applied, stored);
					await writeState(loaded.root, input.remote, next);
				}
				const report = reportOf(input, loaded, plan, fetched.at, session.calls);
				return {
					...report,
					operations: input["dry-run"] ? report.operations : refused(operations, applied),
					applied,
				};
			});
		}),
});

/** The operations that the remote refused, which the next push sends again. */
const refused = (operations: readonly Operation[], applied: readonly ApplyResult[]) =>
	operations.filter((_, index) => applied[index]?.ok !== true);

/** The key of each custom property the remote has: from the fetch, then from the base. */
const keysOf = (state: SyncState): Map<string, string> => {
	const keys = new Map<string, string>();
	for (const token of state.fetched?.tokens ?? []) {
		if (token.name !== undefined) keys.set(token.name, token.key);
	}
	for (const entry of state.base) keys.set(entry.name, entry.key);
	return keys;
};

/**
 * The results of a push, with each create or rename that the remote accepted without a key
 * counted as refused: without the key, the configuration cannot own the token. The next fetch
 * shows such a token as a collision.
 */
const withKeys = (applied: readonly ApplyResult[]): ApplyResult[] =>
	applied.map((result) =>
		result.ok &&
		(result.operation.op === "create" || result.operation.op === "rename") &&
		!result.key
			? {
					operation: result.operation,
					ok: false,
					message: "The remote accepted the change but gave no key for the token.",
				}
			: result,
	);

/** Whether two targets are the same file with the same options. */
const sameTarget = (left: RemoteTarget, right: RemoteTarget): boolean =>
	left.file === right.file &&
	JSON.stringify(Object.entries(left.options).sort()) ===
		JSON.stringify(Object.entries(right.options).sort());

/** The key of the remote token that an operation addresses, before it runs. */
const keyOf = (operation: Operation): string | undefined =>
	operation.op === "create" ? undefined : operation.key;

/**
 * The state after a push. `stored` is the remote read back after the push, or `null` when it
 * is not read yet: the stored values stay unknown, and the fetch is cleared because it is
 * older than the push.
 */
function settle(
	state: SyncState,
	plan: SyncPlan,
	applied: readonly ApplyResult[],
	stored: readonly RemoteToken[] | null,
): SyncState {
	const previousByName = new Map(state.base.map((entry) => [entry.name, entry]));
	const previousByKey = new Map(state.base.map((entry) => [entry.key, entry]));
	const base = new Map(plan.carried.map((entry) => [entry.name, entry]));
	const decisions = [...plan.pending];
	const decisionByKey = new Map(
		state.decisions.map((decision) => [decision.key, decision]),
	);
	/** The key each token has after the operations so far, for a result that gives none. */
	const keyByName = new Map<string, string>();

	plan.operations.forEach((planned, index) => {
		const result = applied[index];
		if (result?.ok === true) {
			if (planned.replaces !== undefined) base.delete(planned.replaces);
			if (planned.base) {
				const key = result.key ?? keyByName.get(planned.base.name) ?? planned.base.key;
				keyByName.set(planned.base.name, key);
				base.set(planned.base.name, { ...planned.base, key });
			}
			return;
		}
		const key = keyOf(planned.operation);
		const kept =
			(planned.replaces === undefined
				? undefined
				: previousByName.get(planned.replaces)) ??
			(key === undefined ? undefined : previousByKey.get(key));
		if (kept) base.set(kept.name, kept);
		const decision =
			planned.settles === undefined ? undefined : decisionByKey.get(planned.settles);
		if (decision && !decisions.includes(decision)) decisions.push(decision);
	});

	if (stored === null) {
		return { ...state, base: [...base.values()], fetched: null, decisions };
	}
	const storedByKey = new Map(stored.map((token) => [token.key, token.values]));
	const recorded = [...base.values()].map((entry) =>
		entry.stored === null
			? { ...entry, stored: storedByKey.get(entry.key) ?? null }
			: entry,
	);
	return {
		...state,
		base: recorded,
		fetched: { at: new Date().toISOString(), tokens: [...stored] },
		decisions,
	};
}

/** `cssforge sync inbox list`: the items that wait for a decision. */
export const syncInboxList: Capability<
	ForgeContext,
	SyncInput,
	SyncReport,
	SyncPlanFailures,
	never,
	"sync.inbox.list",
	Partial<SyncInput>
> = capability({
	id: "sync.inbox.list",
	description:
		"List the inbox against the last fetch, with no request to the remote: the tokens the remote created, changed or deleted, each with the decisions that settle it. Settle a new token with `sync inbox adopt` (after adding it to the configuration) or `sync inbox reject`, and the others with `sync inbox overwrite`.",
	audience: everyone,
	readOnly: true,
	input: syncInput,
	output: syncReport,
	failures: { ...readFailures, ...notFetched },
	run: (input, { context }) => planFromFetch(input, context),
});

/** An answer to an inbox item, before it is recorded with the item's id and key. */
type Answer =
	| { action: "adopt"; path: string }
	| { action: "reject" }
	| { action: "overwrite" };

/** Records a decision on an item of the inbox of the last fetch. */
async function decide(
	context: ForgeContext,
	input: SyncInput & { item: string },
	answer: Answer,
	check: (item: InboxItem, loaded: Loaded) => void,
): Promise<DecisionReport> {
	const loaded = await load(context, input);
	const fetched = fetchedOf(loaded.state, input.remote);
	const plan = planOf(loaded, fetched.tokens);
	const item = plan.inbox.find((candidate) => candidate.id === input.item);
	if (!item) {
		const ids = plan.inbox.map((candidate) => candidate.id);
		throw new SyncError(
			"UnknownItem",
			`The inbox has no item "${input.item}".${ids.length > 0 ? ` Items: ${ids.join(", ")}.` : " The inbox is empty."}`,
		);
	}
	if (!item.actions.includes(answer.action)) {
		throw new SyncError(
			"InvalidDecision",
			`The ${item.kind} item "${item.id}" is settled with ${item.actions.join(" or ")}, not ${answer.action}.`,
		);
	}
	check(item, loaded);
	const decision: Decision = { item: item.id, key: item.key, ...answer };
	const decisions = [
		...loaded.state.decisions.filter((entry) => entry.key !== item.key),
		decision,
	];
	loaded.state = { ...loaded.state, decisions };
	await writeState(loaded.root, input.remote, loaded.state);
	const next = planOf(loaded, fetched.tokens);
	return {
		remote: input.remote,
		decision,
		inbox: next.inbox,
		skipped: loaded.skipped,
		callsUsed: 0,
	};
}

/** `cssforge sync inbox adopt`: make a new remote token a token of the configuration. */
export const syncInboxAdopt: Capability<
	ForgeContext,
	AdoptInput,
	DecisionReport,
	DecisionFailures,
	never,
	"sync.inbox.adopt",
	Partial<AdoptInput>
> = capability({
	id: "sync.inbox.adopt",
	description:
		"Adopt a token that the remote created: first add it to the configuration at a path of your choice, then record that path here. The next push renames the remote token to the name the configuration generates, and sets the value of the configuration, so designs that use the token keep it. Writes the state file only.",
	audience: everyone,
	destructive: false,
	idempotent: true,
	input: adoptInput,
	output: decisionReport,
	failures: decisionFailures,
	run: (input, { context }) =>
		attempt(() =>
			decide(context, input, { action: "adopt", path: input.path }, (item, loaded) => {
				const target = loaded.desired.find((token) => token.sourcePath === input.path);
				if (!target) {
					const skipped = loaded.skipped.find((token) => token.sourcePath === input.path);
					throw new SyncError(
						"InvalidDecision",
						skipped
							? `The path "${input.path}" generates ${skipped.name}, which has no place on the remote: ${skipped.reason}`
							: `The configuration has no token at "${input.path}". Add the token to the configuration first, then adopt it.`,
					);
				}
				if (
					loaded.state.fetched?.tokens.some(
						(token) => token.name === target.name && token.key !== item.key,
					)
				) {
					throw new SyncError(
						"InvalidDecision",
						`The path "${input.path}" generates ${target.name}, which the remote already has.`,
					);
				}
				const taken = loaded.state.decisions.find(
					(entry) =>
						entry.action === "adopt" &&
						entry.path === input.path &&
						entry.key !== item.key,
				);
				if (taken) {
					throw new SyncError(
						"InvalidDecision",
						`The item "${taken.item}" is already adopted as "${input.path}". Two remote tokens cannot become one configuration token.`,
					);
				}
			}),
		),
});

/** `cssforge sync inbox reject`: delete a new remote token at the next push. */
export const syncInboxReject: Capability<
	ForgeContext,
	ItemInput,
	DecisionReport,
	DecisionFailures,
	never,
	"sync.inbox.reject",
	Partial<ItemInput>
> = capability({
	id: "sync.inbox.reject",
	description:
		"Reject a token that the remote created: the next push deletes it from the remote. Writes the state file only.",
	audience: everyone,
	destructive: false,
	idempotent: true,
	input: itemInput,
	output: decisionReport,
	failures: decisionFailures,
	run: (input, { context }) =>
		attempt(() => decide(context, input, { action: "reject" }, () => {})),
});

/** `cssforge sync inbox overwrite`: give the value of the configuration back to the remote. */
export const syncInboxOverwrite: Capability<
	ForgeContext,
	ItemInput,
	DecisionReport,
	DecisionFailures,
	never,
	"sync.inbox.overwrite",
	Partial<ItemInput>
> = capability({
	id: "sync.inbox.overwrite",
	description:
		"Settle a token that the remote changed, deleted, or created with the name of a configuration token: the next push writes the value of the configuration. To keep the value of the remote instead, change the configuration to that value; the item then goes away at the next fetch. Writes the state file only.",
	audience: everyone,
	destructive: false,
	idempotent: true,
	input: itemInput,
	output: decisionReport,
	failures: decisionFailures,
	run: (input, { context }) =>
		attempt(() => decide(context, input, { action: "overwrite" }, () => {})),
});

/** Every sync capability, in the order the help lists them. */
export const syncCapabilities = [
	syncRemoteAdd,
	syncFetch,
	syncPlan,
	syncPush,
	syncInboxList,
	syncInboxAdopt,
	syncInboxReject,
	syncInboxOverwrite,
] as const;
