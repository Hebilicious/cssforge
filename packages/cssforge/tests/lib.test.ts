import {
	getReferencePaths,
	replaceCssVariableReferences,
	resolveValue,
} from "../src/lib.ts";
import { assertEquals, Deno } from "./vitest-compat.ts";

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

for (const [input, expected] of aliasTable) {
	Deno.test(`resolveValue - resolves the alias in ${input}`, () => {
		assertEquals(resolve(input), expected);
	});
}

Deno.test("resolveValue - preserves nested fallback content", () => {
	assertEquals(
		resolve("var(--surface-muted, var(--bg, red))"),
		"var(--palette-gray-100, var(--palette-gray-100, red))",
	);
});

Deno.test("resolveValue - preserves whitespace and fallback inside var()", () => {
	assertEquals(resolve("var(  --bg  ,  red  )"), "var(  --palette-gray-100  ,  red  )");
});

Deno.test("resolveValue - resolves every reference in a value", () => {
	assertEquals(
		resolve("linear-gradient(to right, var(--bg), var(--surface-muted))"),
		"linear-gradient(to right, var(--palette-gray-100), var(--palette-gray-100))",
	);
	assertEquals(
		resolve("calc(var(--bg) + var(--surface-muted))"),
		"calc(var(--palette-gray-100) + var(--palette-gray-100))",
	);
	assertEquals(
		resolve("color-mix(in oklch, var(--bg) 50%, var(--surface-muted))"),
		"color-mix(in oklch, var(--palette-gray-100) 50%, var(--palette-gray-100))",
	);
});

Deno.test("resolveValue - leaves unmapped external custom properties unchanged", () => {
	assertEquals(resolve("var(--external-thing)"), "var(--external-thing)");
	assertEquals(
		resolve("var(--external-thing, var(--bg))"),
		"var(--external-thing, var(--palette-gray-100))",
	);
	assertEquals(resolve("var(--brand-color, #fff)"), "var(--brand-color, #fff)");
});

Deno.test("resolveValue - does not rewrite var() text inside a quoted string", () => {
	assertEquals(resolve('url("var(--surface-muted)")'), 'url("var(--surface-muted)")');
	assertEquals(resolve("content: 'var(--bg)'"), "content: 'var(--bg)'");
});

Deno.test("resolveValue - ignores comments and whitespace around the alias name", () => {
	assertEquals(resolve("var(/* alias */--bg)"), "var(/* alias */--palette-gray-100)");
	assertEquals(
		resolve("var( /* alias */ --bg )"),
		"var( /* alias */ --palette-gray-100 )",
	);
	assertEquals(resolve("var(--bg /* alias */)"), "var(--palette-gray-100 /* alias */)");
});

Deno.test("resolveValue - leaves malformed var() text unchanged", () => {
	assertEquals(resolve("var(--bg"), "var(--bg");
	assertEquals(resolve("var()"), "var()");
	assertEquals(resolve("var(--)"), "var(--)");
	assertEquals(resolve("var(--bg, red"), "var(--bg, red");
});

Deno.test("resolveValue - leaves an unbalanced var() region completely unchanged", () => {
	assertEquals(
		resolve("var(--ext, var(--surface-muted)"),
		"var(--ext, var(--surface-muted)",
	);
	assertEquals(
		resolve("var(/* --ext */ var(--surface-muted)"),
		"var(/* --ext */ var(--surface-muted)",
	);
	assertEquals(resolve("var(--surface-muted, var(--bg"), "var(--surface-muted, var(--bg");
});

Deno.test("replaceCssVariableReferences - reports the alias name for fallback values", () => {
	const seen: string[] = [];
	replaceCssVariableReferences("var( --surface-muted , red)", (cssVariable, match) => {
		seen.push(cssVariable);
		return match;
	});
	assertEquals(seen, ["--surface-muted"]);
});

Deno.test("getReferencePaths - reports aliases used with fallbacks", () => {
	assertEquals(
		getReferencePaths({
			value: "var(--surface-muted, var(--bg))",
			variables: { bg: "palette.gray.100", "surface-muted": "palette.gray.100" },
		}),
		["palette.gray.100"],
	);
});
