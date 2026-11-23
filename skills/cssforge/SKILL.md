---
name: cssforge
description: Use CSS Forge documentation and source schema to create, update, and troubleshoot cssforge.config.ts files, then generate CSS/JSON/TS outputs correctly.
---

# CSS Forge Skill

Use this skill when a user wants to use CSS Forge itself: author token configs, generate
artifacts, resolve variable references, or debug generation issues.

## Source of truth

This skill is self-contained: its references hold what you need. For exact types, read the
TypeScript source the installed package ships in `node_modules/@hebilicious/cssforge/src/`.

1. `references/docs-index.md`
2. `references/token-patterns.md`
3. `references/source-schema-map.md`
4. `references/cli-reference.md`
5. `references/bundler-plugin.md`
6. `references/troubleshooting.md`

Do not invent schema fields that are not present in these references or the source types.

## Workflow

1. Confirm the user goal
- New config from scratch
- Extend existing config (colors, spacing, typography, motion, primitives)
- Fix references / generation errors
- Wire CLI scripts and output paths

2. Author the config
- Start from `assets/config-templates/*.ts`.
- Use package import in config:
  - `import { defineConfig } from "@hebilicious/cssforge";`
- Follow the patterns in `references/token-patterns.md`.

3. Choose how tokens are generated
- The CLI (next step) works everywhere, with or without a dev server or a build.
- If the project builds with Vite, webpack, Rollup or another bundler that unplugin supports,
  the bundler plugin `@hebilicious/cssforge-unplugin` is an option: it generates the CSS
  inside the build. Read `references/bundler-plugin.md` before you propose it.

4. Configure generation commands
- Install the package from npm: `npm install --save-dev @hebilicious/cssforge` (the same
  version is on the secondary JSR channel: `npx jsr add @hebilicious/cssforge`).
- Run the installed executable directly: `cssforge --mode all` (`npx cssforge` with npm,
  `pnpm cssforge` with pnpm).
- For an agent, `cssforge mcp` serves the same commands as MCP tools through stdio.
- For local repo examples, call the built CLI of the sibling package directly: pnpm only
  links the workspace `cssforge` binary once `dist` exists, so a fresh checkout has no
  `node_modules/.bin/cssforge` before the first build:
  - `cssforge-generate`: `node ../../packages/cssforge/dist/cli.js --config ./cssforge.config.ts --mode css --css ./.cssforge/output.css`
  - `cssforge-build-local`: `moon run cssforge:pack`

5. Validate outputs
- Run `moon run <project>:cssforge-build-local` then `moon run <project>:cssforge-generate`.
- Verify `./.cssforge/output.css` exists and contains expected custom properties.

6. Troubleshoot
- Use `references/troubleshooting.md`.
- For schema uncertainty, check `node_modules/@hebilicious/cssforge/src/config.ts` and the
  module types listed in `references/source-schema-map.md`.
