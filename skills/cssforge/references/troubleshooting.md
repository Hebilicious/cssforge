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
- For an alias that resolves to nothing, read README `## Diagnostics`: a custom property is
  substituted where the alias is declared, so a `:root` alias cannot read a token emitted only
  under a narrower selector or at-rule. `getScopeDiagnostics(config)` lists those references.

## Unexpected variable names

- Check README notes on naming behavior, including theme options such as
  `variantNameOnly`.

## Need authoritative schema answer

- Check `references/source-schema-map.md` and referenced module type files before
  changing config shape.
