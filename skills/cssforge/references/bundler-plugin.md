# Bundler Plugin

`@hebilicious/cssforge-unplugin` generates the tokens inside a build, from the same
`cssforge.config.ts`, instead of a separate CLI step. It is built on
[unplugin](https://unplugin.unjs.io), so it works with any framework whose build runs on one
of the bundlers below.

## When to offer it

It is one option next to the CLI. Offer it when the project has a supported build and the
user wants generation tied to that build or to its dev server. Keep the CLI when:

- the work runs without a dev server or a build (a script, CI, or an agent checking output);
- another tool reads the generated files before the build runs;
- the output must be Style Dictionary JSON, JSON or TypeScript (the plugin serves CSS);
- the project uses the JSR package or has no bundler.

## Install

```bash
npm install --save-dev @hebilicious/cssforge @hebilicious/cssforge-unplugin
```

## Entry points

| Bundler | Import |
| --- | --- |
| Vite | `@hebilicious/cssforge-unplugin/vite` |
| Rollup | `@hebilicious/cssforge-unplugin/rollup` |
| Rolldown | `@hebilicious/cssforge-unplugin/rolldown` |
| webpack | `@hebilicious/cssforge-unplugin/webpack` |
| Rspack | `@hebilicious/cssforge-unplugin/rspack` |
| Rsbuild | `@hebilicious/cssforge-unplugin/rsbuild` |
| esbuild | `@hebilicious/cssforge-unplugin/esbuild` |
| Farm | `@hebilicious/cssforge-unplugin/farm` |
| Bun | `@hebilicious/cssforge-unplugin/bun` |

Register the entry point where the project, or its framework, accepts plugins for that
bundler. With Vite:

```typescript
// vite.config.ts
import cssforge from "@hebilicious/cssforge-unplugin/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [cssforge()],
});
```

## Use the stylesheet

```typescript
import "virtual:cssforge.css";
```

TypeScript needs the ambient declaration for that import:

```typescript
/// <reference types="@hebilicious/cssforge-unplugin/client" />
```

The config and every local module it imports are watch files: editing a token regenerates
the stylesheet, and a Vite dev server updates it without a page reload.

## Options

```typescript
cssforge({
  // Resolved against the build's working directory. Default: ./cssforge.config.ts
  config: "./cssforge.config.ts",
  // Also write the stylesheet to disk. Default: false
  write: { css: "./.cssforge/output.css" },
});
```

`write: true` uses `./.cssforge/output.css`, the CLI's default path. Set `write` when another
tool needs a real file, when the bundler has no CSS handling for virtual modules, or to import
the tokens into a cascade layer: `@import "virtual:cssforge.css" layer(cssforge)` does not
work, so import the written file with `layer(cssforge)` instead.

The plugin output matches `cssforge --mode css` byte for byte.
