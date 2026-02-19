import { Deno, assertEquals, assertSnapshot } from "./vitest-compat.ts";
import { processSpacing } from "../src/modules/spacing.ts";
import { defineConfig } from "../src/config.ts";

Deno.test("processSpacing - generates correct spacing scale", async (t) => {
	const config = defineConfig({
		spacing: {
			custom: {
				size: {
					value: { 1: "0.25rem", 2: "0.5rem", 3: "0.75rem", s: "16px" },
				},
			},
		},
	});

	const result = processSpacing(config.spacing);
	const expected = [
		"--spacing-size-1: 0.25rem;",
		"--spacing-size-2: 0.5rem;",
		"--spacing-size-3: 0.75rem;",
		"--spacing-size-s: 1rem;",
	].join("\n");
	assertEquals(result.css.root, expected);

	assertEquals(Array.from(result.resolveMap.keys()), [
		"spacing.custom.size.1",
		"spacing.custom.size.2",
		"spacing.custom.size.3",
		"spacing.custom.size.s",
	]);
	await assertSnapshot(t, result.css.root);
	await assertSnapshot(t, Array.from(result.resolveMap.entries()));
});

// Test with string keys
Deno.test("processSpacing - handles settings", async (t) => {
	const config = defineConfig({
		spacing: {
			custom: {
				size: {
					value: { 1: "16px", 2: "0.5rem" },
					settings: { pxToRem: true },
				},
				scale: {
					value: { md: "8px", lg: "0.75rem" },
					settings: { pxToRem: false },
				},
			},
		},
	});

	const result = processSpacing(config.spacing);
	const expected = [
		"--spacing-size-1: 1rem;",
		"--spacing-size-2: 0.5rem;",
		"--spacing-scale-md: 8px;",
		"--spacing-scale-lg: 0.75rem;",
	].join("\n");

	assertEquals(result.css.root, expected);

	assertEquals(Array.from(result.resolveMap.keys()), [
		"spacing.custom.size.1",
		"spacing.custom.size.2",
		"spacing.custom.scale.md",
		"spacing.custom.scale.lg",
	]);
	await assertSnapshot(t, result.css.root);
	await assertSnapshot(t, Array.from(result.resolveMap.entries()));
});

Deno.test("processSpacing - generates fluid spacing (prefix)", async (t) => {
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
						positiveSteps: [1, 2],
						prefix: "foo",
						customSizes: ["xs-l"],
					},
				},
			},
		},
	});

	const { css, resolveMap } = processSpacing(config.spacing);
	const expected = [
		"--spacing_fluid-base-foo-xs: clamp(0rem, 0rem + 0vw, 0rem);",
		"--spacing_fluid-base-foo-s: clamp(0.25rem, -0.1667rem + 2.0833vw, 1.5rem);",
		"--spacing_fluid-base-foo-m: clamp(0.25rem, -0.1667rem + 2.0833vw, 1.5rem);",
		"--spacing_fluid-base-foo-l: clamp(0.5rem, -0.3333rem + 4.1667vw, 3rem);",
		"--spacing_fluid-base-foo-xs-l: clamp(0rem, -1rem + 5vw, 3rem);",
		"--spacing_fluid-base-foo-xs-s: clamp(0rem, -0.5rem + 2.5vw, 1.5rem);",
		"--spacing_fluid-base-foo-s-m: clamp(0.25rem, -0.1667rem + 2.0833vw, 1.5rem);",
		"--spacing_fluid-base-foo-m-l: clamp(0.25rem, -0.6667rem + 4.5833vw, 3rem);",
	].join("\n");
	assertEquals(css.root, expected);

	assertEquals(Array.from(resolveMap.keys()), [
		"spacing_fluid.base@xs",
		"spacing_fluid.base@s",
		"spacing_fluid.base@m",
		"spacing_fluid.base@l",
		"spacing_fluid.base@xs-l",
		"spacing_fluid.base@xs-s",
		"spacing_fluid.base@s-m",
		"spacing_fluid.base@m-l",
	]);
	await assertSnapshot(t, css.root);
	await assertSnapshot(t, Array.from(resolveMap.entries()));
});

Deno.test("processSpacing - fluid without prefix falls back to scale name", async (t) => {
	const config = defineConfig({
		spacing: {
			fluid: {
				rhythm: {
					value: {
						minSize: 2,
						maxSize: 20,
						minWidth: 320,
						maxWidth: 1280,
						negativeSteps: [0],
						positiveSteps: [1],
					},
				},
			},
		},
	});
	const { css, resolveMap } = processSpacing(config.spacing);
	const expected = [
		"--spacing_fluid-rhythm-xs: clamp(0rem, 0rem + 0vw, 0rem);",
		"--spacing_fluid-rhythm-s: clamp(0.125rem, -0.25rem + 1.875vw, 1.25rem);",
		"--spacing_fluid-rhythm-m: clamp(0.125rem, -0.25rem + 1.875vw, 1.25rem);",
		"--spacing_fluid-rhythm-xs-s: clamp(0rem, -0.4167rem + 2.0833vw, 1.25rem);",
		"--spacing_fluid-rhythm-s-m: clamp(0.125rem, -0.25rem + 1.875vw, 1.25rem);",
	].join("\n");
	assertEquals(css.root, expected);

	assertEquals(Array.from(resolveMap.keys()), [
		"spacing_fluid.rhythm@xs",
		"spacing_fluid.rhythm@s",
		"spacing_fluid.rhythm@m",
		"spacing_fluid.rhythm@xs-s",
		"spacing_fluid.rhythm@s-m",
	]);
	await assertSnapshot(t, css.root);
	await assertSnapshot(t, Array.from(resolveMap.entries()));
});

Deno.test("processSpacing - combines fluid and custom spacing", async (t) => {
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
						prefix: "flux",
					},
				},
			},
			custom: {
				gap: {
					value: { 1: "4px", 2: "8px" },
					settings: { pxToRem: false },
				},
			},
		},
	});
	const spacingConfig = config.spacing;
	if (!spacingConfig) {
		throw new Error("Expected spacing config.");
	}
	const { css, resolveMap } = processSpacing(spacingConfig);
	const expected = [
		"--spacing_fluid-base-flux-xs: clamp(0rem, 0rem + 0vw, 0rem);",
		"--spacing_fluid-base-flux-s: clamp(0.25rem, -0.1667rem + 2.0833vw, 1.5rem);",
		"--spacing_fluid-base-flux-m: clamp(0.25rem, -0.1667rem + 2.0833vw, 1.5rem);",
		"--spacing_fluid-base-flux-xs-s: clamp(0rem, -0.5rem + 2.5vw, 1.5rem);",
		"--spacing_fluid-base-flux-s-m: clamp(0.25rem, -0.1667rem + 2.0833vw, 1.5rem);",
		"--spacing-gap-1: 4px;",
		"--spacing-gap-2: 8px;",
	].join("\n");
	assertEquals(css.root, expected);
	assertEquals(Array.from(resolveMap.keys()), [
		"spacing_fluid.base@xs",
		"spacing_fluid.base@s",
		"spacing_fluid.base@m",
		"spacing_fluid.base@xs-s",
		"spacing_fluid.base@s-m",
		"spacing.custom.gap.1",
		"spacing.custom.gap.2",
	]);
	await assertSnapshot(t, css.root);
	await assertSnapshot(t, Array.from(resolveMap.entries()));
});
