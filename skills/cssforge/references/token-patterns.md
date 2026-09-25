# Token Patterns From Official Docs

All patterns below are derived from README configuration examples.

## Colors

- Palette tokens under `colors.palette.value`.
- Supports color formats like hex/rgb/hsl/oklch and string values.
- Themes and gradients can reference palette entries with `variables` maps.
- Set `settings.color.formats` on `colors.palette` (or on one color's `settings`) to generate
  sRGB formats alongside `oklch()`. `hex` produces `string` (`"#ff7f50"`), `digits`
  (`"ff7f50"`) and `number` (`0xff7f50`); `rgb` produces `string` (`"rgb(255 127 80)"`) and
  `array` (`[255, 127, 80]`). A format set to `true` produces its CSS value only.
- `settings.color.fallback` names the format whose `string` value is the declaration emitted
  under `@supports not (color: oklch(0% 0 0))`; it defaults to the first generated format and
  `false` emits no declaration. `settings.color.alpha` keeps the color's alpha (`true`), sets
  it (`0`-`1`), or rejects a color that carries one (`false`). Every generated value reaches
  the JSON, TypeScript and Style Dictionary tokens as the token's `color` object, and
  `--color-formats hex,rgb` adds formats at run time.

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
