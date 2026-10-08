---
"@hebilicious/cssforge": minor
---

Pair a light and a dark theme into one `light-dark()` token per color with `colors.theme.settings.lightDark: { light: "light", dark: "dark" }`, written in the `theme: { value, settings }` form.

- Each paired color is emitted once at `:root` as `--theme-<color>-<variant>: light-dark(<light>, <dark>);` (or `--<variant>` with `variantNameOnly`), at the token path `theme.<color>.<variant>`. `var()` references and `mix` values are kept.
- `:root` gets `color-scheme: light dark`, and the optional `colorScheme: { light, dark }` selectors each get a rule forcing that scheme.
- The paired themes must declare the same colors and variants, and the error names the missing paths. A `selector` or `atRule` on a paired theme, a `variantNameOnly` that differs between the pair, a paired color named like another theme, and unknown keys are rejected.
- `settings` is now a reserved theme name: `theme.settings` written beside named themes, without the `value` form, is rejected instead of being read as a theme named "settings". Rename such a theme.
- In the `theme: { value, settings }` form, keys other than `value` and `settings`, and settings other than `lightDark`, are rejected instead of ignored.
- Otherwise, themes and configs without `lightDark` are unchanged.
