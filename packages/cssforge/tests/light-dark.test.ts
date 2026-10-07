import { generateJSON, generateTS } from "../src/generator.ts";
import type { CSSForgeConfig, LightDarkSettings } from "../src/mod.ts";
import { defineConfig, generateCSS, generateStyleDictionaryJSON } from "../src/mod.ts";
import { assert, assertEquals, assertThrows, Deno } from "./vitest-compat.ts";

const palette = {
	value: {
		base: { white: "oklch(100% 0 none)", ink: "oklch(14.5% 0 none)" },
	},
};

const pairedConfig = (
	lightDark: LightDarkSettings = { light: "light", dark: "dark" },
): Partial<CSSForgeConfig> & Pick<CSSForgeConfig, "colors"> =>
	defineConfig({
		colors: {
			palette,
			theme: {
				value: {
					light: {
						value: {
							background: {
								value: { primary: "var(--white)" },
								variables: { white: "palette.base.white" },
							},
							text: { value: { body: "black" } },
						},
					},
					dark: {
						value: {
							background: {
								value: { primary: "var(--ink)" },
								variables: { ink: "palette.base.ink" },
							},
							text: {
								value: {
									body: {
										mix: { from: "palette.base.white", with: "black", amount: 10 },
									},
								},
							},
						},
					},
				},
				settings: { lightDark },
			},
		},
	});

/** A paired config whose `lightDark` setting is written as a JavaScript config may write it. */
const withLightDark = (lightDark: unknown) => {
	const config = pairedConfig();
	(config.colors.theme as { settings: unknown }).settings = { lightDark };
	return config;
};

const throwsAt = (config: unknown, ...fragments: string[]) => {
	const error = assertThrows(() => generateCSS(config as CSSForgeConfig));
	for (const fragment of fragments) {
		assert(
			error.message.includes(fragment),
			`Expected the error to include ${fragment}. Received: ${error.message}`,
		);
	}
};

Deno.test("generateCSS - lightDark emits one light-dark() token per paired color at :root", () => {
	const css = generateCSS(pairedConfig());
	const themes = css.slice(css.indexOf("/* Themes */"));

	assertEquals(
		themes,
		[
			"/* Themes */",
			"/* Theme: light-dark(light, dark) */",
			"color-scheme: light dark;",
			"/* background */",
			"--theme-background-primary: light-dark(var(--palette-base-white), var(--palette-base-ink));",
			"/* text */",
			"--theme-text-body: light-dark(black, color-mix(in oklch, var(--palette-base-white), black 10%));",
			"}",
		].join("\n"),
	);
});

Deno.test("generateCSS - lightDark colorScheme emits a color-scheme override rule per scheme", () => {
	const css = generateCSS(
		pairedConfig({
			light: "light",
			dark: "dark",
			colorScheme: { light: '[data-theme="light"]', dark: '[data-theme="dark"]' },
		}),
	);

	assert(
		css.endsWith(
			[
				"}",
				'[data-theme="light"] {',
				"  color-scheme: light;",
				"}",
				'[data-theme="dark"] {',
				"  color-scheme: dark;",
				"}",
			].join("\n"),
		),
		css,
	);
});

Deno.test("generateCSS - lightDark names a paired variantNameOnly color by its variant", () => {
	const variantNameOnly = { variantNameOnly: true };
	const css = generateCSS(
		defineConfig({
			colors: {
				palette,
				theme: {
					value: {
						light: {
							value: {
								surface: { value: { background: "white" }, settings: variantNameOnly },
							},
						},
						dark: {
							value: {
								surface: { value: { background: "black" }, settings: variantNameOnly },
							},
						},
					},
					settings: { lightDark: { light: "light", dark: "dark" } },
				},
			},
		}),
	);

	assert(css.includes("--background: light-dark(white, black);"), css);
});

Deno.test("generateCSS - lightDark keeps unpaired themes with their selector", () => {
	const config = pairedConfig();
	const theme = config.colors.theme as { value: Record<string, unknown> };
	theme.value.pink = {
		value: { background: { value: { primary: "pink" } } },
		settings: { selector: ".ThemePink" },
	};
	const css = generateCSS(config);

	assert(
		css.endsWith(
			[
				"/* Theme: pink */",
				".ThemePink {",
				"  /* background */",
				"  --theme-pink-background-primary: pink;",
				"}",
			].join("\n"),
		),
		css,
	);
	assert(!css.includes("--theme-light-"), css);
	assert(!css.includes("--theme-dark-"), css);
});

Deno.test("generateCSS - a token path to a paired color resolves to the light-dark() token", () => {
	const config = pairedConfig();
	config.primitives = {
		card: {
			value: {
				surface: {
					value: { background: "var(--bg)" },
					variables: { bg: "theme.background.primary" },
				},
			},
		},
	};
	const css = generateCSS(config);

	assert(
		css.includes("--card-surface-background: var(--theme-background-primary);"),
		css,
	);
});

Deno.test("generateCSS - a paired mix references an earlier paired variant", () => {
	const config = pairedConfig();
	const theme = config.colors.theme as {
		value: Record<string, { value: Record<string, { value: Record<string, unknown> }> }>;
	};
	for (const scheme of ["light", "dark"]) {
		theme.value[scheme].value.background.value.hover = {
			mix: { from: "theme.background.primary", with: "black", amount: 5 },
		};
	}

	assert(
		generateCSS(config).includes(
			"--theme-background-hover: light-dark(color-mix(in oklch, var(--theme-background-primary), black 5%), color-mix(in oklch, var(--theme-background-primary), black 5%));",
		),
	);
});

Deno.test("generateJSON - lightDark paired tokens sit at theme.<color>.<variant>", () => {
	const json = JSON.parse(generateJSON(pairedConfig()));

	assertEquals(json.theme, {
		background: {
			primary: {
				key: "--theme-background-primary",
				value: "light-dark(var(--palette-base-white), var(--palette-base-ink))",
				variable:
					"--theme-background-primary: light-dark(var(--palette-base-white), var(--palette-base-ink));",
			},
		},
		text: {
			body: {
				key: "--theme-text-body",
				value:
					"light-dark(black, color-mix(in oklch, var(--palette-base-white), black 10%))",
				variable:
					"--theme-text-body: light-dark(black, color-mix(in oklch, var(--palette-base-white), black 10%));",
			},
		},
	});
	assert(
		generateTS(pairedConfig()).includes('"key": "--theme-background-primary"'),
		"TS output carries the paired token",
	);
});

Deno.test("generateStyleDictionaryJSON - a paired token resolves both schemes and references both", () => {
	const tokens = JSON.parse(generateStyleDictionaryJSON(pairedConfig()));
	const primary = tokens.theme.background.primary;

	assertEquals(primary.value, "light-dark(oklch(100% 0 none), oklch(14.5% 0 none))");
	assertEquals(primary.type, "color");
	assertEquals(primary.attributes.referencePaths, [
		"palette.base.white",
		"palette.base.ink",
	]);
});

Deno.test("generateCSS - lightDark rejects paired themes that declare different variants", () => {
	const config = pairedConfig();
	const theme = config.colors.theme as {
		value: Record<string, { value: Record<string, { value: Record<string, string> }> }>;
	};
	theme.value.light.value.background.value.secondary = "white";
	theme.value.dark.value.border = { value: { subtle: "gray" } };

	throwsAt(
		config,
		'"theme.settings.lightDark"',
		'"theme.dark.background.secondary"',
		'"theme.light.border.subtle"',
	);
});

Deno.test("generateCSS - lightDark rejects a selector or atRule on a paired theme", () => {
	const config = pairedConfig();
	const theme = config.colors.theme as { value: Record<string, { settings?: unknown }> };
	theme.value.dark.settings = { selector: ".dark" };

	throwsAt(config, '"theme.dark.settings"', '"selector"', "lightDark");
});

Deno.test("generateCSS - lightDark rejects paired colors that disagree on variantNameOnly", () => {
	const config = pairedConfig();
	const theme = config.colors.theme as {
		value: Record<string, { value: Record<string, { settings?: unknown }> }>;
	};
	theme.value.dark.value.text.settings = { variantNameOnly: true };

	throwsAt(config, '"theme.dark.text.settings.variantNameOnly"', '"theme.light.text"');
});

Deno.test("generateCSS - lightDark rejects a paired color named like an unpaired theme", () => {
	const config = pairedConfig();
	const theme = config.colors.theme as { value: Record<string, unknown> };
	theme.value.text = { value: { accent: { value: { primary: "red" } } } };

	throwsAt(config, '"theme.light.text"', 'the theme "text"');
});

Deno.test("generateCSS - lightDark settings are validated with their configuration path", () => {
	throwsAt(
		withLightDark({ light: "light", dark: "night" }),
		'"theme.settings.lightDark.dark"',
		'"night"',
	);
	throwsAt(
		withLightDark({ light: "light", dark: "light" }),
		'"theme.settings.lightDark"',
	);
	throwsAt(withLightDark({ light: "light" }), '"theme.settings.lightDark.dark"');
	throwsAt(withLightDark({ light: "light", dark: "dark", auto: true }), '"auto"');
	throwsAt(withLightDark("light"), '"theme.settings.lightDark"');
	throwsAt(
		withLightDark({ light: "light", dark: "dark", colorScheme: { light: "" } }),
		'"theme.settings.lightDark.colorScheme.light"',
	);
	throwsAt(
		withLightDark({ light: "light", dark: "dark", colorScheme: { system: ":root" } }),
		'"system"',
	);

	const unknownSetting = pairedConfig();
	(unknownSetting.colors.theme as { settings: unknown }).settings = { scheme: "auto" };
	throwsAt(unknownSetting, '"theme.settings"', '"scheme"');

	const unknownKey = pairedConfig();
	(unknownKey.colors.theme as Record<string, unknown>).extra = {};
	throwsAt(unknownKey, '"theme"', '"extra"');
});

Deno.test("generateCSS - theme settings are rejected beside named themes", () => {
	throwsAt(
		{
			colors: {
				palette,
				theme: {
					light: { value: { background: { value: { primary: "white" } } } },
					settings: { lightDark: { light: "light", dark: "dark" } },
				},
			},
		},
		'"theme.settings"',
		"value",
	);
});
