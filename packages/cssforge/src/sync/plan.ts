/**
 * The three-way plan of token sync. It compares the tokens that the configuration
 * wants on a remote (a design tool), the tokens the remote has now, and the base: the
 * tokens as they were after the last push. Writes nothing and calls no remote.
 *
 * The configuration is the source of truth. A token that only the configuration changed
 * is pushed. A token that the remote created, changed or deleted becomes an inbox item,
 * and stays one until a decision settles it: `adopt` or `reject` for a new token,
 * `overwrite` for the others.
 *
 * @module
 */

/** The pattern of a token name on a remote: a CSS custom property, e.g. `--color-primary`. */
export const TOKEN_NAME = /^--[a-zA-Z0-9_-]+$/;

/** A token as a remote stores it. */
export interface RemoteToken {
	/** The custom property name, e.g. `--color-primary`. */
	name: string;
	/** The token type of the remote, e.g. `color` or `spacing`. */
	type: string;
	value: string;
	description?: string;
}

/** A token that the configuration wants on the remote. */
export interface DesiredToken {
	name: string;
	type: string;
	/** The literal value, with every reference resolved. */
	value: string;
	/** The token this one aliases, when its generated value is exactly `var(<alias>)`. */
	alias?: string;
	/** The configuration path of the token. */
	sourcePath: string;
	/** A description the remote shows beside the token. */
	description: string;
}

/** A token the configuration owns on the remote, as it was after the last push. */
export interface BaseEntry {
	name: string;
	type: string;
	/** The value the last push sent. */
	sent: string;
	/** The value as the remote stored it, read back after the push. `null` if the read found no token. */
	stored: string | null;
	sourcePath: string;
}

/** A recorded answer to an inbox item. The item is the token name without its `--`. */
export type Decision =
	| { item: string; action: "adopt"; path: string }
	| { item: string; action: "reject" }
	| { item: string; action: "overwrite" };

/** A change to send to the remote. */
export type Operation =
	| { op: "create"; name: string; type: string; value: string; description: string }
	| { op: "update"; name: string; type: string; value: string; description: string }
	| { op: "rename"; from: string; to: string }
	| { op: "delete"; name: string };

/** A change that the remote made, which waits for a decision. */
export interface InboxItem {
	/** The id of the item: the token name without its `--`. */
	id: string;
	/**
	 * `new`: the remote created a token that the configuration does not have.
	 * `edited`: the remote changed the value of a token that the configuration owns.
	 * `deleted`: the remote deleted a token that the configuration owns.
	 * `collision`: the remote has a token with the name of a new configuration token.
	 */
	kind: "new" | "edited" | "deleted" | "collision";
	name: string;
	type: string;
	/** The value on the remote, unless the remote deleted the token. */
	remoteValue?: string;
	/** The value the configuration wants, unless the configuration does not have the token. */
	localValue?: string;
	/** The decisions that settle the item. */
	actions: Decision["action"][];
	/** Why a recorded decision does not apply yet, for example an adopted path that is missing. */
	note?: string;
}

/** A planned operation with the base entry it gives when the remote accepts it. */
export interface PlannedOperation {
	operation: Operation;
	/** The base entry after the operation, or `null` when the operation removes the entry. */
	base: BaseEntry | null;
	/** The base entry the operation replaces, removed when the operation succeeds. */
	replaces?: string;
	/** The decision that the operation carries out, removed when the operation succeeds. */
	settles?: string;
}

export interface SyncPlan {
	operations: PlannedOperation[];
	inbox: InboxItem[];
	/** The base entries that no operation changes, with the stored values of this fetch. */
	carried: BaseEntry[];
	/** The decisions that still wait: their items are in the inbox. */
	pending: Decision[];
}

export interface PlanInput {
	desired: readonly DesiredToken[];
	/**
	 * The names of configuration tokens that have no place on the remote. A pushed token
	 * that becomes one keeps its remote copy: it is skipped, not removed from the configuration.
	 */
	skipped?: ReadonlySet<string>;
	remote: readonly RemoteToken[];
	base: readonly BaseEntry[];
	decisions: readonly Decision[];
}

/** The inbox id of a token name: the name without its `--`. */
export const itemIdOf = (name: string): string => name.replace(/^--/, "");

const byName = <T extends { name: string }>(entries: readonly T[]) =>
	new Map(entries.map((entry) => [entry.name, entry]));

/**
 * Plans a sync. Operations come in the order the remote must apply them: creates first,
 * each after the tokens it aliases, then renames, updates and deletes.
 */
export function planSync(input: PlanInput): SyncPlan {
	const { remote, base, decisions } = input;
	const skipped = input.skipped ?? new Set<string>();
	const desired = withAliases(input.desired);
	const desiredByName = byName(desired);
	const remoteByName = byName(remote);
	const baseByName = byName(base);
	const decisionByItem = new Map(decisions.map((decision) => [decision.item, decision]));

	const creates: PlannedOperation[] = [];
	const changes: PlannedOperation[] = [];
	const inbox: InboxItem[] = [];
	const carried: BaseEntry[] = [];
	const pending: Decision[] = [];
	/** Configuration tokens that an adopted remote token becomes, so they are not created. */
	const adoptedNames = new Set<string>();

	const decisionFor = (name: string) => decisionByItem.get(itemIdOf(name));
	const settled = (name: string) => itemIdOf(name);
	const entryOf = (token: DesiredToken): BaseEntry => ({
		name: token.name,
		type: token.type,
		sent: token.value,
		stored: null,
		sourcePath: token.sourcePath,
	});

	// A token that the remote has and the base does not: new, or adopted under a decision.
	for (const remoteToken of remote) {
		if (baseByName.has(remoteToken.name)) continue;
		const wanted = desiredByName.get(remoteToken.name);
		const decision = decisionFor(remoteToken.name);

		if (wanted) {
			// The configuration wants a token with this name, which it never pushed.
			if (decision?.action === "overwrite") {
				changes.push({
					operation: update(wanted),
					base: entryOf(wanted),
					settles: settled(remoteToken.name),
				});
				adoptedNames.add(wanted.name);
				continue;
			}
			adoptedNames.add(wanted.name);
			if (decision) pending.push(decision);
			inbox.push({
				id: itemIdOf(remoteToken.name),
				kind: "collision",
				name: remoteToken.name,
				type: remoteToken.type,
				remoteValue: remoteToken.value,
				localValue: wanted.value,
				actions: ["overwrite"],
			});
			continue;
		}

		if (decision?.action === "reject") {
			changes.push({
				operation: { op: "delete", name: remoteToken.name },
				base: null,
				settles: settled(remoteToken.name),
			});
			continue;
		}

		if (decision?.action === "adopt") {
			const target = desired.find((token) => token.sourcePath === decision.path);
			const blocked =
				target === undefined
					? `The adopted path "${decision.path}" is not in the configuration.`
					: remoteByName.has(target.name) || baseByName.has(target.name)
						? `The adopted path "${decision.path}" generates ${target.name}, which the remote already has.`
						: adoptedNames.has(target.name)
							? `Another item is already adopted as "${decision.path}".`
							: undefined;
			if (target && blocked === undefined) {
				adoptedNames.add(target.name);
				const entry = { ...entryOf(target), sent: remoteToken.value };
				changes.push({
					operation: { op: "rename", from: remoteToken.name, to: target.name },
					base: entry,
					settles: settled(remoteToken.name),
				});
				if (target.value !== remoteToken.value) {
					changes.push({ operation: update(target), base: entryOf(target) });
				}
				continue;
			}
			pending.push(decision);
			inbox.push({
				...newItem(remoteToken),
				...(blocked ? { note: blocked } : {}),
			});
			continue;
		}

		if (decision) pending.push(decision);
		inbox.push(newItem(remoteToken));
	}

	// A token that the base has: the configuration owns it.
	for (const entry of base) {
		const wanted = desiredByName.get(entry.name);
		const remoteToken = remoteByName.get(entry.name);
		const decision = decisionFor(entry.name);

		if (!wanted && skipped.has(entry.name)) {
			carried.push({ ...entry, stored: entry.stored ?? remoteToken?.value ?? null });
			continue;
		}
		if (!wanted) {
			// Removed from the configuration: delete it from the remote, if it is still there.
			if (remoteToken) {
				changes.push({
					operation: { op: "delete", name: entry.name },
					base: null,
					replaces: entry.name,
				});
			}
			continue;
		}

		if (!remoteToken) {
			if (decision?.action === "overwrite") {
				creates.push({
					operation: create(wanted),
					base: entryOf(wanted),
					settles: settled(entry.name),
				});
				continue;
			}
			if (decision) pending.push(decision);
			carried.push(entry);
			inbox.push({
				id: itemIdOf(entry.name),
				kind: "deleted",
				name: entry.name,
				type: entry.type,
				localValue: wanted.value,
				actions: ["overwrite"],
			});
			continue;
		}

		const stored = entry.stored ?? remoteToken.value;
		const remoteChanged = remoteToken.value !== stored;
		const localChanged = wanted.value !== entry.sent;

		if (remoteChanged) {
			if (decision?.action === "overwrite") {
				changes.push({
					operation: update(wanted),
					base: entryOf(wanted),
					settles: settled(entry.name),
				});
				continue;
			}
			if (decision) pending.push(decision);
			carried.push({ ...entry, stored });
			inbox.push({
				id: itemIdOf(entry.name),
				kind: "edited",
				name: entry.name,
				type: entry.type,
				remoteValue: remoteToken.value,
				localValue: wanted.value,
				actions: ["overwrite"],
			});
			continue;
		}

		if (localChanged) {
			changes.push({ operation: update(wanted), base: entryOf(wanted) });
			continue;
		}
		carried.push({ ...entry, stored });
	}

	// A token that only the configuration has: create it.
	for (const token of desired) {
		if (baseByName.has(token.name) || remoteByName.has(token.name)) continue;
		if (adoptedNames.has(token.name)) continue;
		creates.push({ operation: create(token), base: entryOf(token) });
	}

	return {
		operations: [...orderCreates(creates, desiredByName), ...changes],
		inbox,
		carried,
		pending,
	};
}

const create = (token: DesiredToken): Operation => ({
	op: "create",
	name: token.name,
	type: token.type,
	value: token.value,
	description: token.description,
});

const update = (token: DesiredToken): Operation => ({
	op: "update",
	name: token.name,
	type: token.type,
	value: token.value,
	description: token.description,
});

const newItem = (token: RemoteToken): InboxItem => ({
	id: itemIdOf(token.name),
	kind: "new",
	name: token.name,
	type: token.type,
	remoteValue: token.value,
	actions: ["adopt", "reject"],
});

/**
 * Writes a token that aliases another pushed token of the same type as `var(--target)`,
 * so that the remote keeps the link. The remote takes an alias only as the whole value,
 * and only to a token of the same type; any other token sends its literal value.
 */
function withAliases(desired: readonly DesiredToken[]): DesiredToken[] {
	const types = new Map(desired.map((token) => [token.name, token.type]));
	return desired.map((token) =>
		token.alias !== undefined && types.get(token.alias) === token.type
			? { ...token, value: `var(${token.alias})` }
			: token,
	);
}

/** Orders creates so that each comes after the token it aliases. */
function orderCreates(
	creates: readonly PlannedOperation[],
	desiredByName: ReadonlyMap<string, DesiredToken>,
): PlannedOperation[] {
	const pending = new Map(creates.map((planned) => [planned.base?.name ?? "", planned]));
	const ordered: PlannedOperation[] = [];

	const visit = (name: string) => {
		const planned = pending.get(name);
		if (!planned) return;
		pending.delete(name);
		const alias = desiredByName.get(name)?.alias;
		if (alias !== undefined) visit(alias);
		ordered.push(planned);
	};

	for (const name of [...pending.keys()]) visit(name);
	return ordered;
}
