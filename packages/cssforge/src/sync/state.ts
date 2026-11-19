/**
 * The state of the sync with one remote, in `.cssforge/sync/<remote>.json`: the target it
 * syncs with (the file, its modes and the options), the base (the tokens as they were after the last push), the last fetch, and
 * the decisions that wait for the next push. Commit it, so that everyone who syncs shares
 * the base.
 *
 * @module
 */

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { z } from "zod";
import {
	type BaseEntry,
	CUSTOM_PROPERTY,
	type Decision,
	type RemoteToken,
} from "./plan.ts";
import type { RemoteTarget } from "./remote.ts";

/** The pattern of a remote name: a word in lowercase, e.g. `paper` or `paper-marketing`. */
export const REMOTE_NAME = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

export interface SyncState {
	version: 1;
	/** The kind of remote, e.g. `paper`. */
	kind: string;
	/** The part of the remote the tokens sync with: the file, its modes and the options. */
	target: RemoteTarget;
	base: BaseEntry[];
	/** The remote tokens of the last fetch, or `null` before the first fetch. */
	fetched: { at: string; tokens: RemoteToken[] } | null;
	decisions: Decision[];
}

const customProperty = z.string().regex(CUSTOM_PROPERTY);
const modeValues = z.record(z.string(), z.string());

const stateSchema = z.strictObject({
	version: z.literal(1),
	kind: z.string().min(1),
	target: z.strictObject({
		file: z.string().min(1),
		fileName: z.string(),
		modes: z.array(z.string()).min(1),
		options: z.record(z.string(), z.string()),
	}),
	base: z.array(
		z.strictObject({
			name: customProperty,
			key: z.string().min(1),
			type: z.string(),
			sent: modeValues,
			stored: modeValues.nullable(),
			sourcePath: z.string(),
		}),
	),
	fetched: z
		.strictObject({
			at: z.string(),
			tokens: z.array(
				z.strictObject({
					key: z.string().min(1),
					label: z.string().min(1),
					name: customProperty.optional(),
					type: z.string(),
					values: modeValues,
					description: z.string().optional(),
				}),
			),
		})
		.nullable(),
	decisions: z.array(
		z.discriminatedUnion("action", [
			z.strictObject({
				item: z.string(),
				key: z.string().min(1),
				action: z.literal("adopt"),
				path: z.string(),
			}),
			z.strictObject({
				item: z.string(),
				key: z.string().min(1),
				action: z.literal("reject"),
			}),
			z.strictObject({
				item: z.string(),
				key: z.string().min(1),
				action: z.literal("overwrite"),
			}),
		]),
	),
});

/** The path of the state file of `remote`, under `root`. */
export const statePath = (root: string, remote: string): string =>
	join(root, ".cssforge", "sync", `${remote}.json`);

/** A state file that is missing, or that is not a valid state. */
export class StateError extends Error {
	readonly tag: "RemoteNotConfigured" | "InvalidState";
	/** The state file. */
	readonly path: string;

	constructor(
		tag: "RemoteNotConfigured" | "InvalidState",
		message: string,
		path: string,
	) {
		super(message);
		this.name = "StateError";
		this.tag = tag;
		this.path = path;
	}
}

/** Reads and validates the state of `remote`. */
export async function readState(root: string, remote: string): Promise<SyncState> {
	const path = statePath(root, remote);
	let text: string;
	try {
		text = await readFile(path, "utf8");
	} catch {
		throw new StateError(
			"RemoteNotConfigured",
			`There is no remote "${remote}". Add it with \`cssforge sync remote add --name ${remote} --kind paper --file <file id or URL>\`.`,
			path,
		);
	}
	let data: unknown;
	try {
		data = JSON.parse(text);
	} catch (error) {
		throw new StateError(
			"InvalidState",
			`The state file is not JSON: ${String(error)}`,
			path,
		);
	}
	const parsed = stateSchema.safeParse(data);
	if (!parsed.success) {
		throw new StateError(
			"InvalidState",
			`The state file is not valid: ${z.prettifyError(parsed.error)}`,
			path,
		);
	}
	return parsed.data;
}

/** Writes the state of `remote` in one step: a reader never sees half a file. */
export async function writeState(
	root: string,
	remote: string,
	state: SyncState,
): Promise<string> {
	const path = statePath(root, remote);
	await mkdir(dirname(path), { recursive: true });
	const temporary = `${path}.${process.pid}.tmp`;
	await writeFile(temporary, `${JSON.stringify(state, null, "\t")}\n`, "utf8");
	await rename(temporary, path);
	return path;
}
