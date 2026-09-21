# CSS Forge Docs Index

This file maps user requests to official CSS Forge documentation.

## Primary documentation

- Local docs: `README.md`
- Remote docs: `https://raw.githubusercontent.com/Hebilicious/cssforge/refs/heads/main/README.md`

## What to read for each task

- Installation and setup:
  - `README.md` -> `## Installation`, `## Quick Start`
- Token schema and examples:
  - `README.md` -> `## Configuration`
  - `### Colors`
  - `### Spacing`
  - `### Typography`
  - `### Primitives`
- Variable references inside config:
  - `README.md` -> `## Referencing Variables`
- Scope diagnostics for references that do not resolve where the alias is computed:
  - `README.md` -> `## Diagnostics`
- CLI options and outputs:
  - `README.md` -> `## CLI Usage`
  - `references/cli-reference.md`
- Programmatic usage:
  - `README.md` -> `## Programmatic Usage`

## Important rule from docs

README `md:generate` comment blocks are source-of-truth examples. Keep their structure
when adapting configs.
