import { expect, test } from "vitest";
import { defineConfig, processColors } from "../src/mod.ts";
import { combine, getLines } from "./helpers.ts";

test("processColors - converts hex to oklch", () => {
	const config = defineConfig({
		colors: {
			palette: {
				value: {
					coral: {
						value: {
							100: { hex: "#FF7F50" },
							200: { hex: "#FF6347" },
						},
					},
				},
			},
		},
	});

	const { css, resolveMap } = processColors(config.colors);
	const combined = combine(css);
	const lines = getLines(combined);
	expect(lines[2].trim()).toEqual(
		"--palette-coral-100: oklch(73.511% 0.16799 40.24666);",
	);
	expect(lines[3].trim()).toEqual(
		"--palette-coral-200: oklch(69.622% 0.19552 32.32143);",
	);
	expect(Array.from(resolveMap.keys())).toEqual([
		"palette.coral.100",
		"palette.coral.200",
	]);
	expect(combined).toMatchSnapshot();
	expect(Array.from(resolveMap.entries())).toMatchSnapshot();
});

test("processColors - handles different color formats", () => {
	const config = defineConfig({
		colors: {
			palette: {
				value: {
					brand: {
						value: {
							default: { hex: "#FF0000" },
							200: { rgb: [0, 255, 0] },
							300: { hsl: [240, 100, 50] },
							400: { oklch: "oklch(0.7 0.2 270)" },
						},
					},
				},
			},
		},
	} as const);
	const { css, resolveMap } = processColors(config.colors);
	const combined = combine(css);
	const lines = getLines(combined);

	expect(lines[2].trim()).toEqual(
		"--palette-brand-200: oklch(86.644% 0.29483 142.49535);",
	);
	expect(lines[3].trim()).toEqual(
		"--palette-brand-300: oklch(45.201% 0.31321 264.05202);",
	);
	expect(lines[4].trim()).toEqual("--palette-brand-400: oklch(70% 0.2 270);");
	expect(lines[5].trim()).toEqual(
		"--palette-brand-default: oklch(62.796% 0.25768 29.23388);",
	);

	expect(Array.from(resolveMap.keys())).toEqual([
		"palette.brand.200",
		"palette.brand.300",
		"palette.brand.400",
		"palette.brand.default",
	]);
	expect(combined).toMatchSnapshot();
	expect(Array.from(resolveMap.entries())).toMatchSnapshot();
});

test("processColors - handles string values", () => {
	const config = defineConfig({
		colors: {
			palette: {
				value: {
					simple: {
						value: {
							white: "oklch(100% 0 0)",
							black: "#000",
						},
					},
				},
			},
		},
	});
	const { css, resolveMap } = processColors(config.colors);
	const combined = combine(css);
	const lines = getLines(combined);
	expect(lines[2].trim()).toEqual("--palette-simple-white: oklch(100% 0 none);");
	expect(lines[3].trim()).toEqual("--palette-simple-black: oklch(0% 0 none);");
	expect(Array.from(resolveMap.keys())).toEqual([
		"palette.simple.white",
		"palette.simple.black",
	]);
	expect(combined).toMatchSnapshot();
	expect(Array.from(resolveMap.entries())).toMatchSnapshot();
});

test("processColors - handles direct palette groups", () => {
	const config = defineConfig({
		colors: {
			palette: {
				value: {
					basic: {
						white: { oklch: "oklch(100% 0 0)" },
						black: { oklch: "oklch(0% 0 0)" },
					},
					gray: {
						950: "oklch(14.479% 0 0)",
					},
				},
			},
			theme: {
				value: {
					light: {
						content: {
							value: {
								primary: "var(--1)",
							},
							variables: {
								1: "palette.value.gray.950",
							},
						},
					},
				},
			},
		},
	});

	const { css, resolveMap } = processColors(config.colors);
	const combined = combine(css);

	expect(combined.includes("--palette-basic-white: oklch(100% 0 none);")).toEqual(true);
	expect(combined.includes("--palette-gray-950: oklch(14.479% 0 none);")).toEqual(true);
	expect(
		combined.includes("--theme-light-content-primary: var(--palette-gray-950);"),
	).toEqual(true);
	expect(Array.from(resolveMap.keys())).toEqual([
		"palette.basic.white",
		"palette.basic.black",
		"palette.gray.950",
		"theme.light.content.primary",
	]);
	expect(combined).toMatchSnapshot();
	expect(Array.from(resolveMap.entries())).toMatchSnapshot();
});

test("processColors - handles themes", () => {
	const config = defineConfig({
		colors: {
			palette: {
				value: {
					simple: {
						value: {
							white: "oklch(100% 0 0)",
							black: { hex: "#000" },
						},
					},
				},
			},
			theme: {
				light: {
					value: {
						background: {
							value: {
								primary: "var(--1)",
								secondary: "var(--2)",
							},
							variables: {
								1: "palette.simple.white",
								2: "palette.simple.black",
							},
						},
					},
				},
			},
		},
	});
	const { css, resolveMap } = processColors(config.colors);
	const combined = combine(css);
	const lines = getLines(combined);
	expect(lines[7].trim()).toEqual(
		"--theme-light-background-primary: var(--palette-simple-white);",
	);
	expect(lines[8].trim()).toEqual(
		"--theme-light-background-secondary: var(--palette-simple-black);",
	);
	expect(Array.from(resolveMap.keys())).toEqual([
		"palette.simple.white",
		"palette.simple.black",
		"theme.light.background.primary",
		"theme.light.background.secondary",
	]);
	expect(combined).toMatchSnapshot();
	expect(Array.from(resolveMap.entries())).toMatchSnapshot();
});

test("processColors - handles transparency", () => {
	const config = defineConfig({
		colors: {
			palette: {
				value: {
					alpha: {
						value: {
							softGray1: "oklch(14.48% 0 0 / 12%)",
							softGray2: "oklch(14.48% 0 0 / 24%)",
						},
					},
				},
			},
		},
	});
	const { css, resolveMap } = processColors(config.colors);
	const combined = combine(css);
	const lines = getLines(combined);
	expect(lines[2].trim()).toEqual(
		"--palette-alpha-softGray1: oklch(14.48% 0 none / 12%);",
	);
	expect(lines[3].trim()).toEqual(
		"--palette-alpha-softGray2: oklch(14.48% 0 none / 24%);",
	);
	expect(Array.from(resolveMap.keys())).toEqual([
		"palette.alpha.softGray1",
		"palette.alpha.softGray2",
	]);
	expect(combined).toMatchSnapshot();
	expect(Array.from(resolveMap.entries())).toMatchSnapshot();
});

test("processColors - generates gradient with color variables", () => {
	const config = defineConfig({
		colors: {
			palette: {
				value: {
					coral: {
						value: {
							"50": { hex: "#FF7E60" },
							"90": { hex: "#FF7F40" },
							"100": { hex: "#FF6347" },
						},
					},
					indigo: {
						value: {
							"100": { hex: "#4F46E5" },
						},
					},
				},
			},
			gradients: {
				value: {
					orangeGradient: {
						value: {
							primary: {
								value:
									"linear-gradient(261.78deg, var(--1) 33.1%, var(--2) 56.3%, var(--3) 65.78%, var(--4) 84.23%)",
								variables: {
									"1": "palette.coral.50",
									"2": "palette.coral.90",
									"3": "palette.coral.100",
									"4": "palette.indigo.100",
								},
							},
						},
					},
				},
			},
		},
	});

	const result = processColors(config.colors);
	const combined = [result.css.root, result.css.outside].filter(Boolean).join("\n");
	const lines = getLines(combined);
	const expected = [
		"--gradients-orangeGradient-primary: linear-gradient(261.78deg, var(--palette-coral-50) 33.1%, var(--palette-coral-90) 56.3%, var(--palette-coral-100) 65.78%, var(--palette-indigo-100) 84.23%);",
	].join("\n");

	expect(lines.at(-1)).toEqual(expected);
	expect(Array.from(result.resolveMap.keys())).toEqual([
		"palette.coral.50",
		"palette.coral.90",
		"palette.coral.100",
		"palette.indigo.100",
		"gradients.orangeGradient.primary",
	]);
	expect(combined).toMatchSnapshot();
	expect(Array.from(result.resolveMap.entries())).toMatchSnapshot();
});

test("processColors - handles themes referencing gradients", () => {
	const config = defineConfig({
		colors: {
			palette: {
				value: {
					coral: {
						value: {
							"50": { hex: "#FF7E60" },
						},
					},
				},
			},
			gradients: {
				value: {
					orangeGradient: {
						value: {
							primary: {
								value: "linear-gradient(to right, var(--c1), var(--c2))",
								variables: {
									c1: "palette.coral.50",
									c2: "palette.coral.50",
								},
							},
						},
					},
				},
			},
			theme: {
				light: {
					value: {
						background: {
							value: {
								primary: "var(--grad)",
							},
							variables: {
								grad: "gradients.orangeGradient.primary",
							},
						},
					},
				},
			},
		},
	});

	const { css, resolveMap } = processColors(config.colors);
	const combined = combine(css);
	const lines = getLines(combined);
	const lastLine = lines.pop();
	expect(lastLine).toEqual(
		"--theme-light-background-primary: var(--gradients-orangeGradient-primary);",
	);
	expect(Array.from(resolveMap.keys())).toEqual([
		"palette.coral.50",
		"gradients.orangeGradient.primary",
		"theme.light.background.primary",
	]);
	expect(combined).toMatchSnapshot();
	expect(Array.from(resolveMap.entries())).toMatchSnapshot();
});

test("processColors - handles gradients with atRule", () => {
	const config = defineConfig({
		colors: {
			palette: {
				value: {
					coral: {
						value: {
							"50": { hex: "#FF7E60" },
						},
					},
				},
			},
			gradients: {
				value: {
					orangeGradient: {
						value: {
							primary: {
								value: "linear-gradient(to right, var(--c1), var(--c2))",
								variables: {
									c1: "palette.coral.50",
									c2: "palette.coral.50",
								},
							},
						},
						settings: {
							atRule: "@media (prefers-color-scheme: dark)",
						},
					},
				},
			},
		},
	});

	const { css, resolveMap } = processColors(config.colors);
	const combined = combine(css);
	const lines = getLines(combined);

	const mediaQueryIndex = lines.findIndex((line) =>
		line.includes("@media (prefers-color-scheme: dark)"),
	);

	expect(lines[mediaQueryIndex]).toEqual("@media (prefers-color-scheme: dark) {");

	const varIndex = lines.findIndex(
		(line, idx) =>
			idx > mediaQueryIndex && line.includes("--gradients-orangeGradient-primary:"),
	);

	expect(
		varIndex > mediaQueryIndex,
		"Gradient variable should be inside the media query block",
	).toBeTruthy();

	expect(lines[varIndex].trim()).toEqual(
		"--gradients-orangeGradient-primary: linear-gradient(to right, var(--palette-coral-50), var(--palette-coral-50));",
	);

	expect(Array.from(resolveMap.keys())).toEqual([
		"palette.coral.50",
		"gradients.orangeGradient.primary",
	]);
	expect(combined).toMatchSnapshot();
	expect(Array.from(resolveMap.entries())).toMatchSnapshot();
});

test("processColors - handles palette colors with atRule", () => {
	const config = defineConfig({
		colors: {
			palette: {
				value: {
					background: {
						value: {
							light: "oklch(100% 0 0)",
						},
					},
					backgroundDark: {
						value: {
							dark: { hex: "#000" },
						},
						settings: {
							atRule: "@media (prefers-color-scheme: dark)",
						},
					},
				},
			},
		},
	});
	const { css, resolveMap } = processColors(config.colors);
	const combined = combine(css);
	const lines = getLines(combined);

	expect(lines[2].trim()).toEqual("--palette-background-light: oklch(100% 0 none);");

	const mediaQueryIndex = lines.findIndex((line) =>
		line.includes("@media (prefers-color-scheme: dark)"),
	);

	expect(lines[mediaQueryIndex]).toEqual("@media (prefers-color-scheme: dark) {");

	const darkVarIndex = lines.findIndex((line) =>
		line.includes("--palette-backgroundDark-dark:"),
	);

	expect(lines[darkVarIndex].trim()).toEqual(
		"--palette-backgroundDark-dark: oklch(0% 0 none);",
	);

	const closingBraceIndex = lines.findIndex(
		(line, idx) => idx > mediaQueryIndex && line === "}",
	);
	expect(
		closingBraceIndex > darkVarIndex,
		"Closing brace should exist after variables",
	).toBeTruthy();

	expect(Array.from(resolveMap.keys())).toEqual([
		"palette.background.light",
		"palette.backgroundDark.dark",
	]);
	expect(combined).toMatchSnapshot();
	expect(Array.from(resolveMap.entries())).toMatchSnapshot();
});

test("processColors - handles themes with selector", () => {
	const config = defineConfig({
		colors: {
			palette: {
				value: {
					base: {
						value: {
							primary: { hex: "#FF7F50" },
						},
					},
				},
			},
			theme: {
				dark: {
					value: {
						background: {
							value: {
								primary: "var(--1)",
							},
							variables: {
								"1": "palette.base.primary",
							},
						},
					},
					settings: {
						selector: ".dark-theme",
					},
				},
			},
		},
	});

	const { css, resolveMap } = processColors(config.colors);
	const combined = combine(css);
	const lines = getLines(combined);

	const classIndex = lines.findIndex((l) => l.includes(".dark-theme"));
	expect(lines[classIndex]).toEqual(".dark-theme {");

	const varIndex = lines.findIndex((l) => l.includes("--theme-dark-background-primary:"));
	expect(
		varIndex > classIndex,
		"theme variable should be inside the class block",
	).toBeTruthy();

	expect(Array.from(resolveMap.keys())).toEqual([
		"palette.base.primary",
		"theme.dark.background.primary",
	]);
	expect(combined).toMatchSnapshot();
	expect(Array.from(resolveMap.entries())).toMatchSnapshot();
});

test("processColors - handles selector + atRule", () => {
	const config = defineConfig({
		colors: {
			palette: {
				value: {
					base: {
						value: {
							primary: { hex: "#FF7F50" },
						},
					},
				},
			},
			theme: {
				dark: {
					value: {
						background: {
							value: {
								primary: "var(--1)",
							},
							variables: {
								"1": "palette.base.primary",
							},
						},
					},
					settings: {
						selector: ".dark-theme",
						atRule: "@media (prefers-color-scheme: dark)",
					},
				},
			},
		},
	});

	const { css, resolveMap } = processColors(config.colors);
	const combined = combine(css);
	const lines = getLines(combined);

	const mediaIndex = lines.findIndex((l) =>
		l.includes("@media (prefers-color-scheme: dark)"),
	);
	expect(lines[mediaIndex]).toEqual("@media (prefers-color-scheme: dark) {");

	const classIndex = lines.findIndex(
		(l, idx) => idx > mediaIndex && l.includes(".dark-theme"),
	);
	expect(
		classIndex > mediaIndex,
		"selector should be inside the media query block",
	).toBeTruthy();
	expect(lines[classIndex].trim()).toEqual(".dark-theme {");

	const varIndex = lines.findIndex(
		(l, idx) => idx > classIndex && l.includes("--theme-dark-background-primary:"),
	);
	expect(
		varIndex > classIndex,
		"theme variable should be inside the selector block within the media query",
	).toBeTruthy();

	expect(Array.from(resolveMap.keys())).toEqual([
		"palette.base.primary",
		"theme.dark.background.primary",
	]);

	expect(combined).toMatchSnapshot();
	expect(Array.from(resolveMap.entries())).toMatchSnapshot();
});

test("processColors - handles theme variantNameOnly", () => {
	const config = defineConfig({
		colors: {
			palette: {
				value: {
					simple: {
						value: {
							white: "oklch(100% 0 0)",
							black: { hex: "#000" },
						},
					},
				},
			},
			theme: {
				light: {
					value: {
						background: {
							value: {
								primary: "var(--1)",
								secondary: "var(--2)",
							},
							variables: {
								1: "palette.simple.white",
								2: "palette.simple.black",
							},
							settings: {
								variantNameOnly: true,
							},
						},
					},
				},
			},
		},
	});

	const { css, resolveMap } = processColors(config.colors);
	const combined = combine(css);
	const lines = getLines(combined);

	const primaryLine = lines.find((l) => l.includes("--primary:"));
	const secondaryLine = lines.find((l) => l.includes("--secondary:"));

	expect(primaryLine?.trim()).toEqual("--primary: var(--palette-simple-white);");
	expect(secondaryLine?.trim()).toEqual("--secondary: var(--palette-simple-black);");

	expect(Array.from(resolveMap.keys())).toEqual([
		"palette.simple.white",
		"palette.simple.black",
		"theme.light.background.primary",
		"theme.light.background.secondary",
	]);

	expect(combined).toMatchSnapshot();
	expect(Array.from(resolveMap.entries())).toMatchSnapshot();
});

test("processColors - achromatic colors emit hue as none", () => {
	const config = defineConfig({
		colors: {
			palette: {
				value: {
					achromatic: {
						value: {
							white: { hex: "#FFFFFF" },
							black: { hex: "#000000" },
							gray: { hex: "#808080" },
							oklchZeroChroma: { oklch: "oklch(50% 0 180)" },
							oklchRedHue: { oklch: "oklch(50% 0 0)" },
							oklchTuple: { oklch: [0.5, 0, 0] },
						},
					},
					chromatic: {
						value: {
							red: { hex: "#FF0000" },
						},
					},
				},
			},
		},
	});

	const { css, resolveMap } = processColors(config.colors);
	const combined = combine(css);
	const lines = getLines(combined);

	expect(lines.find((l) => l.includes("--palette-achromatic-white:"))?.trim()).toEqual(
		"--palette-achromatic-white: oklch(100% 0 none);",
	);
	expect(lines.find((l) => l.includes("--palette-achromatic-black:"))?.trim()).toEqual(
		"--palette-achromatic-black: oklch(0% 0 none);",
	);
	expect(lines.find((l) => l.includes("--palette-achromatic-gray:"))?.trim()).toEqual(
		"--palette-achromatic-gray: oklch(59.987% 0 none);",
	);
	expect(
		lines.find((l) => l.includes("--palette-achromatic-oklchZeroChroma:"))?.trim(),
	).toEqual("--palette-achromatic-oklchZeroChroma: oklch(50% 0 none);");
	expect(
		lines.find((l) => l.includes("--palette-achromatic-oklchRedHue:"))?.trim(),
	).toEqual("--palette-achromatic-oklchRedHue: oklch(50% 0 none);");
	expect(
		lines.find((l) => l.includes("--palette-achromatic-oklchTuple:"))?.trim(),
	).toEqual("--palette-achromatic-oklchTuple: oklch(50% 0 none);");

	const redLine = lines.find((l) => l.includes("--palette-chromatic-red:"))?.trim();
	expect(redLine?.includes("oklch(")).toBeTruthy();
	expect(
		!redLine?.includes("none"),
		"chromatic colors should have a numeric hue",
	).toBeTruthy();

	expect(combined).toMatchSnapshot();
});
