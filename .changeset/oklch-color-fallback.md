---
"@hebilicious/cssforge": minor
---

Add an sRGB fallback for palette colors, so a browser without `oklch()` support still renders them.

Set `fallback` on the palette to cover every color, or on a single color to override it. `"hex"`
writes `#rrggbb` (or `#rrggbbaa` with alpha) and `"rgb"` writes `rgb(r g b)` (or `rgb(r g b / a)`);
`false` opts a color out of an inherited fallback. Each fallback is emitted after the root block,
inside `@supports not (color: oklch(0% 0 0))` and mirroring the color's `atRule` and `selector`, so
it only overrides the declaration it stands in for. A custom property accepts any token stream, so
a duplicate declaration in the same block would not have worked: the modern value wins everywhere,
including where `oklch()` cannot be used.

The JSON and TypeScript token objects gain a `fallback` field, and the Style Dictionary output
gains `attributes.fallback` and `$fallback`, so non-CSS consumers can read the sRGB value without
converting the color themselves.
