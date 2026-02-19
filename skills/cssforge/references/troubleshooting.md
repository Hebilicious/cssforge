# Troubleshooting (Docs-Driven)

## Config import fails

- Use package import in config:
  - `import { defineConfig } from "@hebilicious/cssforge";`
- If using local repo examples, run local package dry-run first:
  - `moon run <project>:cssforge-build-local`

## Generated output missing

- Confirm CLI config path and output flags from `references/cli-reference.md`.
- Run generation directly and inspect CLI error output.

## Variables do not resolve

- Verify reference syntax from README `## Referencing Variables`:
  - No `.value` in references
  - Fluid scales require `@label`

## Unexpected variable names

- Check README notes on naming behavior, including theme options such as
  `variantNameOnly`.

## Need authoritative schema answer

- Check `references/source-schema-map.md` and referenced module type files before
  changing config shape.
