# Token Patterns From Official Docs

All patterns below are derived from README configuration examples.

## Colors

- Palette tokens under `colors.palette.value`.
- Supports color formats like hex/rgb/hsl/oklch and string values.
- Themes and gradients can reference palette entries with `variables` maps.
- `settings.color.formats` generates sRGB values alongside `oklch()`. `hex` produces
  `string`, `digits` and `number`; `rgb` produces `string` and `array`; each takes `alpha`
  (`true` keeps it, a 0-1 number sets it, `false` rejects the color).
- `settings.color.fallback` names the format whose `string` value becomes the CSS declaration,
  or `false` for none. Without it, the first format with a CSS value is used. A color's
  formats merge into the palette's per format, and `--color-formats hex,rgb` adds formats at
  run time. Unknown settings are rejected with the configuration path.
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
