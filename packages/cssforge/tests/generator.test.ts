import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { build } from "../src/cli.ts";
import { defineConfig, generateStyleDictionaryJSON } from "../src/mod.ts";

test("generateStyleDictionaryJSON - preserves references and resolved values", () => {
	const config = defineConfig({
		colors: {
			palette: {
				value: {
					neutral: {
						value: {
							"0": "#fff",
							"900": "#111",
						},
					},
				},
			},
			theme: {
				light: {
					value: {
						content: {
							value: {
								primary: "var(--text)",
							},
							variables: {
								text: "palette.neutral.900",
							},
						},
					},
				},
			},
		},
		spacing: {
			custom: {
				size: {
					value: {
						2: "8px",
					},
				},
			},
		},
		primitives: {
			button: {
				value: {
					default: {
						value: {
							color: "var(--fg)",
							padding: "var(--pad)",
						},
						variables: {
							fg: "theme.light.content.primary",
							pad: "spacing.custom.size.2",
						},
					},
				},
			},
		},
	});

	const result = JSON.parse(
		generateStyleDictionaryJSON(config, { valueMode: "css-reference" }),
	);

	expect(result.palette.neutral["900"].value).toEqual("var(--palette-neutral-900)");
	expect(result.palette.neutral["900"].type).toEqual("color");
	expect(result.palette.neutral["900"].$tier).toEqual("primitive");
	expect(result.theme.light.content.primary.value).toEqual(
		"var(--theme-light-content-primary)",
	);
	expect(result.theme.light.content.primary.$tier).toEqual("semantic");
	expect(result.theme.light.content.primary.$reference).toEqual("palette.neutral.900");
	expect(result.theme.light.content.primary.$resolvedValue).toEqual(
		"oklch(17.764% 0 none)",
	);
	expect(result.theme.light.content.primary.attributes.cssVariable).toEqual(
		"--theme-light-content-primary",
	);
	expect(result.primitives.button.default.color.attributes.referencePaths).toEqual([
		"theme.light.content.primary",
	]);
	expect(result.primitives.button.default.color.attributes.resolvedValue).toEqual(
		"oklch(17.764% 0 none)",
	);
	expect(result.primitives.button.default.padding.attributes.resolvedValue).toEqual(
		"0.5rem",
	);

	expect(result).toMatchSnapshot();
});

test("generateStyleDictionaryJSON - uses resolved values by default", () => {
	const config = defineConfig({
		spacing: {
			custom: {
				size: {
					value: {
						2: "8px",
					},
				},
			},
		},
	});

	const result = JSON.parse(generateStyleDictionaryJSON(config));

	expect(result.spacing.custom.size["2"].value).toEqual("0.5rem");
	expect(result.spacing.custom.size["2"].attributes.cssVariableReference).toEqual(
		"var(--spacing-size-2)",
	);
});

test("generateStyleDictionaryJSON - resolves hyphenated CSSForge aliases", () => {
	const config = defineConfig({
		colors: {
			palette: {
				value: {
					neutral: {
						900: "#111",
					},
				},
			},
		},
		primitives: {
			button: {
				value: {
					default: {
						value: {
							color: "var( --theme-color )",
						},
						variables: {
							"theme-color": "palette.neutral.900",
						},
					},
				},
			},
		},
	});

	const result = JSON.parse(
		generateStyleDictionaryJSON(config, { valueMode: "resolved" }),
	);

	expect(result.primitives.button.default.color.value).toEqual("oklch(17.764% 0 none)");
	expect(result.primitives.button.default.color.attributes.referencePaths).toEqual([
		"palette.neutral.900",
	]);
});

test("generateStyleDictionaryJSON - preserves cycles and unresolved custom properties", () => {
	const config = defineConfig({
		colors: {
			palette: { value: {} },
			theme: {
				light: {
					value: {
						content: {
							value: {
								first: "var(--second)",
								second: "var(--first)",
								external: "var(--external-property)",
							},
							settings: { variantNameOnly: true },
						},
					},
				},
			},
		},
	});

	const result = JSON.parse(
		generateStyleDictionaryJSON(config, { valueMode: "resolved" }),
	);

	expect(result.theme.light.content.first.value).toEqual("var(--second)");
	expect(result.theme.light.content.second.value).toEqual("var(--first)");
	expect(result.theme.light.content.external.value).toEqual("var(--external-property)");
});

test("generateStyleDictionaryJSON - uses consistent Style Dictionary paths", () => {
	const config = defineConfig({
		typography: {
			fluid: {
				app: {
					value: {
						minWidth: 320,
						minFontSize: 13,
						minTypeScale: 1.12,
						maxWidth: 1440,
						maxFontSize: 14,
						maxTypeScale: 1.12,
						positiveSteps: 0,
						negativeSteps: 0,
					},
					settings: {
						customLabel: { "0": "detail" },
					},
				},
			},
		},
		primitives: {
			textRole: {
				value: {
					detail: {
						value: { fontSize: "var(--size)" },
						variables: { size: "typography_fluid.app@detail" },
					},
				},
			},
		},
	});

	const result = JSON.parse(generateStyleDictionaryJSON(config));

	expect(result["typography-fluid"].app.detail.attributes.sourcePath).toEqual(
		"typography-fluid.app.detail",
	);
	expect(result.primitives["text-role"].detail.fontSize.attributes.sourcePath).toEqual(
		"primitives.text-role.detail.fontSize",
	);
	expect(
		result.primitives["text-role"].detail.fontSize.attributes.referencePaths,
	).toEqual(["typography-fluid.app.detail"]);
	expect(result.primitives["text-role"].detail.fontSize.$reference).toEqual(
		"typography-fluid.app.detail",
	);
});

test("generateStyleDictionaryJSON - anchors tokens for var() usage matching", () => {
	const config = defineConfig({
		colors: {
			theme: {
				light: {
					value: {
						content: {
							value: { primary: "var(--neutral)" },
							variables: { neutral: "palette.neutral.900" },
						},
					},
				},
			},
			palette: {
				value: {
					neutral: { 900: "#111" },
				},
			},
		},
	});

	const result = JSON.parse(generateStyleDictionaryJSON(config));
	const token = result.theme.light.content.primary;

	expect(token.attributes.cssVariable).toEqual("--theme-light-content-primary");
	expect(token.attributes.tailwindVariable).toEqual(token.attributes.cssVariable);
	expect(token.value).toEqual("oklch(17.764% 0 none)");
});

test("generateStyleDictionaryJSON - types tokens by value kind when the module type is coarse", () => {
	const config = defineConfig({
		typography: {
			fluid: {
				app: {
					value: {
						minWidth: 320,
						minFontSize: 13,
						minTypeScale: 1.12,
						maxWidth: 1440,
						maxFontSize: 14,
						maxTypeScale: 1.12,
						positiveSteps: 0,
						negativeSteps: 0,
					},
					settings: { customLabel: { "0": "detail" } },
				},
			},
		},
		colors: {
			palette: { value: { neutral: { 900: "#111" } } },
			theme: {
				light: {
					value: {
						content: {
							value: { primary: "var(--neutral)", muted: "var(--neutral)" },
							variables: { neutral: "palette.neutral.900" },
						},
					},
				},
			},
		},
		spacing: {
			custom: { size: { value: { 4: "1rem" } } },
		},
		primitives: {
			textRole: {
				value: {
					detail: {
						value: {
							fontSize: "var(--size)",
							lineHeight: "1.4",
							"border-radius": "6px",
							"box-shadow": "0 1px 2px rgb(0 0 0 / 20%)",
						},
						variables: { size: "typography_fluid.app@detail" },
					},
				},
			},
		},
	});

	const result = JSON.parse(generateStyleDictionaryJSON(config));

	expect(result.primitives["text-role"].detail.fontSize.type).toEqual("fontSize");
	expect(result.primitives["text-role"].detail.lineHeight.type).toEqual("lineHeight");
	expect(result.primitives["text-role"].detail["border-radius"].type).toEqual(
		"borderRadius",
	);
	expect(result.primitives["text-role"].detail["box-shadow"].type).toEqual("shadow");
	expect(
		result.primitives["text-role"].detail.fontSize.attributes.referencePaths,
	).toEqual(["typography-fluid.app.detail"]);
	expect(result["typography-fluid"].app.detail.type).toEqual("typography");
	expect(result.theme.light.content.primary.type).toEqual("color");
	expect(result.spacing.custom.size["4"].type).toEqual("spacing");
});

test("generateStyleDictionaryJSON - keeps the module type when the value contradicts the name", () => {
	const config = defineConfig({
		colors: {
			palette: { value: { neutral: { 900: "#111" } } },
		},
		primitives: {
			control: {
				value: {
					rounded: {
						value: {
							radius: "var(--tone)",
							"font-family": "var(--tone)",
							opacity: "50%",
							"z-index": "auto",
							gap: "var(--tone)",
							"letter-spacing": "var(--tone)",
						},
						variables: { tone: "palette.neutral.900" },
					},
				},
			},
		},
	});

	const result = JSON.parse(generateStyleDictionaryJSON(config));
	const control = result.primitives.control.rounded;

	// Every leaf name matches a rule, but no value has the expected shape.
	expect(control.radius.value).toEqual("oklch(17.764% 0 none)");
	expect(control.radius.type).toEqual("component");
	expect(control["font-family"].type).toEqual("component");
	expect(control.opacity.type).toEqual("component");
	expect(control["z-index"].type).toEqual("component");
	expect(control.gap.type).toEqual("component");
	expect(control["letter-spacing"].type).toEqual("component");
});

test("generateStyleDictionaryJSON - narrows every value kind the file documents", () => {
	const config = defineConfig({
		primitives: {
			type: {
				value: {
					display: {
						value: {
							"font-family": "Inter, sans-serif",
							"font-weight": "600",
							opacity: "0.64",
							"z-index": "30",
							"letter-spacing": "0.02em",
							"border-radius": "0",
							duration: "150",
							delay: "0",
						},
					},
				},
			},
		},
	});

	const result = JSON.parse(generateStyleDictionaryJSON(config));
	const display = result.primitives.type.display;

	expect(display["font-family"].type).toEqual("fontFamily");
	expect(display["font-weight"].type).toEqual("fontWeight");
	expect(display.opacity.type).toEqual("opacity");
	expect(display["z-index"].type).toEqual("zIndex");
	expect(display["letter-spacing"].type).toEqual("letterSpacing");
	expect(display["border-radius"].type).toEqual("borderRadius");
	expect(display.duration.type).toEqual("number");
	expect(display.delay.type).toEqual("number");
});

test("generateStyleDictionaryJSON - every token carries the fields consumers rely on", () => {
	const config = defineConfig({
		colors: {
			palette: { value: { neutral: { 900: "#111" } } },
			theme: {
				light: {
					value: {
						content: {
							value: { primary: "var(--neutral)" },
							variables: { neutral: "palette.neutral.900" },
						},
					},
				},
			},
		},
		spacing: { custom: { size: { value: { 4: "1rem" } } } },
	});

	const result = JSON.parse(generateStyleDictionaryJSON(config));
	const tokens: Array<[string, Record<string, any>]> = [];
	const collect = (value: Record<string, any>, path: string[] = []) => {
		for (const [key, child] of Object.entries(value)) {
			if (child && typeof child === "object" && "value" in child) {
				tokens.push([[...path, key].join("."), child as Record<string, any>]);
			} else if (child && typeof child === "object") {
				collect(child as Record<string, any>, [...path, key]);
			}
		}
	};
	collect(result);

	expect(tokens.length).toEqual(3);
	for (const [tokenPath, token] of tokens) {
		expect(typeof token.type, `${tokenPath} has a type`).toEqual("string");
		expect(
			token.attributes.tailwindVariable,
			`${tokenPath} anchors its CSS variable`,
		).toEqual(token.attributes.cssVariable);
		if (token.$reference) {
			const referenced = tokens.find(([candidate]) => candidate === token.$reference);
			expect(referenced !== undefined, `${tokenPath} reference resolves`).toEqual(true);
		}
		for (const referencePath of token.attributes.referencePaths ?? []) {
			expect(
				tokens.some(([candidate]) => candidate === referencePath),
				`${tokenPath} reference path ${referencePath} resolves`,
			).toEqual(true);
		}
	}
});

test("generateStyleDictionaryJSON - rejects token paths that collide after normalization", () => {
	const config = defineConfig({
		colors: {
			palette: {
				value: {
					cosmicGold: { 50: "#fff" },
					"cosmic-gold": { 50: "#000" },
				},
			},
		},
	});

	let error: unknown;
	try {
		generateStyleDictionaryJSON(config);
	} catch (caught) {
		error = caught;
	}

	expect(error instanceof Error ? error.message : "").toEqual(
		'Token path collision after normalization: "palette.cosmicGold.50" and "palette.cosmic-gold.50" both become "palette.cosmic-gold.50"',
	);
});

test("generateStyleDictionaryJSON - supports legacy value-wrapper reference paths", () => {
	const config = defineConfig({
		colors: {
			palette: {
				value: {
					cosmicGold: {
						50: "oklch(91.642% 0.15696 98.188)",
						90: "oklch(73.683% 0.13788 73.881)",
					},
					gray: {
						950: "oklch(14.479% 0 0)",
					},
				},
			},
			gradients: {
				value: {
					goldGradient: {
						value: {
							primary: {
								value: "linear-gradient(90deg, var(--1), var(--2))",
								variables: {
									1: "palette.value.cosmicGold.50",
									2: "palette.value.cosmicGold.90",
								},
							},
						},
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
		spacing: {
			custom: {
				size: {
					value: {
						2: "8px",
					},
				},
			},
		},
		typography: {
			weight: {
				lexend: {
					value: {
						regular: "400",
					},
				},
			},
		},
		primitives: {
			button: {
				value: {
					default: {
						value: {
							backgroundImage: "var(--grad)",
							color: "var(--fg)",
							fontWeight: "var(--weight)",
							padding: "var(--size)",
						},
						variables: {
							grad: "gradients.value.goldGradient.primary",
							fg: "theme.value.light.content.primary",
							weight: "typography.weight.lexend.value.regular",
							size: "spacing.custom.size.value.2",
						},
					},
				},
			},
		},
	});

	const result = JSON.parse(generateStyleDictionaryJSON(config));

	expect(result.gradients["gold-gradient"].primary.$reference).toEqual(
		"palette.cosmic-gold.50",
	);
	expect(result.gradients["gold-gradient"].primary.attributes.referencePaths).toEqual([
		"palette.cosmic-gold.50",
		"palette.cosmic-gold.90",
	]);
	expect(result.theme.light.content.primary.$reference).toEqual("palette.gray.950");
	expect(result.primitives.button.default.fontWeight.attributes.resolvedValue).toEqual(
		"400",
	);
	expect(result.primitives.button.default.padding.attributes.resolvedValue).toEqual(
		"0.5rem",
	);
});

test("cli - style-dictionary and all modes write their declared outputs", async () => {
	const tempDir = await mkdtemp(join(tmpdir(), "cssforge-style-dictionary-"));

	try {
		const configPath = join(tempDir, "cssforge.config.ts");
		const styleDictionaryOutput = join(tempDir, "tokens.sd.json");
		const cssOutput = join(tempDir, "output.css");
		const jsonOutput = join(tempDir, "output.json");
		const tsOutput = join(tempDir, "output.ts");
		await writeFile(
			configPath,
			`export default {
				spacing: {
					custom: {
						size: {
							value: {
								2: "8px",
							},
						},
					},
				},
			};`,
			"utf8",
		);

		const cliPath = fileURLToPath(new URL("../src/cli.ts", import.meta.url));
		const result = spawnSync(
			process.execPath,
			[
				cliPath,
				"--config",
				configPath,
				"--mode",
				"style-dictionary",
				"--style-dictionary",
				styleDictionaryOutput,
				"--css",
				cssOutput,
				"--json",
				jsonOutput,
				"--ts",
				tsOutput,
			],
			{ cwd: tempDir, encoding: "utf8" },
		);

		const output = JSON.parse(await readFile(styleDictionaryOutput, "utf8"));

		expect(result.status).toEqual(0);
		expect(result.stderr).toEqual("");
		expect(result.stdout.includes("Generated Style Dictionary JSON written")).toEqual(
			true,
		);
		expect(output.spacing.custom.size["2"].value).toEqual("0.5rem");
		expect(existsSync(cssOutput)).toEqual(false);
		expect(existsSync(jsonOutput)).toEqual(false);
		expect(existsSync(tsOutput)).toEqual(false);

		const allResult = spawnSync(
			process.execPath,
			[
				cliPath,
				"--config",
				configPath,
				"--mode",
				"all",
				"--style-dictionary",
				styleDictionaryOutput,
				"--css",
				cssOutput,
				"--json",
				jsonOutput,
				"--ts",
				tsOutput,
			],
			{ cwd: tempDir, encoding: "utf8" },
		);
		const legacyJson = JSON.parse(await readFile(jsonOutput, "utf8"));

		expect(allResult.status).toEqual(0);
		expect(allResult.stderr).toEqual("");
		expect(existsSync(cssOutput)).toEqual(true);
		expect(existsSync(jsonOutput)).toEqual(true);
		expect(existsSync(tsOutput)).toEqual(true);
		expect(existsSync(styleDictionaryOutput)).toEqual(true);
		expect(Object.keys(legacyJson.spacing.custom.size["2"]).sort()).toEqual([
			"key",
			"value",
			"variable",
		]);
	} finally {
		await rm(tempDir, { recursive: true, force: true });
	}
});

test("cli - style-dictionary mode can emit CSS variables for usage matching", async () => {
	const tempDir = await mkdtemp(
		join(tmpdir(), "cssforge-style-dictionary-css-reference-"),
	);

	try {
		const configPath = join(tempDir, "cssforge.config.ts");
		const styleDictionaryOutput = join(tempDir, "tokens.sd.json");
		await writeFile(
			configPath,
			`export default {
				spacing: {
					custom: { size: { value: { 2: "8px" } } },
				},
			};`,
			"utf8",
		);

		const cliPath = fileURLToPath(new URL("../src/cli.ts", import.meta.url));
		const result = spawnSync(
			process.execPath,
			[
				cliPath,
				"--config",
				configPath,
				"--mode",
				"style-dictionary",
				"--style-dictionary",
				styleDictionaryOutput,
				"--style-dictionary-value-mode",
				"css-reference",
			],
			{ cwd: tempDir, encoding: "utf8" },
		);

		const output = JSON.parse(await readFile(styleDictionaryOutput, "utf8"));

		expect(result.status).toEqual(0);
		expect(result.stderr).toEqual("");
		expect(output.spacing.custom.size["2"].value).toEqual("var(--spacing-size-2)");
	} finally {
		await rm(tempDir, { recursive: true, force: true });
	}
});

test("build - legacy output modes do not require a Style Dictionary path", async () => {
	const tempDir = await mkdtemp(join(tmpdir(), "cssforge-legacy-build-"));

	try {
		const configPath = join(tempDir, "cssforge.config.ts");
		const cssOutput = join(tempDir, "output.css");
		await writeFile(
			configPath,
			`export default {
				spacing: {
					custom: { size: { value: { 2: "8px" } } },
				},
			};`,
			"utf8",
		);

		const result = await build({
			config: configPath,
			mode: "css",
			cssOutput,
			jsonOutput: join(tempDir, "output.json"),
			tsOutput: join(tempDir, "output.ts"),
		});

		expect(result.success).toEqual(true);
		expect(existsSync(cssOutput)).toEqual(true);
	} finally {
		await rm(tempDir, { recursive: true, force: true });
	}
});
