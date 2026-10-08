---
"@hebilicious/cssforge": minor
---

Derive colors with a `mix` value in palette variants and theme values. `{ mix: { from: "palette.accent.base", with: "black", amount: 15 } }` emits `color-mix(in oklch, var(--palette-accent-base), black 15%)`, so overriding the base re-derives the variant.

- `from` and `with` take a dotted token path, emitted as its `var()` reference, or a CSS color such as `"transparent"`, emitted as written.
- `amount` is the percentage of `with`, from 0 to 100. `in` accepts only `"oklch"`, the default.
- A palette mix with `formats` computes its sRGB values by mixing in OKLCH, and an achromatic operand keeps the other color's hue.
- Unknown keys, an amount out of range, an unresolvable path, and a value that is not a color are rejected with the configuration path.
