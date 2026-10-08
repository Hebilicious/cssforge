---
"@hebilicious/cssforge": minor
---

Every fluid type scale is also written with `pow()`, beside its `clamp()` steps, in every output.

- The `clamp()` steps keep their names and paths, `--typography_fluid-<scale>[-<prefix>]-<label>` at `typography_fluid.<scale>@<label>`. Steps 0 and above are unchanged.
- Each scale adds pow tokens under a `pow` segment: the inputs `narrow`, `wide`, `size-narrow`, `size-wide`, `ratio-narrow` and `ratio-wide` as plain numbers, the helpers `fluid`, `at-narrow` and `at-wide`, and every step derived from them with `pow()`. They are named `--typography_fluid-<scale>[-<prefix>]-pow-<name>` and `--typography_fluid-<scale>[-<prefix>]-pow-<label>`, at `typography_fluid.<scale>.pow.<name>` and `typography_fluid.<scale>.pow@<label>`. Changing an input on `:root` tunes the whole scale at runtime. `pow()` needs Chrome 120, Firefox 118 or Safari 15.4.
- The pow tokens are ordinary tokens: the CSS, JSON, TypeScript and Style Dictionary outputs hold them, and a primitive can reference them. The helpers and steps are semantic tokens that list the tokens they reference.
- A step below 0 is now step 0 divided by `minTypeScale^n` at every width, so a small size never shrinks as the screen grows. Its size at `maxWidth` is `maxFontSize / minTypeScale^n` instead of utopia's `maxFontSize / maxTypeScale^n`. This changes the `clamp()` of negative steps when `minTypeScale` and `maxTypeScale` differ, and the fluid type checks use these sizes, once per step.
- A step label that gives a pow name, such as `narrow` or `pow-narrow`, is a key collision. A step cannot be labelled `pow`, the segment that holds the pow tokens.
- `relativeTo` is validated for every scale: `"container"` writes `cqi`, `"viewport"` writes `vi`, and the default `"viewport-width"` writes `vw`.
