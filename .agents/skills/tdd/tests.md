# CSS Forge test examples

Prefer semantic behavior through the public package surface:

```ts
import { generateCSS } from "../src/mod.ts";

test("generates a custom property for a primitive token", () => {
  const config = {
    primitives: {
      button: {
        value: {
          default: {
            value: { radius: "2px" },
            settings: { pxToRem: false },
          },
        },
      },
    },
  };

  expect(generateCSS(config)).toContain("--button-default-radius: 2px;");
});
```

The literal expectation is independent and communicates the promise. Add the smallest complete configuration required by the current public types.

Avoid assertions that merely mirror implementation steps:

```ts
// Avoid: internal collaboration, not caller-visible behavior.
expect(processPrimitives).toHaveBeenCalledTimes(1);

// Avoid: expected output produced with the same transformation under test.
const expected = Object.entries(input).map(toVariable).join("\n");
expect(generateCSS(input)).toBe(expected);
```

Snapshots are appropriate when the complete generated artifact is intentionally reviewed as a contract. Prefer focused assertions when only one token rule is at stake.
