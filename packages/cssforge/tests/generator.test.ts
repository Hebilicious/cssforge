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

	const result = JSON.parse(generateStyleDictionaryJSON(config));

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

Deno.test("generateStyleDictionaryJSON - can use resolved values as token values", () => {
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

	const result = JSON.parse(
		generateStyleDictionaryJSON(config, { valueMode: "resolved" }),
	);

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
							color: "var(--theme-color)",
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

	assertEquals(
		result.primitives.button.default.color.value,
		"oklch(17.764% 0 0)",
	);
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
	assertEquals(
		result.theme.light.content.external.value,
		"var(--external-property)",
	);
});

Deno.test("generateStyleDictionaryJSON - uses emitted paths for fluid source metadata", () => {
	const config = defineConfig({
		spacing: {
			fluid: {
				base: {
					value: {
						minSize: 4,
						maxSize: 24,
						minWidth: 320,
						maxWidth: 1280,
						negativeSteps: [0],
						positiveSteps: [1],
					},
				},
			},
		},
		primitives: {
			card: {
				value: {
					default: {
						value: { gap: "var(--space)" },
						variables: { space: "spacing_fluid.base@s" },
					},
				},
			},
		},
	});

	const result = JSON.parse(generateStyleDictionaryJSON(config));

	assertEquals(
		result.spacing_fluid.base.s.attributes.sourcePath,
		"spacing_fluid.base.s",
	);
	assertEquals(result.primitives.card.default.gap.attributes.referencePaths, [
		"spacing_fluid.base.s",
	]);
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

	assertEquals(result.gradients.goldGradient.primary.$reference, "palette.cosmicGold.50");
	assertEquals(result.gradients.goldGradient.primary.attributes.referencePaths, [
		"palette.cosmicGold.50",
		"palette.cosmicGold.90",
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

Deno.test("cli - style-dictionary mode writes only the requested token file", async () => {
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
		assertEquals(
			result.stdout.includes("Generated Style Dictionary JSON written"),
			true,
		);
		assertEquals(output.spacing.custom.size["2"].value, "var(--spacing-size-2)");
		assertEquals(existsSync(cssOutput), false);
		assertEquals(existsSync(jsonOutput), false);
		assertEquals(existsSync(tsOutput), false);
	} finally {
		await rm(tempDir, { recursive: true, force: true });
	}
});

Deno.test("cli - style-dictionary mode can emit resolved consumer values", async () => {
	const tempDir = await mkdtemp(join(tmpdir(), "cssforge-style-dictionary-resolved-"));

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
				"resolved",
			],
			{ cwd: tempDir, encoding: "utf8" },
		);

		const output = JSON.parse(await readFile(styleDictionaryOutput, "utf8"));

		assertEquals(result.status, 0);
		assertEquals(result.stderr, "");
		assertEquals(output.spacing.custom.size["2"].value, "0.5rem");
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
