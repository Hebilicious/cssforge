---
"@hebilicious/cssforge": minor
---

Add scope diagnostics for token references that are not available where the alias is computed

CSS Forge now warns when a `var()` reference only resolves through a declaration emitted into a
narrower scope than the declaration computing it: a `:root` alias that depends on a token emitted
only under a selector or an at-rule, for example.

- `getScopeDiagnostics(config)` returns the diagnostics as structured data, naming both
  configuration paths, both generated property names, and the emitted selector and at-rule of each
  declaration.
- The CLI prints them as `cssforge: warning: ...` and keeps generating. `--strict` fails the build
  before writing outputs instead.
- `diagnostics.suppress` in the configuration silences specific token paths, or `"*"` for all of
  them.

Warnings are conservative: references to custom properties CSS Forge does not generate, references
inside a `var()` fallback, declarations that share the consumer's scope, and undecidable
relationships between two selectors or two at-rules stay silent. Existing generated output is
unchanged.

`ResolvedToken.scope` is generator bookkeeping and stays non-enumerable, but its declared type is
now the wrapper chain (`TokenScope`) instead of a pre-joined string. No runtime token shape,
generated output, or existing export changes.
