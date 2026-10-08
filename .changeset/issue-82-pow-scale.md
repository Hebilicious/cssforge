---
"@hebilicious/cssforge": minor
---

Fluid type scales are written with `pow()` in the CSS by default, and `clamp()` is an option.

- The CSS declares each scale's six inputs (`narrow`, `wide`, `size-narrow`, `size-wide`, `ratio-narrow`, `ratio-wide`) as plain numbers, plus the `fluid`, `at-narrow` and `at-wide` helpers, named `--typography_fluid-<scale>[-<prefix>]-<name>`. Every step derives from them, so the scale can be tuned live in DevTools. `pow()` needs Chrome 120, Firefox 118 or Safari 15.4.
- `generateCSS(config, { fluidTypeFunction: "clamp" })`, or the CLI flag `--fluid-type-function clamp`, writes each step as one `clamp()` instead, as before. The option belongs to the CSS output only: the JSON, TypeScript and Style Dictionary outputs are the same for both, and each step token holds its `clamp()` value. The inputs and helpers are not tokens.
- A step below 0 is now step 0 divided by `minTypeScale^n` at every width, so a small size never shrinks as the screen grows. Its size at `maxWidth` is `maxFontSize / minTypeScale^n` instead of utopia's `maxFontSize / maxTypeScale^n`. This changes the `clamp()` of negative steps when `minTypeScale` and `maxTypeScale` differ, in every output, and the fluid type checks use these sizes. Steps 0 and above are unchanged.
- Steps keep their names and references, `customLabel` included. A step label equal to an input name, such as `fluid`, is a key collision in the pow CSS.
- `relativeTo` is validated for every scale: `"container"` writes `cqi`, `"viewport"` writes `vi`, and the default `"viewport-width"` writes `vw`.
