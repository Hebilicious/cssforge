# @hebilicious/cssforge-unplugin

## 0.1.2

### Patch Changes

- Updated dependencies [f83df72]
- Updated dependencies [b364d08]
- Updated dependencies [5d7cdd2]
- Updated dependencies [34a7f87]
- Updated dependencies [84ac160]
- Updated dependencies [b2636df]
- Updated dependencies [f316382]
  - @hebilicious/cssforge@0.10.0

## 0.1.1

### Patch Changes

- Updated dependencies [2561cc8]
- Updated dependencies [2561cc8]
  - @hebilicious/cssforge@0.9.0

## 0.1.0

### Minor Changes

- 21357d9: Add `@hebilicious/cssforge-unplugin`, a unplugin-based bundler plugin that generates CSS Forge token
  output inside the build for Vite, Rollup, Rolldown, webpack, Rspack, Rsbuild, esbuild, Farm, and Bun.

  Projects import `virtual:cssforge.css` instead of pre-generating `./.cssforge/output.css` with the
  CLI. The plugin serves the same CSS the CLI writes, registers the config and its local imports as
  watch files, and updates styles through Vite HMR when a token changes.

### Patch Changes

- Updated dependencies [21357d9]
  - @hebilicious/cssforge@0.8.0
