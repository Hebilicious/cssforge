---
"@hebilicious/cssforge": patch
---

Resolve aliases that contain a hyphen and keep `var()` fallbacks intact.

Values such as `var(--surface-muted)`, `var(--surface-muted, var(--bg))`, and
gradients that reference several aliases previously failed to resolve, because
a reference was only recognized when the closing parenthesis followed the name
immediately. References are now parsed as CSS `var()` functions, so hyphenated
names, nested fallbacks, whitespace, and quoted strings behave correctly.
Unmapped custom properties and malformed `var(` text still pass through
unchanged.
