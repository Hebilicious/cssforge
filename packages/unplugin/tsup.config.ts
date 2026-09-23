import { defineConfig } from "tsup";

export default defineConfig({
	entry: {
		index: "src/index.ts",
		vite: "src/vite.ts",
		rollup: "src/rollup.ts",
		rolldown: "src/rolldown.ts",
		webpack: "src/webpack.ts",
		rspack: "src/rspack.ts",
		rsbuild: "src/rsbuild.ts",
		esbuild: "src/esbuild.ts",
		farm: "src/farm.ts",
		bun: "src/bun.ts",
	},
	// webpack and rspack configs are still commonly CommonJS, so every entry
	// ships both formats.
	format: ["esm", "cjs"],
	dts: true,
	clean: true,
	sourcemap: true,
	target: "node24",
	outDir: "dist",
});
