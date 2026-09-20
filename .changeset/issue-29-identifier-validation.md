---
"@hebilicious/cssforge": patch
---

Reject token names that cannot produce valid CSS custom property names.

`validateName()` accepted whitespace and CSS delimiter characters, and module
code interpolated those names directly into declaration keys. A configuration
such as:

```ts
primitives: {
  "card button": {
    value: { default: { value: { gap: "1rem" } } },
  },
}
```

previously emitted `--card button-default-gap: 1rem;`, which is not a valid
custom property declaration. Generation now fails with a configuration-path
error instead:

```text
Invalid name: card button at configuration path "primitives.card button".
Names must be valid CSS identifier segments: letters, digits, hyphens,
underscores and non-ASCII characters only.
```

Compatibility implications:

- Breaking for configurations that relied on the broken behaviour. A name that
  already produced valid CSS keeps working unchanged.
- Numeric keys (`palette.coral.50`), hyphens (`2xl`, `background-color`),
  underscores (`sm_2`) and non-ASCII names (`größe`) are still accepted, because
  segments are joined with hyphens and CSS identifiers allow those characters.
- Rejected segments are whitespace and the ASCII characters
  ``!"#$%&'()*+,./:;<=>?@[\]^`{|}~``. Accepted ASCII is limited to letters,
  digits, hyphens and underscores; every code point from U+0080 upward is
  accepted.
- This applies to every module that shares name validation: palette colors,
  gradient and theme names, spacing scales, prefixes and tokens, typography
  scales, prefixes, weights and custom labels, and primitive names, variants and
  property names.
- Variable alias keys (`variables: { "my color": "..." }`) are validated too,
  because they are interpolated into emitted `var(--...)` references. Aliases
  written as `--name` are accepted, and the leading `--` is ignored during
  validation.
- Typography `settings.customLabel` values are validated, because they are
  interpolated into generated keys.
- Palette colors and themes log ordinary per-token failures and continue. Name
  errors are raised as an `InvalidNameError` and are re-thrown through those
  handlers, so a configuration mistake now fails loudly instead of being logged
  and silently dropped from the output.

Escaping was rejected as an alternative policy: it cannot preserve a stable
one-to-one mapping between configuration paths, generated keys and `variables`
lookups, and silently normalising distinct names into one key is not acceptable.

Related to #24 (hyphenated alias support); this change does not depend on it.
