# Source Schema Map

When README examples are not enough, use source types.

## Core config type

- `packages/cssforge/src/config.ts`
- `CSSForgeConfig` fields:
  - `colors: ColorConfig`
  - `typography: TypographyConfig`
  - `spacing: SpacingConfig`
  - `primitives: PrimitiveConfig`
  - `diagnostics?: DiagnosticsConfig` (`suppress` silences scope diagnostics by configuration path, or `"*"` for all)

## Module type sources

- Colors schema: `packages/cssforge/src/modules/colors.ts`
- Spacing schema: `packages/cssforge/src/modules/spacing.ts`
- Typography schema: `packages/cssforge/src/modules/typography.ts`
- Primitives schema: `packages/cssforge/src/modules/primitive.ts`

## Exposed API entrypoint

- `packages/cssforge/src/mod.ts` exports `defineConfig`, `generateCSS`, `getScopeDiagnostics`, and processing helpers. `getScopeDiagnostics(config)` reports token references that are not available where the alias is computed; the CLI prints them and `--strict` makes them fatal.

## Guidance

If a user asks for a field not represented in docs or these types, do not fabricate it.
Offer the nearest supported pattern from README + types.
