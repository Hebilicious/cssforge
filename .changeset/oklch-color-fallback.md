---
"@hebilicious/cssforge": minor
---

Generate palette colors in extra sRGB formats alongside `oklch()`, so a browser without
`oklch()` support still renders them, and so non-CSS consumers can read a legacy value.

Set `settings.color.formats` on the palette to cover every color, or on a single color to
override it. `"hex"` writes `#rrggbb` (or `#rrggbbaa` with alpha) and `"rgb"` writes
`rgb(r g b)` (or `rgb(r g b / a)`); `[]` or `false` opts a color out of an inherited value.

A CSS declaration holds one value, so the first configured format is the one emitted for
browsers without `oklch()` support, after the root block and inside
`@supports not (color: oklch(0% 0 0))`, mirroring the color's `atRule` and `selector`. A
duplicate declaration in the same block would not have worked: a custom property accepts any
token stream, so the modern value wins everywhere, including where `oklch()` cannot be used.
A color outside sRGB uses the CSS gamut mapping algorithm, which is how a browser maps a
color its display cannot show.

The JSON and TypeScript token objects gain a `color` object keyed by format, such as
`{ hex: "#ff7f50", rgb: "rgb(255 127 80)" }`, and the Style Dictionary output gains
`attributes.color` and `$color`.

`cssforge --color-formats hex,rgb` generates the formats for a run at the CLI level, appended
to the ones the configuration declares.
