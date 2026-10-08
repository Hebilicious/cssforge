import { generateJSON, generateTS } from "../src/generator.ts";
import type { CSSForgeConfig, Diagnostic } from "../src/mod.ts";
import {
	generateCSS,
	generateStyleDictionaryJSON,
	getDiagnostics,
	processMotion,
} from "../src/mod.ts";
import { assert, assertEquals, assertThrows, Deno } from "./vitest-compat.ts";

const motion = (config: CSSForgeConfig["motion"]): Partial<CSSForgeConfig> => ({
	motion: config,
});

const duration = (value: string, settings?: { long?: boolean }) =>
	motion({
		duration: { ui: { value: { press: value }, ...(settings ? { settings } : {}) } },
	});

const easing = (value: string) => motion({ easing: { ui: { value: { enter: value } } } });

const codes = (diagnostics: Diagnostic[]) => diagnostics.map(({ code }) => code);

const assertRejected = (config: unknown, parts: string[]) => {
	const error = assertThrows(() => generateCSS(config as Partial<CSSForgeConfig>));
	for (const part of parts) {
		assert(error.message.includes(part), `Expected "${part}" in: ${error.message}`);
	}
};

Deno.test("motion - emits duration and easing tokens per group", () => {
	const css = generateCSS(
		motion({
			duration: {
				ui: { value: { press: "120ms", dropdown: "0.2s" } },
				overlay: { value: { modal: "400ms" }, settings: { long: true } },
			},
			easing: {
				ui: { value: { out: "cubic-bezier(0.23, 1, 0.32, 1)", flat: "linear" } },
			},
		}),
	);

	assertEquals(
		css,
		[
			"/*____ CSSForge ____*/",
			":root {",
			"/*____ Motion ____*/",
			"--motion-duration-ui-press: 120ms;",
			"--motion-duration-ui-dropdown: 0.2s;",
			"--motion-duration-overlay-modal: 400ms;",
			"--motion-easing-ui-out: cubic-bezier(0.23, 1, 0.32, 1);",
			"--motion-easing-ui-flat: linear;",
			"}",
		].join("\n"),
	);
});

Deno.test("motion - processMotion resolves motion.<kind>.<group>.<name> paths", () => {
	const { resolveMap } = processMotion({
		duration: { ui: { value: { press: "120ms" } } },
		easing: { ui: { value: { out: "ease-out" } } },
	});

	assertEquals(Object.fromEntries(resolveMap), {
		"motion.duration.ui.press": {
			key: "--motion-duration-ui-press",
			value: "120ms",
			variable: "--motion-duration-ui-press: 120ms;",
			sourcePath: "motion.duration.ui.press",
			type: "duration",
			tier: "primitive",
		},
		"motion.easing.ui.out": {
			key: "--motion-easing-ui-out",
			value: "ease-out",
			variable: "--motion-easing-ui-out: ease-out;",
			sourcePath: "motion.easing.ui.out",
			type: "easing",
			tier: "primitive",
		},
	});
});

Deno.test("motion - primitives reference motion tokens through variables", () => {
	const css = generateCSS({
		...motion({
			duration: { ui: { value: { press: "120ms" } } },
			easing: { ui: { value: { out: "ease-out" } } },
		}),
		primitives: {
			button: {
				value: {
					default: {
						value: { transition: "transform var(--press) var(--out)" },
						variables: { press: "motion.duration.ui.press", out: "motion.easing.ui.out" },
					},
				},
			},
		},
	});

	assert(
		css.includes(
			"--button-default-transition: transform var(--motion-duration-ui-press) var(--motion-easing-ui-out);",
		),
		css,
	);
});

Deno.test("motion - a reference may keep the value segment, as spacing allows", () => {
	const css = generateCSS({
		...motion({ duration: { ui: { value: { press: "120ms" } } } }),
		primitives: {
			button: {
				value: {
					default: {
						value: { duration: "var(--d)" },
						variables: { d: "motion.duration.ui.value.press" },
					},
				},
			},
		},
	});
	assert(
		css.includes("--button-default-duration: var(--motion-duration-ui-press);"),
		css,
	);
});

Deno.test("motion - an unknown motion reference names the path", () => {
	const error = assertThrows(() =>
		generateCSS({
			...motion({ duration: { ui: { value: { press: "120ms" } } } }),
			primitives: {
				button: {
					value: {
						default: {
							value: { duration: "var(--d)" },
							variables: { d: "motion.duration.ui.missing" },
						},
					},
				},
			},
		}),
	);
	assert(error.message.includes("motion.duration.ui.missing"), error.message);
});

Deno.test("motion - JSON, TypeScript and Style Dictionary outputs carry the tokens", () => {
	const config = motion({
		duration: { ui: { value: { press: "120ms" } } },
		easing: { ui: { value: { out: "ease-out" } } },
	});

	const json = JSON.parse(generateJSON(config));
	assertEquals(json.motion.duration.ui.press, {
		key: "--motion-duration-ui-press",
		value: "120ms",
		variable: "--motion-duration-ui-press: 120ms;",
	});
	assert(generateTS(config).includes('"key": "--motion-easing-ui-out"'));

	const tokens = JSON.parse(generateStyleDictionaryJSON(config));
	assertEquals(tokens.motion.duration.ui.press.value, "120ms");
	assertEquals(tokens.motion.duration.ui.press.type, "duration");
	assertEquals(tokens.motion.easing.ui.out.type, "easing");
	assertEquals(
		tokens.motion.easing.ui.out.attributes.cssVariable,
		"--motion-easing-ui-out",
	);
});

Deno.test("motion - a token colliding with a primitive key is rejected", () => {
	assertRejected(
		{
			...motion({ duration: { ui: { value: { press: "120ms" } } } }),
			primitives: { motion: { value: { duration: { value: { "ui-press": "1s" } } } } },
		},
		[
			"motion.duration.ui.press",
			"primitives.motion.duration.ui-press",
			"--motion-duration-ui-press",
		],
	);
});

Deno.test("motion - accepts durations in ms or s, including zero", () => {
	for (const value of ["0ms", "0s", "120ms", "0.2s", ".15s", "1.5ms"]) {
		assertEquals(getDiagnostics(duration(value)), [], value);
	}
});

Deno.test("motion - rejects a duration that is not a non-negative ms or s value", () => {
	for (const value of [
		"120",
		"0",
		"-10ms",
		"1sec",
		"100px",
		"120 ms",
		"1.ms",
		"2.s",
		"var(--d)",
		"",
	]) {
		assertRejected(duration(value), [
			'"motion.duration.ui.press"',
			JSON.stringify(value),
			"ms",
		]);
	}
	assertRejected(motion({ duration: { ui: { value: { press: 120 } } } } as never), [
		'"motion.duration.ui.press"',
	]);
});

Deno.test("motion - accepts CSS easing functions", () => {
	for (const value of [
		"linear",
		"ease",
		"ease-out",
		"ease-in-out",
		"step-start",
		"step-end",
		"cubic-bezier(0.23, 1, 0.32, 1)",
		"cubic-bezier(0,0,1,1)",
		"cubic-bezier(0.175, 0.885, 0.32, 1.275)",
		"cubic-bezier(.5, -2, .5, 3)",
		"steps(4)",
		"steps(4, jump-end)",
		"steps(2, jump-none)",
		"steps(1, start)",
		"linear(0, 1)",
		"linear(0, 0.25 75%, 1)",
		"linear(0, 0.5 25% 75%, 1)",
		"linear(0, 25% 75% 0.5, 1)",
	]) {
		assertEquals(codes(getDiagnostics(easing(value))), [], value);
	}
});

Deno.test("motion - rejects values that are not CSS easing functions", () => {
	for (const value of [
		"",
		"ease-inn",
		"EASE",
		"cubic-bezier(1.1, 0, 0.5, 1)",
		"cubic-bezier(0.5, 0, -0.1, 1)",
		"cubic-bezier(0.5, 0, 0.5)",
		"cubic-bezier(0.5, 0, 0.5, 1, 1)",
		"cubic-bezier(a, 0, 0.5, 1)",
		"cubic-bezier(0.5 0 0.5 1)",
		"cubic-bezier(1., 0, 1, 1)",
		"steps(0)",
		"steps(1.5)",
		"steps(4, sideways)",
		"steps(1, jump-none)",
		"linear()",
		"linear(fast)",
		"linear(0)",
		"linear(0, 25% 0.5 50%, 1)",
		"linear(0, 50% 60% 70%, 1)",
		"spring(1, 100, 10, 0)",
	]) {
		assertRejected(easing(value), ['"motion.easing.ui.enter"', JSON.stringify(value)]);
	}
});

Deno.test("motion - rejects malformed groups and settings", () => {
	assertRejected(motion({ durations: {} } as never), ['"motion"', '"durations"']);
	assertRejected(motion({ duration: { ui: { press: "120ms" } } } as never), [
		'"motion.duration.ui"',
		'"press"',
	]);
	assertRejected(motion({ easing: { ui: {} } } as never), ['"motion.easing.ui.value"']);
	assertRejected(duration("120ms", { lng: true } as never), [
		'"motion.duration.ui.settings"',
		'"lng"',
	]);
	assertRejected(duration("120ms", { long: "yes" } as never), [
		'"motion.duration.ui.settings.long"',
	]);
	assertRejected(
		motion({
			easing: { ui: { value: { out: "ease-out" }, settings: { long: true } } },
		} as never),
		['"motion.easing.ui.settings"', '"long"'],
	);
	assertRejected(motion({ duration: { "ui group": { value: { press: "120ms" } } } }), [
		"motion.duration.ui group",
	]);
});

Deno.test("motion - a UI duration over 300ms warns, 300ms does not", () => {
	assertEquals(getDiagnostics(duration("300ms")), []);
	assertEquals(getDiagnostics(duration("0.3s")), []);

	const [diagnostic, ...rest] = getDiagnostics(duration("0.301s"));
	assertEquals(rest, []);
	assertEquals(diagnostic?.code, "motion-long-duration");
	assertEquals(diagnostic?.severity, "warning");
	assertEquals(diagnostic?.path, "motion.duration.ui.press");
	for (const part of ["motion.duration.ui.press", "301ms", "300ms", "settings.long"]) {
		assert(
			diagnostic?.message.includes(part),
			`Expected "${part}" in: ${diagnostic?.message}`,
		);
	}
});

Deno.test("motion - a long group allows up to 500ms and warns above it", () => {
	assertEquals(getDiagnostics(duration("400ms", { long: true })), []);
	assertEquals(getDiagnostics(duration("500ms", { long: true })), []);

	const [diagnostic] = getDiagnostics(duration("501ms", { long: true }));
	assertEquals(diagnostic?.code, "motion-long-duration");
	assert(diagnostic?.message.includes("500ms"), diagnostic?.message);

	assertEquals(codes(getDiagnostics(duration("400ms", { long: false }))), [
		"motion-long-duration",
	]);
});

Deno.test("motion - ease-in and ease-in shaped curves warn", () => {
	for (const value of [
		"ease-in",
		"cubic-bezier(0.42, 0, 1, 1)",
		"cubic-bezier(0.55, 0.055, 0.675, 0.19)",
		"cubic-bezier(0.55, 0.085, 0.68, 0.53)",
		"cubic-bezier(0.6, -0.28, 0.735, 0.045)",
	]) {
		const diagnostics = getDiagnostics(easing(value));
		assertEquals(codes(diagnostics), ["motion-ease-in"], value);
		assertEquals(diagnostics[0]?.path, "motion.easing.ui.enter");
		assert(
			diagnostics[0]?.message.includes("motion.easing.ui.enter"),
			diagnostics[0]?.message,
		);
	}
});

Deno.test("motion - ease-out, ease-in-out and linear curves do not warn", () => {
	for (const value of [
		"ease",
		"ease-out",
		"ease-in-out",
		"linear",
		"cubic-bezier(0, 0, 1, 1)",
		"cubic-bezier(0.42, 0, 0.58, 1)",
		"cubic-bezier(0.23, 1, 0.32, 1)",
		"cubic-bezier(0.77, 0, 0.175, 1)",
		"cubic-bezier(0.175, 0.885, 0.32, 1.275)",
		"steps(4)",
		"linear(0, 0.1 50%, 1)",
	]) {
		assertEquals(getDiagnostics(easing(value)), [], value);
	}
});
