---
name: cssforge
description: Use CSS Forge documentation and source schema to create, update, and troubleshoot cssforge.config.ts files, then generate CSS/JSON/TS outputs correctly.
---

# CSS Forge Skill

Use this skill when a user wants to use CSS Forge itself: author token configs, generate
artifacts, resolve variable references, or debug generation issues.

## Design Guidance

Follow **good-css** foundations and motion rules when authoring tokens. Good CSS documents modern CSS techniques that replace breakpoints and scripts—such as OKLCH color with `none` for grays, derived hover colors with `color-mix()`, fluid type in `clamp()`, and motion tokens with no `ease-in`.

- **good-css:** https://good-css.com  
- **good-css skill:** https://good-css.com/skills/good-css/SKILL.md
- **good-css foundations reference:** https://good-css.com/references/foundations.md
- **CSS Forge mapping:** `references/good-css-mapping.md` (how to implement each good-css rule in CSS Forge config)

Read the mapping before authoring colors, typography, spacing, or motion tokens.

## Source of truth

Always prioritize official project docs and source types:

1. `references/docs-index.md`
2. `README.md` (project root)
3. `references/good-css-mapping.md` (design guidance)
4. `references/source-schema-map.md`
5. `references/cli-reference.md`
6. `references/troubleshooting.md`

Do not invent schema fields that are not present in docs or source types.

## Workflow

1. Confirm the user goal
- New config from scratch
- Extend existing config (colors, spacing, typography, motion, primitives)
- Fix references / generation errors
- Wire CLI scripts and output paths

2. Author config from docs
- Start from `assets/config-templates/*.ts`.
- Use package import in config:
  - `import { defineConfig } from "@hebilicious/cssforge";`
- Mirror patterns from README configuration sections.

3. Configure generation commands
- Install the package from npm: `npm install --save-dev @hebilicious/cssforge` (Deno projects
  use the secondary JSR channel: `deno add jsr:@hebilicious/cssforge`).
- Run the installed executable directly: `cssforge --mode all` (`npx cssforge` with npm,
  `pnpm cssforge` with pnpm)
- For local repo examples, call the built CLI of the sibling package directly: pnpm only
  links the workspace `cssforge` binary once `dist` exists, so a fresh checkout has no
  `node_modules/.bin/cssforge` before the first build:
  - `cssforge-generate`: `node ../../packages/cssforge/dist/cli.js --prefix . --config ./cssforge.config.ts --mode css --css ./.cssforge/output.css`
  - `cssforge-build-local`: `moon run cssforge:pack`

4. Validate outputs
- Run `moon run <project>:cssforge-build-local` then `moon run <project>:cssforge-generate`.
- Verify `./.cssforge/output.css` exists and contains expected custom properties.

5. Troubleshoot with docs
- Use `references/troubleshooting.md` and relevant README sections.
- For schema uncertainty, check `packages/cssforge/src/config.ts` and module types listed in
  `references/source-schema-map.md`.
