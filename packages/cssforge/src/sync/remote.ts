/**
 * The interface between token sync and a remote: a design tool that stores tokens. Each
 * kind of remote (Paper, and later others) has one adapter.
 *
 * @module
 */

import type { ListedToken } from "../generator.ts";
import type { Operation, RemoteToken } from "./plan.ts";

/** A file of the remote that the tokens sync with. */
export interface RemoteFile {
	/** The id of the file on the remote. */
	id: string;
	/** The name of the file, for people. */
	name: string;
}

/** What the remote did with one operation. */
export interface ApplyResult {
	operation: Operation;
	ok: boolean;
	/** Why the remote refused the operation. */
	message?: string;
}

/**
 * A connection to the remote for one capability call. `calls` counts the requests made,
 * because some remotes limit them.
 */
export interface RemoteSession {
	/** Finds the file from an id or a URL. */
	describe(file: string): Promise<RemoteFile>;
	/** Reads every token of the file. */
	read(file: string): Promise<RemoteToken[]>;
	/** Sends the operations in order, and reports each one. */
	apply(file: string, operations: readonly Operation[]): Promise<ApplyResult[]>;
	readonly calls: number;
	close(): void;
}

/** Where a configuration token goes on the remote, or why it has no place there. */
export type TokenMapping = { type: string; value: string } | { skip: string };

/** One kind of remote. */
export interface RemoteAdapter {
	/** The kind, as `remote add --kind` names it, e.g. `paper`. */
	kind: string;
	/** Maps a configuration token to the remote. */
	map(token: ListedToken): TokenMapping;
	/** Opens a session. Rejects with a {@link RemoteError} when the remote cannot be reached. */
	open(signal: AbortSignal): Promise<RemoteSession>;
}

/** A failure of the remote, as a capability failure. */
export class RemoteError extends Error {
	readonly tag: "RemoteUnavailable" | "RemoteFailed";

	constructor(tag: "RemoteUnavailable" | "RemoteFailed", message: string) {
		super(message);
		this.name = "RemoteError";
		this.tag = tag;
	}
}
