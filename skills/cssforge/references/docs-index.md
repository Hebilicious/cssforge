# CSS Forge Docs Index

This file maps user requests to official CSS Forge documentation.

## Primary documentation

- Local docs: `README.md`
- Remote docs: `https://raw.githubusercontent.com/Hebilicious/cssforge/refs/heads/main/README.md`

## What to read for each task

- Design guidance and best practices:
  - `references/good-css-mapping.md` (how to implement good-css rules in CSS Forge)
  - https://good-css.com (the good-css design guidelines)
- Installation and setup:
  - `README.md` -> `## Installation`, `## Quick Start`
- Token schema and examples:
  - `README.md` -> `## Configuration`
  - `### Colors`
  - `### Spacing`
  - `### Typography`
  - `### Motion`
  - `### Primitives`
- Variable references inside config:
  - `README.md` -> `## Referencing Variables`
- CLI options and outputs:
  - `README.md` -> `## CLI Usage`
  - `references/cli-reference.md`
- Programmatic usage:
  - `README.md` -> `## Programmatic Usage`

## Important rule from docs

README `md:generate` comment blocks are source-of-truth examples. Keep their structure
when adapting configs.
