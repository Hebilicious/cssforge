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

- Breaking only for configurations that emitted invalid CSS. A name that already
  produced valid CSS keeps working unchanged.
- Numeric keys (`palette.coral.50`), hyphens (`2xl`, `background-color`),
  underscores (`sm_2`) and non-ASCII names (`größe`) are still accepted, because
  segments are joined with hyphens and CSS identifiers allow those characters.
  A segment may also begin with a digit or a hyphen, since the module prefix
  starts the identifier.
- Rejected token key segments are whitespace and the ASCII characters
  ``!"#$%&'()*+,./:;<=>?@[\]^`{|}~``. Accepted ASCII is limited to letters,
  digits, hyphens and underscores; every code point from U+0080 upward is
  accepted. A backslash escape is rejected even though raw CSS accepts it,
  because the name would not survive round-tripping through configuration paths,
  generated keys and `variables` lookups.
- This applies to every module that shares name validation: palette colors,
  gradient and theme names, spacing scales, prefixes and tokens, typography
  scales, prefixes and weights, and primitive names, variants and property names.
- Variable alias keys (`variables: { "my color": "..." }`) and typography
  `settings.customLabel` values are validated too, because they are interpolated
  into emitted `var(--...)` references and generated keys. These two fields are
  display names rather than token keys, so only the CSS character rule applies:
  an alias named `spacing` or a label named `value` keeps working, as it did
  before. Aliases written as `--name` are accepted, and the leading `--` is
  ignored during validation.
- A `customLabel` entry may resolve through the prototype chain because
  generation reads it with bracket access. The label that is actually emitted is
  validated, so an inherited mapping cannot leak an invalid key.
- Palette colors and themes log ordinary per-token failures and continue. Name
  errors are raised as an `InvalidNameError` and are re-thrown through those
  handlers, so a configuration mistake now fails loudly instead of being logged
  and silently dropped from the output.

Escaping was rejected as an alternative policy: it cannot preserve a stable
one-to-one mapping between configuration paths, generated keys and `variables`
lookups, and silently normalising distinct names into one key is not acceptable.

Related to #24 (hyphenated alias support); this change does not depend on it.
