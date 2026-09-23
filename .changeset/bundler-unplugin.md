---
"@hebilicious/cssforge-unplugin": minor
---

Add `@hebilicious/cssforge-unplugin`, a unplugin-based bundler plugin that generates CSS Forge token
output inside the build for Vite, Rollup, Rolldown, webpack, Rspack, Rsbuild, esbuild, Farm, and Bun.

Projects import `virtual:cssforge.css` instead of pre-generating `./.cssforge/output.css` with the
CLI. The plugin serves the same CSS the CLI writes, registers the config and its local imports as
watch files, and updates styles through Vite HMR when a token changes.
