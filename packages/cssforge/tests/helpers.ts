import type { Output } from "../src/lib.ts";

/**
 * Environment for spawning the CLI in tests. citty prints usage through consola,
 * which silences output when `TEST` or `NODE_ENV=test` is set, as vitest does.
 */
export const childEnv = { ...process.env };
delete childEnv.TEST;
delete childEnv.NODE_ENV;

export const getLines = (result?: string) =>
	result ? result.split("\n").filter((line) => line.trim()) : [];

export const combine = (css: Output["css"]) =>
	[css.root, css.outside].filter(Boolean).join("\n");

export const lineHasProp = (lines: string[]) => (prop: string) =>
	lines.some((line) => line.includes(prop));
