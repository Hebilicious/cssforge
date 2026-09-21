import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "../src/cli.ts";
import { defineConfig, generateStyleDictionaryJSON } from "../src/mod.ts";
import { assertEquals, assertSnapshot, Deno } from "./vitest-compat.ts";

Deno.test("generateStyleDictionaryJSON - preserves references and resolved values", async (t) => {
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

	assertEquals(result.palette.neutral["900"].value, "var(--palette-neutral-900)");
	assertEquals(result.palette.neutral["900"].type, "color");
	assertEquals(result.palette.neutral["900"].$tier, "primitive");
	assertEquals(
		result.theme.light.content.primary.value,
		"var(--theme-light-content-primary)",
	);
	assertEquals(result.theme.light.content.primary.$tier, "semantic");
	assertEquals(result.theme.light.content.primary.$reference, "palette.neutral.900");
	assertEquals(result.theme.light.content.primary.$resolvedValue, "oklch(17.764% 0 0)");
	assertEquals(
		result.theme.light.content.primary.attributes.cssVariable,
		"--theme-light-content-primary",
	);
	assertEquals(result.primitives.button.default.color.attributes.referencePaths, [
		"theme.light.content.primary",
	]);
	assertEquals(
		result.primitives.button.default.color.attributes.resolvedValue,
		"oklch(17.764% 0 0)",
	);
	assertEquals(
		result.primitives.button.default.padding.attributes.resolvedValue,
		"0.5rem",
	);

	await assertSnapshot(t, result);
});

Deno.test("generateStyleDictionaryJSON - uses resolved values by default", () => {
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

	assertEquals(result.spacing.custom.size["2"].value, "0.5rem");
	assertEquals(
		result.spacing.custom.size["2"].attributes.cssVariableReference,
		"var(--spacing-size-2)",
	);
});

Deno.test("generateStyleDictionaryJSON - resolves hyphenated CSSForge aliases", () => {
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

	assertEquals(result.primitives.button.default.color.value, "oklch(17.764% 0 0)");
	assertEquals(result.primitives.button.default.color.attributes.referencePaths, [
		"palette.neutral.900",
	]);
});

Deno.test("generateStyleDictionaryJSON - preserves cycles and unresolved custom properties", () => {
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

	assertEquals(result.theme.light.content.first.value, "var(--second)");
	assertEquals(result.theme.light.content.second.value, "var(--first)");
	assertEquals(result.theme.light.content.external.value, "var(--external-property)");
});

Deno.test("generateStyleDictionaryJSON - uses consistent Style Dictionary paths", () => {
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

	assertEquals(
		result["typography-fluid"].app.detail.attributes.sourcePath,
		"typography-fluid.app.detail",
	);
	assertEquals(
		result.primitives["text-role"].detail.fontSize.attributes.sourcePath,
		"primitives.text-role.detail.fontSize",
	);
	assertEquals(result.primitives["text-role"].detail.fontSize.attributes.referencePaths, [
		"typography-fluid.app.detail",
	]);
	assertEquals(
		result.primitives["text-role"].detail.fontSize.$reference,
		"typography-fluid.app.detail",
	);
});

Deno.test("generateStyleDictionaryJSON - anchors tokens for var() usage matching", () => {
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

	assertEquals(token.attributes.cssVariable, "--theme-light-content-primary");
	assertEquals(token.attributes.tailwindVariable, token.attributes.cssVariable);
	assertEquals(token.value, "oklch(17.764% 0 0)");
});

Deno.test("generateStyleDictionaryJSON - types tokens by value kind when the module type is coarse", () => {
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

	assertEquals(result.primitives["text-role"].detail.fontSize.type, "fontSize");
	assertEquals(result.primitives["text-role"].detail.lineHeight.type, "lineHeight");
	assertEquals(
		result.primitives["text-role"].detail["border-radius"].type,
		"borderRadius",
	);
	assertEquals(result.primitives["text-role"].detail["box-shadow"].type, "shadow");
	assertEquals(result.primitives["text-role"].detail.fontSize.attributes.referencePaths, [
		"typography-fluid.app.detail",
	]);
	assertEquals(result["typography-fluid"].app.detail.type, "typography");
	assertEquals(result.theme.light.content.primary.type, "color");
	assertEquals(result.spacing.custom.size["4"].type, "spacing");
});

Deno.test("generateStyleDictionaryJSON - keeps the module type when the value contradicts the name", () => {
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
	assertEquals(control.radius.value, "oklch(17.764% 0 0)");
	assertEquals(control.radius.type, "component");
	assertEquals(control["font-family"].type, "component");
	assertEquals(control.opacity.type, "component");
	assertEquals(control["z-index"].type, "component");
	assertEquals(control.gap.type, "component");
	assertEquals(control["letter-spacing"].type, "component");
});

Deno.test("generateStyleDictionaryJSON - narrows every value kind the file documents", () => {
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

	assertEquals(display["font-family"].type, "fontFamily");
	assertEquals(display["font-weight"].type, "fontWeight");
	assertEquals(display.opacity.type, "opacity");
	assertEquals(display["z-index"].type, "zIndex");
	assertEquals(display["letter-spacing"].type, "letterSpacing");
	assertEquals(display["border-radius"].type, "borderRadius");
	assertEquals(display.duration.type, "number");
	assertEquals(display.delay.type, "number");
});

Deno.test("generateStyleDictionaryJSON - every token carries the fields consumers rely on", () => {
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

	assertEquals(tokens.length, 3);
	for (const [tokenPath, token] of tokens) {
		assertEquals(typeof token.type, "string", `${tokenPath} has a type`);
		assertEquals(
			token.attributes.tailwindVariable,
			token.attributes.cssVariable,
			`${tokenPath} anchors its CSS variable`,
		);
		if (token.$reference) {
			const referenced = tokens.find(([candidate]) => candidate === token.$reference);
			assertEquals(referenced !== undefined, true, `${tokenPath} reference resolves`);
		}
		for (const referencePath of token.attributes.referencePaths ?? []) {
			assertEquals(
				tokens.some(([candidate]) => candidate === referencePath),
				true,
				`${tokenPath} reference path ${referencePath} resolves`,
			);
		}
	}
});

Deno.test("generateStyleDictionaryJSON - rejects token paths that collide after normalization", () => {
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

	assertEquals(
		error instanceof Error ? error.message : "",
		'Token path collision after normalization: "palette.cosmicGold.50" and "palette.cosmic-gold.50" both become "palette.cosmic-gold.50"',
	);
});

Deno.test("generateStyleDictionaryJSON - supports legacy value-wrapper reference paths", () => {
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

	assertEquals(
		result.gradients["gold-gradient"].primary.$reference,
		"palette.cosmic-gold.50",
	);
	assertEquals(result.gradients["gold-gradient"].primary.attributes.referencePaths, [
		"palette.cosmic-gold.50",
		"palette.cosmic-gold.90",
	]);
	assertEquals(result.theme.light.content.primary.$reference, "palette.gray.950");
	assertEquals(
		result.primitives.button.default.fontWeight.attributes.resolvedValue,
		"400",
	);
	assertEquals(
		result.primitives.button.default.padding.attributes.resolvedValue,
		"0.5rem",
	);
});

Deno.test("cli - style-dictionary and all modes write their declared outputs", async () => {
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

		assertEquals(result.status, 0);
		assertEquals(result.stderr, "");
		assertEquals(result.stdout.includes("Generated Style Dictionary JSON written"), true);
		assertEquals(output.spacing.custom.size["2"].value, "0.5rem");
		assertEquals(existsSync(cssOutput), false);
		assertEquals(existsSync(jsonOutput), false);
		assertEquals(existsSync(tsOutput), false);

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

		assertEquals(allResult.status, 0);
		assertEquals(allResult.stderr, "");
		assertEquals(existsSync(cssOutput), true);
		assertEquals(existsSync(jsonOutput), true);
		assertEquals(existsSync(tsOutput), true);
		assertEquals(existsSync(styleDictionaryOutput), true);
		assertEquals(Object.keys(legacyJson.spacing.custom.size["2"]).sort(), [
			"key",
			"value",
			"variable",
		]);
	} finally {
		await rm(tempDir, { recursive: true, force: true });
	}
});

Deno.test("cli - style-dictionary mode can emit CSS variables for usage matching", async () => {
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

		assertEquals(result.status, 0);
		assertEquals(result.stderr, "");
		assertEquals(output.spacing.custom.size["2"].value, "var(--spacing-size-2)");
	} finally {
		await rm(tempDir, { recursive: true, force: true });
	}
});

Deno.test("build - legacy output modes do not require a Style Dictionary path", async () => {
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

		assertEquals(result.success, true);
		assertEquals(existsSync(cssOutput), true);
	} finally {
		await rm(tempDir, { recursive: true, force: true });
	}
});
