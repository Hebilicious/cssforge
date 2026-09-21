---
"@hebilicious/cssforge": patch
---

Document theme class placement for descendant-scoped palettes in the Colors example.

The `another` palette is now declared with `settings: { selector: ":root.Another" }` and the
README documents that the theme class belongs on the root element (`<html class="Another">`).
Custom property references are substituted when the alias is computed, before inheritance, so
a palette token declared on a descendant cannot resolve a theme alias that is computed on
`:root`.
