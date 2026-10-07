---
"@hebilicious/cssforge": patch
---

Fix pxToRem conversion to handle complex values with multiple px entries and CSS functions. Previously, values like "4px 8px" or "calc(100% - 16px)" were incorrectly converted. Now:

- Multiple whitespace-separated px values are converted individually: "4px 8px" → "0.25rem 0.5rem"
- Shorthand notation works: "0 0 4px" → "0 0 0.25rem", "1px solid red" → "0.0625rem solid red"
- px values inside functions are converted: "calc(100% - 16px)" → "calc(100% - 1rem)", "var(--x, 4px)" → "var(--x, 0.25rem)"
- Negative values are supported: "-8px" → "-0.5rem"
- Use `calc(infinity * 1px)` to write an infinitely-large pill radius that remains unchanged
