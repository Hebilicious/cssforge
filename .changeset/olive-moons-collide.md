---
"@hebilicious/cssforge": patch
---

Reject configurations whose distinct token paths generate the same CSS custom
property name.

Generated names are built by joining configuration path segments with hyphens,
so two different paths can produce one name. A configuration such as
`primitives: { "a-b": { value: { c: { value: { x: "1rem" } } } }, a: { value: { "b-c": { value: { x: "2rem" } } } } }`
previously emitted `--a-b-c-x` twice with different values, and the CSS, JSON
and TypeScript outputs disagreed about which value the token held.

Generation now fails with a diagnostic that names both contributing
configuration paths, for example:

```
Token key collision: "primitives.a-b.c.x" and "primitives.a.b-c.x" both generate "--a-b-c-x". Rename one of the configuration paths.
```

Compatibility: configurations that silently collided now fail instead of
producing ambiguous output. Configurations whose generated names are unique are
unaffected, including `variantNameOnly` themes that deliberately reuse a name
such as `--primary` across different selectors or at-rules, because tokens in
different scopes do not conflict.
