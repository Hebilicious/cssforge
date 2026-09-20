---
"@hebilicious/cssforge": minor
---

Export `InvalidNameError` from the package entry.

Name validation throws `InvalidNameError`, and it was already reaching consumers
through `generateCSS`, `generateStyleDictionaryJSON`, `processColors`,
`processPrimitives`, `processSpacing` and `processTypography`, but the class was
not part of the package surface. The only way to recognize the failure was the
string comparison `error.name === "InvalidNameError"`, with no type safety and no
stable import path.

```ts
import { generateCSS, InvalidNameError } from "@hebilicious/cssforge";

try {
  generateCSS(config);
} catch (error) {
  if (error instanceof InvalidNameError) {
    // report the offending configuration path
  }
}
```

This is a new named export on the package entry, on both the npm and JSR
channels, so it is a minor release: `dist/mod.d.ts` now declares it and
`src/mod.ts` re-exports it, while no existing export, validation rule, error
message or generated output changed.
