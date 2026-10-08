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
  run time. Unknown settings are rejected with the configuration path. Tokens carry
  `gamutMapped: true` when the color is outside sRGB.
## Spacing

- Static spacing under `spacing.custom`.
- Fluid spacing under `spacing.fluid` using Utopia inputs.
- `pxToRem` (enabled by default) converts each top-level `px` length to rem (`4px 8px` →
  `0.25rem 0.5rem`) and leaves values inside CSS functions untouched. Write a pill radius as
  `calc(infinity * 1px)`, not `999px`.

## Typography

- Weights under `typography.weight`.
- Fluid type scales under `typography.fluid` with optional custom labels/prefix.

## Motion

- Durations under `motion.duration.<group>.value` in `ms` or `s`; easings under
  `motion.easing.<group>.value`. Spread `uiEasings` into an easing group for the two
  recommended curves.
- Durations over 300ms warn unless the group sets `settings.long` (modals, drawers: 500ms).
  `ease-in` and ease-in shaped `cubic-bezier()` curves warn.

## Primitives

- Use `primitives.<group>.value.<variant>`.
- Compose from other tokens via `variables` references.

## Reference syntax

- Use dot notation without `.value` segments.
- Fluid references use `@`, for example:
  - spacing: `spacing_fluid.base@xs`
  - typography: `typography_fluid.comicsans@a`
- Motion references: `motion.duration.ui.press`, `motion.easing.ui.out`
