---
"@hebilicious/cssforge": minor
---

Publish to npm as the primary channel and ship a `cssforge` executable.

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
