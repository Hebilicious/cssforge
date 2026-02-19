---
name: cssforge
description: Use CSS Forge documentation and source schema to create, update, and troubleshoot cssforge.config.ts files, then generate CSS/JSON/TS outputs correctly.
---

# CSS Forge Skill

Use this skill when a user wants to use CSS Forge itself: author token configs, generate
artifacts, resolve variable references, or debug generation issues.

## Source of truth

Always prioritize official project docs and source types:

1. `references/docs-index.md`
2. `README.md` (project root)
3. `references/source-schema-map.md`
4. `references/cli-reference.md`
5. `references/troubleshooting.md`

Do not invent schema fields that are not present in docs or source types.

## Workflow

1. Confirm the user goal
- New config from scratch
- Extend existing config (colors, spacing, typography, primitives)
- Fix references / generation errors
- Wire CLI scripts and output paths

2. Author config from docs
- Start from `assets/config-templates/*.ts`.
- Use package import in config:
  - `import { defineConfig } from "@hebilicious/cssforge";`
- Mirror patterns from README configuration sections.

3. Configure generation commands
- For local repo examples, link the package in deps:
  - `"@hebilicious/cssforge": "file:../.."`
- Add local package dry-run build script when working in this repo examples:
  - `cssforge-build-local`: `moon run cssforge:jsr-dry-run`
- Add generation script:
  - `cssforge-generate`: `tsx ../../packages/cssforge/src/cli.ts --prefix . --config ./cssforge.config.ts --mode css --css ./.cssforge/output.css`

4. Validate outputs
- Run `moon run <project>:cssforge-build-local` then `moon run <project>:cssforge-generate`.
- Verify `./.cssforge/output.css` exists and contains expected custom properties.

5. Troubleshoot with docs
- Use `references/troubleshooting.md` and relevant README sections.
- For schema uncertainty, check `packages/cssforge/src/config.ts` and module types listed in
  `references/source-schema-map.md`.
