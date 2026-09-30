---
"@hebilicious/cssforge": minor
---

Generate palette colors in extra sRGB formats alongside `oklch()`, so a browser without
`oklch()` support still renders them, and so non-CSS consumers read the value they need.

`settings.color.formats` selects the formats and the exact outputs to generate. `hex`
produces its CSS value `"#ff7f50"`, the digits `"ff7f50"`, and the number `0xff7f50`; `rgb`
produces `"rgb(255 127 80)"` and `[255, 127, 80]`. A format set to `true` produces its CSS
value only, so `{ hex: true }` stays the short form.

`settings.color.fallback` names the format whose `string` value is the declaration emitted
for browsers without `oklch()` support, after the root block and inside
`@supports not (color: oklch(0% 0 0))`, mirroring the color's `atRule` and `selector`. Without
it, the first format that produces a CSS value is used, so a set of formats that produces none
emits no declaration, and `false` emits none either. A duplicate declaration in the same block
would not have worked: a custom property accepts any token stream, so the modern value wins
everywhere, including where `oklch()` cannot be used. A color outside sRGB uses the CSS gamut
mapping algorithm, which is how a browser maps a color its display cannot show.

A palette color's `settings.color` overrides the palette's per setting. Its `formats` merge
into the palette's per format, so a color can add an output to one format or remove a format
with `false` without restating the others.

The settings are a closed schema. An unknown key, a value of the wrong shape, a fallback that
is not generated or has no `string` output, and color format settings written on a gradient or
a theme all throw with the configuration path instead of generating nothing quietly. The
settings types (`ColorFormatConfig`, `HexFormatOutputs`, `RgbFormatOutputs`, `ColorSettings`,
`PaletteColorSettings`) are exported from the package entry.

Each format also takes an `alpha` policy: `true` (the default) keeps the alpha the color
carries, a number between 0 and 1 generates that format at that opacity, and `false` rejects
a color that carries alpha and drops the alpha from the output. The `oklch()` value keeps the
alpha the color carries, so a format that sets an alpha is generated at that opacity alone.

The JSON and TypeScript token objects gain a `color` object keyed by format and output, such
as `{ hex: { string: "#ff7f50", number: 16744272 }, rgb: { array: [255, 127, 80] } }`, and
the Style Dictionary output gains `attributes.color` and `$color`.

`cssforge --color-formats hex,rgb` generates the formats for a run at the CLI level, appended
to the ones the configuration declares.
