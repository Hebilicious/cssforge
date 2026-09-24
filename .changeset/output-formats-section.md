---
"@hebilicious/cssforge": patch
---

Document the generated output formats and how to consume them outside CSS.

A new README section lists the CSS, TypeScript, JSON, and Style Dictionary outputs with
their modes, flags, and default paths, and documents the `key` / `value` / `variable` shape
of a generated token. It shows importing a token value as a color string in TypeScript, that
palette, spacing, and typography tokens hold final values while theme, gradient, and
primitive tokens keep `var(--token)`, and that the JSON output carries the same tree for
non-TypeScript consumers. The docs site gains the matching `guide/output-formats` page.
