import type { Output } from "../src/lib.ts";

export const getLines = (result?: string) =>
  result ? result.split("\n").filter((line) => line.trim()) : [];

export const combine = (css: Output["css"]) =>
  [css.root, css.outside].filter(Boolean).join("\n");

export const lineHasProp = (lines: string[]) => (prop: string) =>
  lines.some((line) => line.includes(prop));
