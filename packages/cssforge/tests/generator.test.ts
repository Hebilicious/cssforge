import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import cliCommand, { build } from "../src/cli.ts";
import { defineConfig } from "../src/config.ts";
import { generateStyleDictionaryJSON } from "../src/generator.ts";
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

Deno.test("cli - exposes documented style-dictionary flag", () => {
	assertEquals("style-dictionary" in (cliCommand.args ?? {}), true);
	assertEquals("styleDictionary" in (cliCommand.args ?? {}), false);
});

Deno.test("build - writes Style Dictionary output", async () => {
	const tempDir = await mkdtemp(join(tmpdir(), "cssforge-style-dictionary-"));

	try {
		const configPath = join(tempDir, "cssforge.config.ts");
		const styleDictionaryOutput = join(tempDir, "tokens.sd.json");
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

		const result = await build({
			config: configPath,
			mode: "style-dictionary",
			cssOutput: join(tempDir, "output.css"),
			jsonOutput: join(tempDir, "output.json"),
			tsOutput: join(tempDir, "output.ts"),
			styleDictionaryOutput,
		});

		const output = JSON.parse(await readFile(styleDictionaryOutput, "utf8"));

		assertEquals(result.success, true);
		assertEquals(output.spacing.custom.size["2"].value, "var(--spacing-size-2)");
	} finally {
		await rm(tempDir, { recursive: true, force: true });
	}
});
