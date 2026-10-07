---
"@hebilicious/cssforge": minor
---

Write a fluid type scale with `pow()` instead of `clamp()`.

- `typography.fluid.<scale>.settings.output: "pow"` emits the scale's six inputs (`narrow`, `wide`, `size-narrow`, `size-wide`, `ratio-narrow`, `ratio-wide`) as plain numbers, plus the `fluid`, `at-narrow` and `at-wide` helpers, named `--typography_fluid-<scale>[-<prefix>]-<name>`. Every step derives from them, so the scale can be tuned live in DevTools. `pow()` needs Chrome 120, Firefox 118 or Safari 15.4.
- Steps keep their clamp-mode names and references, `customLabel` included. A step below 0 is step 0 divided by `pow(ratio-narrow, n)`, and the fluid type checks use those sizes.
- The inputs and helpers are tokens in the JSON and TypeScript outputs and can be referenced as `typography_fluid.<scale>.<name>`.
- `relativeTo: "container"` writes `100cqi`, `"viewport"` writes `100vi`, and the default `"viewport-width"` writes `100vw`.
- `"clamp"` stays the default, and its output is unchanged.
