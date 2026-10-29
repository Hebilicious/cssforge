import { expect, test } from "vitest";
import { getReferencePaths, resolveValue } from "../src/lib.ts";

const aliasMap = new Map([
	["--surface-muted", "--palette-gray-100"],
	["--bg", "--palette-gray-100"],
]);

const resolve = (value: string) => resolveValue({ map: aliasMap, value });

const aliasTable = [
	["var(--bg)", "var(--palette-gray-100)"],
	["var(--surface-muted)", "var(--palette-gray-100)"],
	["var(--bg, red)", "var(--palette-gray-100, red)"],
	["var( --bg )", "var( --palette-gray-100 )"],
] as const;

test("resolveValue - resolves the alias table from the issue", () => {
	for (const [input, expected] of aliasTable) {
		expect(resolve(input), input).toEqual(expected);
	}
});

test("resolveValue - preserves nested fallback content", () => {
	expect(resolve("var(--surface-muted, var(--bg, red))")).toEqual(
		"var(--palette-gray-100, var(--palette-gray-100, red))",
	);
});

test("resolveValue - preserves whitespace and fallback inside var()", () => {
	expect(resolve("var(  --bg  ,  red  )")).toEqual("var(  --palette-gray-100  ,  red  )");
});

test("resolveValue - resolves every reference in a value", () => {
	expect(resolve("linear-gradient(to right, var(--bg), var(--surface-muted))")).toEqual(
		"linear-gradient(to right, var(--palette-gray-100), var(--palette-gray-100))",
	);
	expect(resolve("calc(var(--bg) + var(--surface-muted))")).toEqual(
		"calc(var(--palette-gray-100) + var(--palette-gray-100))",
	);
	expect(resolve("color-mix(in oklch, var(--bg) 50%, var(--surface-muted))")).toEqual(
		"color-mix(in oklch, var(--palette-gray-100) 50%, var(--palette-gray-100))",
	);
});

test("resolveValue - leaves unmapped external custom properties unchanged", () => {
	expect(resolve("var(--external-thing)")).toEqual("var(--external-thing)");
	expect(resolve("var(--external-thing, var(--bg))")).toEqual(
		"var(--external-thing, var(--palette-gray-100))",
	);
	expect(resolve("var(--brand-color, #fff)")).toEqual("var(--brand-color, #fff)");
});

test("resolveValue - does not rewrite var() text inside a quoted string", () => {
	expect(resolve('url("var(--surface-muted)")')).toEqual('url("var(--surface-muted)")');
	expect(resolve("content: 'var(--bg)'")).toEqual("content: 'var(--bg)'");
});

test("resolveValue - ignores comments and whitespace around the alias name", () => {
	expect(resolve("var(/* alias */--bg)")).toEqual("var(/* alias */--palette-gray-100)");
	expect(resolve("var( /* alias */ --bg )")).toEqual(
		"var( /* alias */ --palette-gray-100 )",
	);
	expect(resolve("var(--bg /* alias */)")).toEqual("var(--palette-gray-100 /* alias */)");
});

test("resolveValue - leaves malformed var() text unchanged", () => {
	expect(resolve("var(--bg")).toEqual("var(--bg");
	expect(resolve("var()")).toEqual("var()");
	expect(resolve("var(--)")).toEqual("var(--)");
	expect(resolve("var(--bg, red")).toEqual("var(--bg, red");
	// An unbalanced call must not rewrite references inside it.
	expect(resolve("var(--ext, var(--surface-muted)")).toEqual(
		"var(--ext, var(--surface-muted)",
	);
	expect(resolve("var(--surface-muted, var(--bg")).toEqual(
		"var(--surface-muted, var(--bg",
	);
});

test("getReferencePaths - reports aliases used with fallbacks", () => {
	expect(
		getReferencePaths({
			value: "var(--surface-muted, var(--bg))",
			variables: { bg: "palette.gray.100", "surface-muted": "palette.gray.100" },
		}),
	).toEqual(["palette.gray.100"]);
});
