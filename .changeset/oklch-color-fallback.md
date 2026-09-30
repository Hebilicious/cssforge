---
"@hebilicious/cssforge": minor
---

Generate palette colors in extra sRGB formats alongside `oklch()`, so a browser without
`oklch()` support still renders them and non-CSS consumers read the value they need.

`settings.color.formats` selects the formats and outputs: `hex` produces `"#ff7f50"`,
`"ff7f50"` and `0xff7f50`, `rgb` produces `"rgb(255 127 80)"` and `[255, 127, 80]`, and a
format set to `true` produces its CSS value only. Each format takes `alpha`: `true` keeps the
color's alpha, a number from 0 to 1 sets it, `false` rejects the color.

`settings.color.fallback` names the format whose `string` value becomes the declaration for
browsers without `oklch()` support, emitted after the root block inside
`@supports not (color: oklch(0% 0 0))` and mirroring the color's `atRule` and `selector`.
Without it, the first format that produces a CSS value is used, and `false` declares nothing.

A palette color's settings override the palette's per setting, and its `formats` merge per
format with `false` to remove one. The color settings are a closed schema: unknown keys, a
`formats` that is not an object, and color format settings on a gradient, a theme, or a level
that reads no settings throw with the configuration path. The settings types are exported
from the package entry.

Tokens gain a `color` object keyed by format and output, plus `gamutMapped: true` when a
format is generated for a color outside sRGB, mirrored by `attributes.color`, `$color` and
`$gamutMapped` in Style Dictionary. `cssforge --color-formats hex,rgb` adds formats for a run.
