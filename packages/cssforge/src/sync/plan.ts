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
 * Two identities meet here. The configuration names a token by its custom property
 * (`--palette-brand-500`). A remote has its own key for it: the same name on Paper, a
 * variable id on Figma. The base records both, so a remote that renames or re-keys a
 * token keeps the link.
 *
 * @module
 */

/** The pattern of a custom property name, e.g. `--color-primary`. */
export const CUSTOM_PROPERTY = /^--[a-zA-Z0-9_-]+$/;

/** The mode of a token emitted at `:root`. */
export const DEFAULT_MODE = "default";

/** The values of a token, one for each mode, e.g. `{ default: "8px" }` or `{ light, dark }`. */
export type ModeValues = Record<string, string>;

/** A token as a remote stores it. */
export interface RemoteToken {
	/** The identity of the token on the remote: a name or an id that only the remote assigns. */
	key: string;
	/** The name people see on the remote, e.g. `--brand-accent` or `color/brand/accent`. */
	label: string;
	/** The custom property the token stands for, when the remote records one. */
	name?: string;
	/** The token type of the remote, e.g. `color` or `spacing`. */
	type: string;
	values: ModeValues;
	description?: string;
}

/** A token that the configuration wants on the remote. */
export interface DesiredToken {
	/** The custom property name, e.g. `--palette-brand-500`. */
	name: string;
	type: string;
	/** The literal value of each mode, with every reference resolved. */
	values: ModeValues;
	/** For each mode whose generated value is exactly `var(<alias>)`, the aliased token. */
	aliases?: ModeValues;
	/** The configuration path of the token. */
	sourcePath: string;
	/** A description the remote shows beside the token. */
	description: string;
}

/** A token the configuration owns on the remote, as it was after the last push. */
export interface BaseEntry {
	/** The custom property name. */
	name: string;
	/** The key of the token on the remote. */
	key: string;
	type: string;
	/** The values the last push sent. */
	sent: ModeValues;
	/** The values as the remote stored them, read back after the push. `null` until read. */
	stored: ModeValues | null;
	sourcePath: string;
}

/**
 * A recorded answer to an inbox item. `key` is the remote key of the token it settles, which
 * stays the same when labels repeat or change; `item` is the id the answer was given for.
 */
export type Decision =
	| { item: string; key: string; action: "adopt"; path: string }
	| { item: string; key: string; action: "reject" }
	| { item: string; key: string; action: "overwrite" };

/** A change to send to the remote. A remote token is addressed by its key. */
export type Operation =
	| { op: "create"; name: string; type: string; values: ModeValues; description: string }
	| {
			op: "update";
			key: string;
			name: string;
			type: string;
			values: ModeValues;
			description: string;
	  }
	| { op: "rename"; key: string; from: string; to: string }
	| { op: "delete"; key: string; label: string };

/** A change that the remote made, which waits for a decision. */
export interface InboxItem {
	/**
	 * The id of the item, made from the label: `brand-accent` for `--brand-accent`. When two
	 * items share a label, each id ends with `#` and the key.
	 */
	id: string;
	/**
	 * `new`: the remote created a token that the configuration does not have.
	 * `edited`: the remote changed the value of a token that the configuration owns.
	 * `deleted`: the remote deleted a token that the configuration owns.
	 * `collision`: the remote has a token with the name of a new configuration token.
	 */
	kind: "new" | "edited" | "deleted" | "collision";
	/** The key of the token on the remote, or the key it had before the remote deleted it. */
	key: string;
	/** The name of the token on the remote, or the custom property of a deleted token. */
	label: string;
	type: string;
	/** The values on the remote, unless the remote deleted the token. */
	remoteValues?: ModeValues;
	/** The values the configuration wants, unless the configuration does not have the token. */
	localValues?: ModeValues;
	/** The decisions that settle the item. */
	actions: Decision["action"][];
	/** Why a recorded decision does not apply yet, for example an adopted path that is missing. */
	note?: string;
}

/** A planned operation with the base entry it gives when the remote accepts it. */
export interface PlannedOperation {
	operation: Operation;
	/**
	 * The base entry after the operation, or `null` when the operation removes the entry.
	 * The remote may give the token a new key; the push records it.
	 */
	base: BaseEntry | null;
	/** The name of the base entry the operation removes when it succeeds. */
	replaces?: string;
	/** The key of the decision that the operation carries out, removed when it succeeds. */
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

/** The inbox id of a label: `brand-accent` for `--brand-accent`, `color/brand` as it is. */
export const itemIdOf = (label: string): string => label.replace(/^--/, "");

/** Whether two sets of mode values are the same. */
export const sameValues = (left: ModeValues, right: ModeValues): boolean => {
	const modes = Object.keys(left);
	return (
		modes.length === Object.keys(right).length &&
		modes.every((mode) => Object.hasOwn(right, mode) && right[mode] === left[mode])
	);
};

/**
 * Plans a sync. Operations come in the order the remote must apply them: creates first,
 * each after the tokens it aliases, then renames, updates and deletes.
 */
export function planSync(input: PlanInput): SyncPlan {
	const { remote, base, decisions } = input;
	const skipped = input.skipped ?? new Set<string>();
	const desired = withAliases(input.desired);
	const desiredByName = new Map(desired.map((token) => [token.name, token]));
	const remoteByKey = new Map(remote.map((token) => [token.key, token]));
	const baseKeys = new Set(base.map((entry) => entry.key));
	const baseNames = new Set(base.map((entry) => entry.name));
	/** The custom properties the remote already has a token for. */
	const remoteNames = new Set(
		remote.flatMap((token) => (token.name === undefined ? [] : [token.name])),
	);
	const decisionByKey = new Map(decisions.map((decision) => [decision.key, decision]));

	const creates: PlannedOperation[] = [];
	const changes: PlannedOperation[] = [];
	const inbox: InboxItem[] = [];
	const carried: BaseEntry[] = [];
	const pending: Decision[] = [];
	/** Configuration tokens that a remote token becomes or collides with, so they are not created. */
	const claimedNames = new Set<string>();

	const entryOf = (token: DesiredToken, key: string): BaseEntry => ({
		name: token.name,
		key,
		type: token.type,
		sent: token.values,
		stored: null,
		sourcePath: token.sourcePath,
	});
	const hold = (decision: Decision | undefined) => {
		if (decision) pending.push(decision);
	};

	// A token that the remote has and the base does not: new, or adopted under a decision.
	for (const remoteToken of remote) {
		if (baseKeys.has(remoteToken.key)) continue;
		const id = itemIdOf(remoteToken.label);
		const decision = decisionByKey.get(remoteToken.key);
		const settles = remoteToken.key;
		const wanted =
			remoteToken.name === undefined ? undefined : desiredByName.get(remoteToken.name);

		if (wanted && !baseNames.has(wanted.name)) {
			// The configuration wants a token with this name, which it never pushed.
			claimedNames.add(wanted.name);
			if (decision?.action === "overwrite") {
				changes.push({
					operation: update(wanted, remoteToken.key),
					base: entryOf(wanted, remoteToken.key),
					settles,
				});
				continue;
			}
			hold(decision);
			inbox.push({
				id,
				kind: "collision",
				key: remoteToken.key,
				label: remoteToken.label,
				type: remoteToken.type,
				remoteValues: remoteToken.values,
				localValues: wanted.values,
				actions: ["overwrite"],
			});
			continue;
		}

		if (decision?.action === "reject") {
			changes.push({
				operation: { op: "delete", key: remoteToken.key, label: remoteToken.label },
				base: null,
				settles,
			});
			continue;
		}

		if (decision?.action === "adopt") {
			const target = desired.find((token) => token.sourcePath === decision.path);
			const blocked =
				target === undefined
					? `The adopted path "${decision.path}" is not in the configuration.`
					: remoteNames.has(target.name) || baseNames.has(target.name)
						? `The adopted path "${decision.path}" generates ${target.name}, which the remote already has.`
						: claimedNames.has(target.name)
							? `Another item is already adopted as "${decision.path}".`
							: undefined;
			if (target && blocked === undefined) {
				claimedNames.add(target.name);
				changes.push({
					operation: {
						op: "rename",
						key: remoteToken.key,
						from: remoteToken.label,
						to: target.name,
					},
					base: { ...entryOf(target, remoteToken.key), sent: remoteToken.values },
					settles,
				});
				if (!sameValues(target.values, remoteToken.values)) {
					// The key after the rename is not known yet: the push sends the update with it.
					changes.push({
						operation: update(target, remoteToken.key),
						base: entryOf(target, remoteToken.key),
					});
				}
				continue;
			}
			pending.push(decision);
			inbox.push({ ...newItem(remoteToken), ...(blocked ? { note: blocked } : {}) });
			continue;
		}

		hold(decision);
		inbox.push(newItem(remoteToken));
	}

	// A token that the base has: the configuration owns it.
	for (const entry of base) {
		const wanted = desiredByName.get(entry.name);
		const remoteToken = remoteByKey.get(entry.key);
		const id = itemIdOf(remoteToken?.label ?? entry.name);
		const decision = decisionByKey.get(entry.key);
		const settles = entry.key;

		if (!wanted && skipped.has(entry.name)) {
			carried.push({ ...entry, stored: entry.stored ?? remoteToken?.values ?? null });
			continue;
		}
		if (!wanted) {
			// Removed from the configuration: delete it from the remote, if it is still there.
			if (remoteToken) {
				changes.push({
					operation: { op: "delete", key: entry.key, label: remoteToken.label },
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
					base: entryOf(wanted, entry.key),
					replaces: entry.name,
					settles,
				});
				continue;
			}
			hold(decision);
			carried.push(entry);
			inbox.push({
				id,
				kind: "deleted",
				key: entry.key,
				label: entry.name,
				type: entry.type,
				localValues: wanted.values,
				actions: ["overwrite"],
			});
			continue;
		}

		const stored = entry.stored ?? remoteToken.values;
		const remoteChanged = !sameValues(remoteToken.values, stored);
		const localChanged = !sameValues(wanted.values, entry.sent);

		if (remoteChanged) {
			if (decision?.action === "overwrite") {
				changes.push({
					operation: update(wanted, entry.key),
					base: entryOf(wanted, entry.key),
					settles,
				});
				continue;
			}
			hold(decision);
			carried.push({ ...entry, stored });
			inbox.push({
				id,
				kind: "edited",
				key: entry.key,
				label: remoteToken.label,
				type: entry.type,
				remoteValues: remoteToken.values,
				localValues: wanted.values,
				actions: ["overwrite"],
			});
			continue;
		}

		if (localChanged) {
			changes.push({
				operation: update(wanted, entry.key),
				base: entryOf(wanted, entry.key),
			});
			continue;
		}
		carried.push({ ...entry, stored });
	}

	// A token that only the configuration has: create it. The remote gives it its key.
	for (const token of desired) {
		if (baseNames.has(token.name) || claimedNames.has(token.name)) continue;
		creates.push({ operation: create(token), base: entryOf(token, "") });
	}

	return {
		operations: [...orderCreates(creates, desiredByName), ...changes],
		inbox: withUniqueIds(inbox),
		carried,
		pending,
	};
}

/** Gives the items that share an id a suffix with their key, so that each id names one item. */
function withUniqueIds(inbox: readonly InboxItem[]): InboxItem[] {
	const counts = new Map<string, number>();
	for (const item of inbox) counts.set(item.id, (counts.get(item.id) ?? 0) + 1);
	return inbox.map((item) =>
		(counts.get(item.id) ?? 0) > 1 ? { ...item, id: `${item.id}#${item.key}` } : item,
	);
}

const create = (token: DesiredToken): Operation => ({
	op: "create",
	name: token.name,
	type: token.type,
	values: token.values,
	description: token.description,
});

const update = (token: DesiredToken, key: string): Operation => ({
	op: "update",
	key,
	name: token.name,
	type: token.type,
	values: token.values,
	description: token.description,
});

const newItem = (token: RemoteToken): InboxItem => ({
	id: itemIdOf(token.label),
	kind: "new",
	key: token.key,
	label: token.label,
	type: token.type,
	remoteValues: token.values,
	actions: ["adopt", "reject"],
});

/**
 * Writes each mode that aliases another pushed token of the same type as `var(--target)`,
 * so that the remote keeps the link. Any other mode sends its literal value.
 */
function withAliases(desired: readonly DesiredToken[]): DesiredToken[] {
	const types = new Map(desired.map((token) => [token.name, token.type]));
	return desired.map((token) => {
		if (token.aliases === undefined) return token;
		const values = { ...token.values };
		for (const [mode, target] of Object.entries(token.aliases)) {
			if (types.get(target) === token.type && Object.hasOwn(values, mode)) {
				values[mode] = `var(${target})`;
			}
		}
		return { ...token, values };
	});
}

/** Orders creates so that each comes after the tokens it aliases. */
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
		for (const alias of Object.values(desiredByName.get(name)?.aliases ?? {}))
			visit(alias);
		ordered.push(planned);
	};

	for (const name of [...pending.keys()]) visit(name);
	return ordered;
}
