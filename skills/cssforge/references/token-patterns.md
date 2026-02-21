# Token Patterns From Official Docs

All patterns below are derived from README configuration examples.

## Colors

- Palette tokens under `colors.palette.value`.
- Supports color formats like hex/rgb/hsl/oklch and string values.
- Themes and gradients can reference palette entries with `variables` maps.

## Spacing

- Static spacing under `spacing.custom`.
- Fluid spacing under `spacing.fluid` using Utopia inputs.

## Typography

- Weights under `typography.weight`.
- Fluid type scales under `typography.fluid` with optional custom labels/prefix.

## Primitives

- Use `primitives.<group>.value.<variant>`.
- Compose from other tokens via `variables` references.

## Reference syntax

- Use dot notation without `.value` segments.
- Fluid references use `@`, for example:
  - spacing: `spacing_fluid.base@xs`
  - typography: `typography_fluid.comicsans@a`
