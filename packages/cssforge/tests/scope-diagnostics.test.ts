import { defineConfig, getScopeDiagnostics, type ScopeDiagnostic } from "../src/mod.ts";
import { assertEquals, assertThrows, Deno } from "./vitest-compat.ts";

/** A palette whose only declaration is wrapped in `selector`. */
const paletteUnder = (selector: string) => ({
	value: {
		another: {
			value: { yellow: { hex: "#FFFF00" }, cyan: { hex: "#00FFFF" } },
			settings: { selector },
		},
	},
});

/** A palette declaration emitted in `:root`, available to every element. */
const rootPalette = {
	value: { simple: { value: { white: { hex: "#ffffff" } } } },
};

/** A theme color whose only declaration aliases `palette.another.yellow`. */
const darkTheme = {
	value: {
		background: {
			value: { primary: "var(--1)" },
			variables: { 1: "palette.another.yellow" },
			settings: { variantNameOnly: true },
		},
	},
	settings: { atRule: "@media (prefers-color-scheme: dark)" },
};

const withoutMessage = (diagnostic: ScopeDiagnostic) => {
	const { message: _message, ...rest } = diagnostic;
	return rest;
};

Deno.test("scope diagnostics - a root alias that depends on a selector-scoped source is reported", () => {
	const diagnostics = getScopeDiagnostics(
		defineConfig({
			colors: { palette: paletteUnder(".Another"), theme: { dark: darkTheme } },
		}),
	);

	assertEquals(diagnostics.length, 1);
	const [diagnostic] = diagnostics;

	assertEquals(withoutMessage(diagnostic), {
		code: "scope-unavailable-reference",
		severity: "warning",
		consumer: {
			path: "theme.dark.background.primary",
			key: "--primary",
			atRule: "@media (prefers-color-scheme: dark)",
		},
		referenceKey: "--palette-another-yellow",
		sources: [
			{
				path: "palette.another.yellow",
				key: "--palette-another-yellow",
				selector: ".Another",
			},
		],
		issues: ["selector"],
	});

	// The message carries both configuration paths, both property names and both scopes.
	for (const fact of [
		"theme.dark.background.primary",
		"--primary",
		"@media (prefers-color-scheme: dark)",
		"palette.another.yellow",
		"--palette-another-yellow",
		".Another",
		"must match the root element",
	]) {
		assertEquals(diagnostic.message.includes(fact), true, fact);
	}
});

Deno.test("scope diagnostics - the documented :root.Another arrangement is not reported", () => {
	const diagnostics = getScopeDiagnostics(
		defineConfig({
			colors: {
				palette: paletteUnder(":root.Another"),
				theme: {
					light: {
						value: {
							background: {
								value: { primary: "var(--1)" },
								variables: { 1: "palette.another.cyan" },
								settings: { variantNameOnly: true },
							},
						},
					},
					dark: darkTheme,
				},
			},
		}),
	);

	assertEquals(diagnostics, []);
});

Deno.test("scope diagnostics - a root source consumed by a selector-scoped alias is not reported", () => {
	const diagnostics = getScopeDiagnostics(
		defineConfig({
			colors: {
				palette: rootPalette,
				theme: {
					dark: {
						value: {
							background: {
								value: { primary: "var(--1)" },
								variables: { 1: "palette.simple.white" },
								settings: { variantNameOnly: true },
							},
						},
						settings: { selector: ".Theme" },
					},
				},
			},
		}),
	);

	assertEquals(diagnostics, []);
});

Deno.test("scope diagnostics - a source that shares the consumer's condition is not reported", () => {
	const diagnostics = getScopeDiagnostics(
		defineConfig({
			colors: {
				palette: {
					value: {
						another: {
							value: { yellow: { hex: "#FFFF00" } },
							settings: { atRule: "@media (prefers-color-scheme: dark)" },
						},
					},
				},
				theme: { dark: darkTheme },
			},
		}),
	);

	assertEquals(diagnostics, []);
});

Deno.test("scope diagnostics - a source that does not cover the alias condition is reported", () => {
	const diagnostics = getScopeDiagnostics(
		defineConfig({
			colors: {
				palette: {
					value: {
						another: {
							value: { yellow: { hex: "#FFFF00" } },
							settings: { atRule: "@media (prefers-color-scheme: dark)" },
						},
					},
				},
				theme: {
					light: {
						value: {
							background: {
								value: { primary: "var(--1)" },
								variables: { 1: "palette.another.yellow" },
								settings: { variantNameOnly: true },
							},
						},
					},
				},
			},
		}),
	);

	assertEquals(diagnostics.length, 1);
	assertEquals(diagnostics[0].issues, ["at-rule"]);
	assertEquals(diagnostics[0].sources, [
		{
			path: "palette.another.yellow",
			key: "--palette-another-yellow",
			atRule: "@media (prefers-color-scheme: dark)",
		},
	]);
	assertEquals(
		diagnostics[0].message.includes("repeat the condition"),
		true,
		diagnostics[0].message,
	);
});

Deno.test("scope diagnostics - unrelated conditions stay silent", () => {
	const diagnostics = getScopeDiagnostics(
		defineConfig({
			colors: {
				palette: {
					value: {
						another: {
							value: { yellow: { hex: "#FFFF00" } },
							settings: { atRule: "@media (prefers-color-scheme: dark)" },
						},
					},
				},
				theme: {
					light: {
						value: {
							background: {
								value: { primary: "var(--1)" },
								variables: { 1: "palette.another.yellow" },
								settings: { variantNameOnly: true },
							},
						},
						settings: { atRule: "@media (prefers-color-scheme: light)" },
					},
				},
			},
		}),
	);

	assertEquals(diagnostics, []);
});

Deno.test("scope diagnostics - another declaration of the referenced property covers the alias", () => {
	const themeColor = (variablePath: string) => ({
		value: {
			background: {
				value: { primary: "var(--1)" },
				variables: { 1: variablePath },
				settings: { variantNameOnly: true },
			},
		},
	});

	const diagnostics = getScopeDiagnostics(
		defineConfig({
			colors: {
				palette: {
					value: {
						simple: { value: { white: { hex: "#ffffff" } } },
						another: {
							value: { yellow: { hex: "#FFFF00" }, cyan: { hex: "#00FFFF" } },
							settings: { selector: ".Another" },
						},
					},
				},
				theme: {
					light: themeColor("palette.simple.white"),
					dark: {
						...themeColor("palette.another.yellow"),
						settings: { selector: ".Another" },
					},
					probe: {
						value: {
							background: {
								value: { primary: "var(--1)" },
								variables: { 1: "theme.dark.background.primary" },
							},
						},
					},
				},
			},
		}),
	);

	// `--primary` is also declared in `:root` by the light theme, so the probe
	// resolves even though its own source is selector-scoped.
	assertEquals(diagnostics, []);
});

Deno.test("scope diagnostics - external references and var() fallbacks stay silent", () => {
	const alias = (value: string, variables?: Record<string, string>) => ({
		value: {
			background: {
				value: { primary: value },
				...(variables ? { variables } : {}),
			},
		},
	});

	const diagnostics = getScopeDiagnostics(
		defineConfig({
			colors: {
				palette: paletteUnder(".Another"),
				theme: {
					light: alias("var(--brand-external, red)"),
					dark: alias("var(--brand-external, var(--palette-another-yellow))"),
				},
			},
		}),
	);

	assertEquals(diagnostics, []);
});

Deno.test("scope diagnostics - a raw var() reference to a generated property is reported", () => {
	const diagnostics = getScopeDiagnostics(
		defineConfig({
			colors: {
				palette: paletteUnder(".Another"),
				theme: {
					dark: {
						value: {
							background: {
								value: { primary: "var(--palette-another-yellow)" },
								settings: { variantNameOnly: true },
							},
						},
					},
				},
			},
		}),
	);

	assertEquals(diagnostics.length, 1);
	assertEquals(diagnostics[0].referenceKey, "--palette-another-yellow");
	assertEquals(diagnostics[0].consumer.path, "theme.dark.background.primary");
	assertEquals(
		diagnostics[0].sources.map((source) => source.path),
		["palette.another.yellow"],
	);
});

Deno.test("scope diagnostics - a selector list with a root branch is not reported", () => {
	// The `:root` or `html` branch applies to the root element, so the source is
	// available where the alias is computed even though other branches are not.
	for (const selector of [':root, [data-theme="dark"]', "html, .Another"]) {
		const diagnostics = getScopeDiagnostics(
			defineConfig({
				colors: { palette: paletteUnder(selector), theme: { dark: darkTheme } },
			}),
		);

		assertEquals(diagnostics, [], selector);
	}
});

Deno.test("scope diagnostics - a source that cannot match the root element is reported as definite", () => {
	// A descendant combinator never matches the root element, so this source can
	// never be available where the alias is computed.
	const diagnostics = getScopeDiagnostics(
		defineConfig({
			colors: { palette: paletteUnder(":root .Another"), theme: { dark: darkTheme } },
		}),
	);

	assertEquals(diagnostics.length, 1);
	assertEquals(diagnostics[0].issues, ["selector"]);
	assertEquals(diagnostics[0].sources[0].selector, ":root .Another");
	assertEquals(
		diagnostics[0].message.includes("can never provide"),
		true,
		diagnostics[0].message,
	);
});

Deno.test("scope diagnostics - two different selectors stay silent", () => {
	const themeColor = {
		value: {
			background: {
				value: { primary: "var(--1)" },
				variables: { 1: "palette.another.yellow" },
				settings: { variantNameOnly: true },
			},
		},
		settings: { selector: ".Dark" },
	};

	const diagnostics = getScopeDiagnostics(
		defineConfig({
			colors: {
				// Both declarations are selector-scoped and neither selector implies
				// the other, so the configuration alone cannot decide availability.
				palette: paletteUnder(".Another"),
				theme: { dark: themeColor },
			},
		}),
	);

	assertEquals(diagnostics, []);
});

Deno.test("scope diagnostics - primitive tokens are checked as root declarations", () => {
	const diagnostics = getScopeDiagnostics(
		defineConfig({
			colors: { palette: paletteUnder(".Another") },
			primitives: {
				button: {
					value: {
						default: {
							value: { background: "var(--1)" },
							variables: { 1: "palette.another.yellow" },
							settings: { pxToRem: false },
						},
					},
				},
			},
		}),
	);

	assertEquals(diagnostics.length, 1);
	assertEquals(diagnostics[0].consumer, {
		path: "primitives.button.default.background",
		key: "--button-default-background",
	});
	assertEquals(diagnostics[0].issues, ["selector"]);
});

Deno.test("scope diagnostics - suppression is targeted by configuration path", () => {
	const themeColor = (variablePath: string) => ({
		value: {
			background: {
				value: { primary: "var(--1)" },
				variables: { 1: variablePath },
			},
		},
	});

	const config = (suppress?: string[]) =>
		defineConfig({
			diagnostics: suppress ? { suppress } : undefined,
			colors: {
				palette: paletteUnder(".Another"),
				theme: {
					light: themeColor("palette.another.cyan"),
					dark: themeColor("palette.another.yellow"),
				},
			},
		});

	assertEquals(
		getScopeDiagnostics(config()).map((diagnostic) => diagnostic.consumer.path),
		["theme.light.background.primary", "theme.dark.background.primary"],
	);

	assertEquals(
		getScopeDiagnostics(config(["theme.light.background.primary"])).map(
			(diagnostic) => diagnostic.consumer.path,
		),
		["theme.dark.background.primary"],
	);

	// Surrounding whitespace does not turn a suppression into a no-op.
	assertEquals(
		getScopeDiagnostics(config(["  theme.light.background.primary  "])).map(
			(diagnostic) => diagnostic.consumer.path,
		),
		["theme.dark.background.primary"],
	);

	assertEquals(getScopeDiagnostics(config(["*"])), []);
});

Deno.test("scope diagnostics - an invalid suppression list is rejected", () => {
	const error = assertThrows(() =>
		getScopeDiagnostics(
			defineConfig({
				// A configuration file is data at runtime, so the shape is validated.
				diagnostics: { suppress: "theme.dark.background.primary" } as never,
				colors: { palette: paletteUnder(".Another"), theme: { dark: darkTheme } },
			}),
		),
	);

	assertEquals(error.message.includes("diagnostics.suppress"), true, error.message);
});
