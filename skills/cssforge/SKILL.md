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
- Wire it into the project's existing task runner (a `package.json` script, a Makefile,
  ...) if the project uses one, and pass `--config` and the output flags its layout needs
  (`references/cli-reference.md`). `cssforge --watch` rebuilds on each config change.
- For an agent, `cssforge mcp` serves the same commands as MCP tools through stdio.

5. Validate outputs
- Run `cssforge check` to validate the config, then `cssforge build` (or the project's own
  generation command).
- Verify the CSS output (`./.cssforge/output.css` unless `--css` changes it) exists and
  contains the expected custom properties.
- With the bundler plugin, run the project's build; set the plugin's `write` option to get
  the stylesheet on disk for inspection.

6. Troubleshoot
- Use `references/troubleshooting.md`.
- For schema uncertainty, check `node_modules/@hebilicious/cssforge/src/config.ts` and the
  module types listed in `references/source-schema-map.md`.
