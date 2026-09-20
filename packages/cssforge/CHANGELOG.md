# @hebilicious/cssforge

## 0.6.0

### Minor Changes

- 143e495: Publish to npm as the primary channel and ship a `cssforge` executable.

  - Install with `npm install --save-dev @hebilicious/cssforge` (or `pnpm add -D`), then use
    `"cssforge": "cssforge"` in `package.json` scripts. Consumers no longer need to reach into
    `node_modules/@hebilicious/cssforge/src` with `tsx`.
  - Import the package by name in configuration files:
    `import { defineConfig } from "@hebilicious/cssforge";`
  - Node 24 or newer is required. `cssforge.config.ts` loads through the native TypeScript
    support of that runtime.
  - The CLI now runs when the entry point is reached through a package-manager symlink or a
    `jsr:` URL. Both cases previously exited silently without doing anything.
  - JSR stays available as the secondary channel for Deno, published after npm and verified
    after publication.

## 0.5.0

### Minor Changes

- 438b9a1: Add Style Dictionary token JSON output, with resolved values by default and an optional CSS-variable mode for usage matching.

## 0.4.1

### Patch Changes

- 8b3f5ab: fix nesting for selector and atRules

## 0.4.0

### Minor Changes

- ab752be: # Introduce variantNameOnly feature for themes.

  When working with themes, you can choose to only include the variant name in the CSS
  variable name by setting `variantNameOnly: true` in the color definition settings. This
  is usually used in combination with `condition` to conditionnally apply themes.

  - Default: `--theme-${themeName}-${colorName}-${variantName}`
  - VariantOnly Name: `--${variantName}`
  - Path : `theme.${themeName}.${colorName}.${variantName}`

## 0.3.0

### Minor Changes

- 41bff15: # Conditions and variables access

  Add the posibility to add conditions for colors modules. This is a breaking change for
  the configuration format.

## 0.2.1

### Patch Changes

- 1df1f2d: fix: update reserved keywords

## 0.2.0

### Minor Changes

- 3a6582e: feat: add fluid spacing

## 0.1.1

### Patch Changes

- 4e448fd: chore: update module documentation

## 0.1.0

### Minor Changes

- a202035: Initial Release
