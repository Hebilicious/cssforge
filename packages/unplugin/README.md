# @hebilicious/cssforge-unplugin

Generate [CSS Forge](https://cssforge.hebilicious.workers.dev) design-token CSS inside the build,
through [unplugin](https://unplugin.unjs.io): Vite, Rollup, Rolldown, webpack, Rspack, Rsbuild,
esbuild, Farm, and Bun.

The plugin loads `cssforge.config.ts`, serves the generated stylesheet from
`virtual:cssforge.css`, and watches the config and every local token module it imports, so a token
edit regenerates the stylesheet.

## Install

```sh
pnpm add -D @hebilicious/cssforge-unplugin
```

Runtime dependencies are `unplugin` and `@hebilicious/cssforge`. Bundlers are not dependencies or peers:
your project already has one, and it stays the only one installed. The package exports both ESM and
CommonJS, because webpack and Rspack configs are often CommonJS.

## Vite

```ts
// vite.config.ts
import cssforge from "@hebilicious/cssforge-unplugin/vite";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [cssforge()],
});
```

```ts
// src/main.ts
import "virtual:cssforge.css";
```

Add the ambient declaration once so TypeScript accepts the import:

```ts
// src/vite-env.d.ts
/// <reference types="@hebilicious/cssforge-unplugin/client" />
```

## Other bundlers

| Bundler | Import | Notes |
| --- | --- | --- |
| Vite | `@hebilicious/cssforge-unplugin/vite` | Styles update through HMR when a token changes. |
| Rollup | `@hebilicious/cssforge-unplugin/rollup` | Needs a CSS plugin, or set `write`. |
| Rolldown | `@hebilicious/cssforge-unplugin/rolldown` | Needs a CSS plugin, or set `write`. |
| webpack | `@hebilicious/cssforge-unplugin/webpack` | Needs an asset rule for CSS. |
| Rspack | `@hebilicious/cssforge-unplugin/rspack` | Needs an asset rule for CSS. |
| Rsbuild | `@hebilicious/cssforge-unplugin/rsbuild` | CSS is handled out of the box. |
| esbuild | `@hebilicious/cssforge-unplugin/esbuild` | CSS is handled out of the box. |
| Farm | `@hebilicious/cssforge-unplugin/farm` | CSS is handled out of the box. |
| Bun | `@hebilicious/cssforge-unplugin/bun` | CSS is handled out of the box. |

```js
// webpack.config.js
const cssforge = require("@hebilicious/cssforge-unplugin/webpack");

module.exports = {
	plugins: [cssforge()],
};
```

## Options

```ts
cssforge({
	// Resolved against the build's working directory. Default: ./cssforge.config.ts
	config: "./cssforge.config.ts",
	// Write the stylesheet to disk as well as serving the virtual module.
	// Default: false
	write: { css: "./.cssforge/output.css" },
});
```

`write: true` uses `./.cssforge/output.css`, the CLI's default path. Use it when a tool needs a real
file, or when a bundler has no CSS handling for virtual modules.

## Behavior

- **Lazy generation.** The stylesheet is generated the first time `virtual:cssforge.css` is loaded.
  With `write`, it is also generated during `buildStart`, so the file exists even when nothing imports
  the module.
- **Watch.** The config file and every local module it imports are registered as watch files. A change
  invalidates the cached stylesheet, so the next build regenerates it. In Vite, the running dev server
  updates the styles without a page reload.
- **One config per plugin instance.** Generation reuses the core `generateCSS`, so plugin output is
  byte-identical to the CLI's `--mode css` output for the same config.
- **No CSS layer.** The virtual module serves exactly what `generateCSS` produces, so the declarations
  are unlayered. `@import "virtual:cssforge.css" layer(cssforge)` does not work, because a CSS import
  resolves to a file. To keep tokens in a cascade layer, set `write` and import the written file:

  ```css
  @import "./.cssforge/output.css" layer(cssforge);
  ```

- **Errors.** A missing config or a generation failure fails the build with the same error the CLI
  reports, including the config path and the offending token path.

## Requirements

Node 24 or newer, matching `@hebilicious/cssforge`. The config is loaded with Node's native TypeScript
support, so no extra loader is needed.
