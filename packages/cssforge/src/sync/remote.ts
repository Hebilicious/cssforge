/**
 * The interface between token sync and a remote: a design tool that stores tokens. Each
 * kind of remote (Paper, and later others such as Figma) has one adapter. Token sync knows
 * nothing else about a remote.
 *
 * @module
 */

import type { ListedToken } from "../generator.ts";
import type { Operation, RemoteToken } from "./plan.ts";

/** The options of a remote, as `sync remote add --options` gives them, e.g. a Figma collection. */
export type RemoteOptions = Record<string, string>;

/** The part of a remote that the tokens sync with, as the adapter resolved it. */
export interface RemoteTarget {
	/** The id of the file on the remote. */
	file: string;
	/** The name of the file, for people. */
	fileName: string;
	/**
	 * The modes the target holds, by the names token sync uses: `default` for tokens at
	 * `:root`, `light` and `dark` for `light-dark()` values, and the selector or at-rule of
	 * any other scope, e.g. `.dark`. A remote with no modes holds only `default`.
	 */
	modes: string[];
	/** The options, as the adapter normalized them, e.g. a collection name resolved to an id. */
	options: RemoteOptions;
}

/** What the remote did with one operation. */
export interface ApplyResult {
	operation: Operation;
	ok: boolean;
	/** Why the remote refused the operation. */
	message?: string;
	/** The key of the token after the operation: the key a create gives, or a rename changes. */
	key?: string;
}

/**
 * A connection to the remote for one capability call. `calls` counts the requests made,
 * because some remotes limit them.
 */
export interface RemoteSession {
	/** Finds the target from a file id or URL and the options. */
	resolve(file: string, options: RemoteOptions): Promise<RemoteTarget>;
	/** Reads every token of the target. */
	read(target: RemoteTarget): Promise<RemoteToken[]>;
	/**
	 * Sends the operations in order, and reports each one. A `var(--name)` value aliases the
	 * token with that custom property; `keys` gives the key of each one the remote has.
	 */
	apply(
		target: RemoteTarget,
		operations: readonly Operation[],
		keys: ReadonlyMap<string, string>,
	): Promise<ApplyResult[]>;
	readonly calls: number;
	close(): void;
}

/** Where a configuration token goes on the remote in one mode, or why it has no place there. */
export type TokenMapping = { type: string; value: string } | { skip: string };

/** One kind of remote. */
export interface RemoteAdapter {
	/** The kind, as `sync remote add --kind` names it, e.g. `paper`. */
	kind: string;
	/**
	 * Maps a configuration token in one mode to the remote. `token.resolvedValue` is the
	 * value of that mode.
	 */
	map(token: ListedToken): TokenMapping;
	/**
	 * Checks the options of `sync remote add` before any request, and throws a
	 * {@link RemoteError} `InvalidOptions` for options this kind does not take.
	 */
	checkOptions(options: RemoteOptions): void;
	/** Opens a session. Rejects with a {@link RemoteError} when the remote cannot be reached. */
	open(signal: AbortSignal): Promise<RemoteSession>;
}

/** A failure of the remote, as a capability failure. */
export class RemoteError extends Error {
	readonly tag: "RemoteUnavailable" | "RemoteFailed" | "InvalidOptions";

	constructor(
		tag: "RemoteUnavailable" | "RemoteFailed" | "InvalidOptions",
		message: string,
	) {
		super(message);
		this.name = "RemoteError";
		this.tag = tag;
	}
}
