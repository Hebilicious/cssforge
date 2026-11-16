import { defineConfig } from "tsup";

export default defineConfig({
	entry: {
		mod: "src/mod.ts",
		cli: "src/cli.ts",
	},
	format: ["esm"],
	dts: true,
	clean: true,
	sourcemap: true,
	target: "node24",
	outDir: "dist",
});
