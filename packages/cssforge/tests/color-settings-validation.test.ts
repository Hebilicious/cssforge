import { expect, test } from "vitest";
import type { CSSForgeConfig } from "../src/mod.ts";
import { defineConfig, generateCSS } from "../src/mod.ts";
import { thrownError } from "./helpers.ts";

/** Settings are read from a JavaScript object at runtime, so they are validated. */

test("generateCSS - rejects a fallback format that is not generated", () => {
	const config = {
		colors: {
			palette: {
				value: { coral: { 100: { hex: "#FF7F50" } } },
				settings: { color: { formats: { hex: true }, fallback: "rgb" } },
			},
		},
	} as unknown as CSSForgeConfig;

	const error = thrownError(() => generateCSS(config));

	expect(
		error.message.includes('"rgb"'),
		`Expected the error to name the missing format. Received: ${error.message}`,
	).toBeTruthy();
});

test("generateCSS - rejects a fallback format without its string output", () => {
	const config = defineConfig({
		colors: {
			palette: {
				value: { coral: { 100: { hex: "#FF7F50" } } },
				settings: {
					color: { formats: { hex: { digits: true } }, fallback: "hex" },
				},
			},
		},
	});

	const error = thrownError(() => generateCSS(config));

	expect(
		error.message.includes('"string"'),
		`Expected the error to ask for the string output. Received: ${error.message}`,
	).toBeTruthy();
});

test("generateCSS - a format rejects a color that carries alpha when it sets alpha false", () => {
	const config = defineConfig({
		colors: {
			palette: {
				value: {
					coral: { 100: "rgb(0 0 0 / 12%)" },
					opaque: { 100: { hex: "#FF7F50" } },
				},
				settings: { color: { formats: { hex: { string: true, alpha: false } } } },
			},
		},
	});

	const error = thrownError(() => generateCSS(config));

	expect(
		error.message.includes('"palette.coral.100"') && error.message.includes('"hex"'),
		`Expected the error to name the variant and the format. Received: ${error.message}`,
	).toBeTruthy();
});

test("generateCSS - rejects an unknown color format", () => {
	const palette = { value: { coral: { 100: { hex: "#FF7F50" } } } };
	const invalidPalette = {
		colors: { palette: { ...palette, settings: { color: { formats: { hsl: true } } } } },
	} as unknown as CSSForgeConfig;
	const invalidColor = {
		colors: {
			palette: {
				value: {
					coral: {
						value: { 100: { hex: "#FF7F50" } },
						settings: { color: { formats: { sqrgb: true } } },
					},
				},
			},
		},
	} as unknown as CSSForgeConfig;

	const paletteError = thrownError(() => generateCSS(invalidPalette));
	const colorError = thrownError(() => generateCSS(invalidColor));

	expect(
		paletteError.message.includes('"palette.settings.color.formats"') &&
			paletteError.message.includes("hsl"),
		`Expected the error to name the path and the value. Received: ${paletteError.message}`,
	).toBeTruthy();
	expect(
		colorError.message.includes('"palette.coral.settings.color.formats"'),
		`Expected the error to name "palette.coral.settings.color.formats". Received: ${colorError.message}`,
	).toBeTruthy();
});

test("generateCSS - rejects an output a format does not produce", () => {
	const palette = { value: { coral: { 100: { hex: "#FF7F50" } } } };
	const arrayOnHex = {
		colors: {
			palette: { ...palette, settings: { color: { formats: { hex: { array: true } } } } },
		},
	} as unknown as CSSForgeConfig;
	const digitsOnRgb = {
		colors: {
			palette: {
				...palette,
				settings: { color: { formats: { rgb: { digits: true } } } },
			},
		},
	} as unknown as CSSForgeConfig;
	const nothingEnabled = {
		colors: { palette: { ...palette, settings: { color: { formats: { hex: {} } } } } },
	} as unknown as CSSForgeConfig;

	const hexError = thrownError(() => generateCSS(arrayOnHex));
	const rgbError = thrownError(() => generateCSS(digitsOnRgb));
	const emptyError = thrownError(() => generateCSS(nothingEnabled));

	expect(
		hexError.message.includes('"palette.settings.color.formats.hex"') &&
			hexError.message.includes('"digits"'),
		`Expected the error to list the hex outputs. Received: ${hexError.message}`,
	).toBeTruthy();
	expect(
		rgbError.message.includes('"palette.settings.color.formats.rgb"') &&
			rgbError.message.includes('"array"'),
		`Expected the error to list the rgb outputs. Received: ${rgbError.message}`,
	).toBeTruthy();
	expect(
		emptyError.message.includes('"palette.settings.color.formats.hex"'),
		`Expected the error to name the empty format. Received: ${emptyError.message}`,
	).toBeTruthy();
});

test("generateCSS - rejects an alpha that is not a boolean or an opacity", () => {
	const palette = { value: { coral: { 100: { hex: "#FF7F50" } } } };
	const notAnOpacity = {
		colors: {
			palette: {
				...palette,
				settings: { color: { formats: { hex: { string: true, alpha: 2 } } } },
			},
		},
	} as unknown as CSSForgeConfig;

	const error = thrownError(() => generateCSS(notAnOpacity));

	expect(
		error.message.includes('"palette.settings.color.formats.hex.alpha"'),
		`Expected the error to name the format's alpha. Received: ${error.message}`,
	).toBeTruthy();
});

test("generateCSS - rejects an alpha outside a format", () => {
	const config = {
		colors: {
			palette: {
				value: { coral: { 100: { hex: "#FF7F50" } } },
				settings: { color: { formats: { hex: true }, alpha: 0.5 } },
			},
		},
	} as unknown as CSSForgeConfig;

	const error = thrownError(() => generateCSS(config));

	expect(
		error.message.includes('"palette.settings.color"') &&
			error.message.includes("formats.hex.alpha"),
		`Expected the error to point at the format. Received: ${error.message}`,
	).toBeTruthy();
});

test("generateCSS - rejects color settings that are not inside settings", () => {
	const palette = { value: { coral: { 100: { hex: "#FF7F50" } } } };
	const colorOnPalette = {
		colors: { palette: { ...palette, color: { formats: { hex: true } } } },
	} as unknown as CSSForgeConfig;
	const formatsInSettings = {
		colors: { palette: { ...palette, settings: { formats: { hex: true } } } },
	} as unknown as CSSForgeConfig;
	const fallbackOnColor = {
		colors: {
			palette: {
				value: {
					coral: {
						value: { 100: { hex: "#FF7F50" } },
						fallback: "hex",
					},
				},
			},
		},
	} as unknown as CSSForgeConfig;

	const paletteError = thrownError(() => generateCSS(colorOnPalette));
	const settingsError = thrownError(() => generateCSS(formatsInSettings));
	const colorError = thrownError(() => generateCSS(fallbackOnColor));

	expect(
		paletteError.message.includes('"palette"'),
		`Expected the error to name "palette". Received: ${paletteError.message}`,
	).toBeTruthy();
	expect(
		settingsError.message.includes('"palette.settings.color"'),
		`Expected the error to name "palette.settings.color". Received: ${settingsError.message}`,
	).toBeTruthy();
	expect(
		colorError.message.includes('"palette.coral"'),
		`Expected the error to name "palette.coral". Received: ${colorError.message}`,
	).toBeTruthy();
});

test("generateCSS - rejects an unknown key in settings", () => {
	const palette = { value: { coral: { 100: { hex: "#FF7F50" } } } };
	const misspelled = {
		colors: { palette: { ...palette, settings: { colour: { formats: { hex: true } } } } },
	} as unknown as CSSForgeConfig;

	const error = thrownError(() => generateCSS(misspelled));

	expect(
		error.message.includes('"palette.settings"') && error.message.includes('"colour"'),
		`Expected the error to name the path and the unknown key. Received: ${error.message}`,
	).toBeTruthy();
	expect(
		error.message.includes('"color"'),
		`Expected the error to list the accepted key. Received: ${error.message}`,
	).toBeTruthy();
});

test("generateCSS - rejects an unknown key beside the formats", () => {
	const palette = { value: { coral: { 100: { hex: "#FF7F50" } } } };
	const misspelled = {
		colors: {
			palette: {
				...palette,
				settings: { color: { formats: { hex: true }, alfpha: 0.5 } },
			},
		},
	} as unknown as CSSForgeConfig;

	const error = thrownError(() => generateCSS(misspelled));

	expect(
		error.message.includes('"palette.settings.color"') &&
			error.message.includes('"alfpha"') &&
			error.message.includes('"fallback"'),
		`Expected the error to name the path, the unknown key and the accepted keys. Received: ${error.message}`,
	).toBeTruthy();
});

test("generateCSS - rejects an unknown key on a palette color entry", () => {
	const unknownKey = {
		colors: {
			palette: {
				value: {
					coral: {
						value: { 100: { hex: "#FF7F50" } },
						settings: { color: { formats: { hex: true } } },
						selectr: ".coral",
					},
				},
			},
		},
	} as unknown as CSSForgeConfig;
	const unknownSetting = {
		colors: {
			palette: {
				value: {
					coral: {
						value: { 100: { hex: "#FF7F50" } },
						settings: { color: { formats: { hex: true } }, selectr: ".coral" },
					},
				},
			},
		},
	} as unknown as CSSForgeConfig;

	const entryError = thrownError(() => generateCSS(unknownKey));
	const settingsError = thrownError(() => generateCSS(unknownSetting));

	expect(
		entryError.message.includes('"palette.coral"') &&
			entryError.message.includes('"selectr"'),
		`Expected the error to name the entry and the key. Received: ${entryError.message}`,
	).toBeTruthy();
	expect(
		settingsError.message.includes('"palette.coral.settings"') &&
			settingsError.message.includes('"selector"'),
		`Expected the error to name the settings and the accepted keys. Received: ${settingsError.message}`,
	).toBeTruthy();
});

test("generateCSS - rejects color format settings on gradients and themes", () => {
	const base = { palette: { value: { coral: { 100: { hex: "#FF7F50" } } } } };
	const onGradient = {
		colors: {
			...base,
			gradients: {
				value: { g: { value: { primary: { value: "linear-gradient(red, blue)" } } } },
				settings: { color: { formats: { hex: true } } },
			},
		},
	} as unknown as CSSForgeConfig;
	const onTheme = {
		colors: {
			...base,
			theme: {
				light: {
					value: {
						content: {
							value: { primary: "var(--one)" },
							variables: { one: "palette.coral.100" },
						},
					},
					settings: { formats: { hex: true } },
				},
			},
		},
	} as unknown as CSSForgeConfig;

	const gradientError = thrownError(() => generateCSS(onGradient));
	const themeError = thrownError(() => generateCSS(onTheme));

	expect(
		gradientError.message.includes('"gradients.settings"') &&
			gradientError.message.includes("palette"),
		`Expected the error to point at the palette. Received: ${gradientError.message}`,
	).toBeTruthy();
	expect(
		themeError.message.includes('"theme.light.settings"') &&
			themeError.message.includes("palette"),
		`Expected the error to point at the palette. Received: ${themeError.message}`,
	).toBeTruthy();
});

test("generateCSS - a fallback error names the color it was resolved for", () => {
	const palette = { value: { coral: { 100: { hex: "#FF7F50" } } } };
	const namedButMissing = {
		colors: {
			palette: {
				...palette,
				settings: { color: { formats: { hex: true }, fallback: "rgb" } },
			},
		},
	} as unknown as CSSForgeConfig;
	const namedWithoutString = {
		colors: {
			palette: {
				...palette,
				settings: {
					color: { formats: { hex: { digits: true } }, fallback: "hex" },
				},
			},
		},
	} as unknown as CSSForgeConfig;

	const missingError = thrownError(() => generateCSS(namedButMissing));
	const stringError = thrownError(() => generateCSS(namedWithoutString));

	expect(
		missingError.message.includes('"palette.coral"') &&
			missingError.message.includes('"rgb"'),
		`Expected the error to name the color and the format. Received: ${missingError.message}`,
	).toBeTruthy();
	expect(
		stringError.message.includes('"palette.coral"') &&
			stringError.message.includes('"string"'),
		`Expected the error to name the color and the output. Received: ${stringError.message}`,
	).toBeTruthy();
});

test("generateCSS - rejects color format settings on a theme color", () => {
	// This check used to sit inside the theme try block, which logged and dropped
	// the theme instead of reporting the configuration.
	const config = {
		colors: {
			palette: { value: { coral: { 100: { hex: "#FF7F50" } } } },
			theme: {
				light: {
					value: {
						content: {
							value: { primary: "var(--one)" },
							variables: { one: "palette.coral.100" },
							settings: { color: { formats: { hex: true } } },
						},
					},
				},
			},
		},
	} as unknown as CSSForgeConfig;

	const error = thrownError(() => generateCSS(config));

	expect(
		error.message.includes('"theme.light.content.settings"'),
		`Expected the error to name the theme color. Received: ${error.message}`,
	).toBeTruthy();
});

test("generateCSS - rejects unknown keys at the gradient and theme levels", () => {
	const base = { palette: { value: { coral: { 100: { hex: "#FF7F50" } } } } };
	const onTheme = {
		colors: {
			...base,
			theme: {
				light: {
					value: {
						content: {
							value: { primary: "var(--one)" },
							variables: { one: "palette.coral.100" },
						},
					},
					settings: { selectr: ".light" },
				},
			},
		},
	} as unknown as CSSForgeConfig;
	const onThemeColor = {
		colors: {
			...base,
			theme: {
				light: {
					value: {
						content: {
							value: { primary: "var(--one)" },
							variables: { one: "palette.coral.100" },
							settings: { variantNameOnyl: true },
						},
					},
				},
			},
		},
	} as unknown as CSSForgeConfig;
	const onGradientLevel = {
		colors: {
			...base,
			gradients: {
				value: { g: { value: { primary: { value: "linear-gradient(red, blue)" } } } },
				settings: { selector: ".g" },
			},
		},
	} as unknown as CSSForgeConfig;

	const themeError = thrownError(() => generateCSS(onTheme));
	const themeColorError = thrownError(() => generateCSS(onThemeColor));
	const gradientError = thrownError(() => generateCSS(onGradientLevel));

	expect(
		themeError.message.includes('"theme.light.settings"') &&
			themeError.message.includes('"selectr"'),
		`Expected the theme settings key to be rejected. Received: ${themeError.message}`,
	).toBeTruthy();
	expect(
		themeColorError.message.includes('"theme.light.content.settings"') &&
			themeColorError.message.includes('"variantNameOnly"'),
		`Expected the theme color settings key to be rejected. Received: ${themeColorError.message}`,
	).toBeTruthy();
	expect(
		gradientError.message.includes('"gradients.settings"') &&
			gradientError.message.includes("reads no settings"),
		`Expected the unread gradient settings to be rejected. Received: ${gradientError.message}`,
	).toBeTruthy();
});

test("generateCSS - rejects formats set to false", () => {
	const palette = { value: { coral: { 100: { hex: "#FF7F50" } } } };
	const config = {
		colors: { palette: { ...palette, settings: { color: { formats: false } } } },
	} as unknown as CSSForgeConfig;

	const error = thrownError(() => generateCSS(config));

	expect(
		error.message.includes('"palette.settings.color.formats"'),
		`Expected the error to name the formats. Received: ${error.message}`,
	).toBeTruthy();
});

test("generateCSS - rejects settings a gradient variant does not read", () => {
	const config = {
		colors: {
			palette: { value: { coral: { 100: { hex: "#FF7F50" } } } },
			gradients: {
				value: {
					g: {
						value: {
							primary: {
								value: "linear-gradient(red, blue)",
								settings: { selector: ".g" },
							},
						},
					},
				},
			},
		},
	} as unknown as CSSForgeConfig;

	const error = thrownError(() => generateCSS(config));

	expect(
		error.message.includes('"gradients.g.primary.settings"') &&
			error.message.includes("reads no settings"),
		`Expected the error to name the variant. Received: ${error.message}`,
	).toBeTruthy();
});
