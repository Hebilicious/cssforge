---
"@hebilicious/cssforge": patch
---

`pxToRem` converts every top-level `px` length in a value instead of parsing the whole string as one number. `"4px 8px"` now becomes `0.25rem 0.5rem` instead of `0.25rem`, and `"0 0 4px"` becomes `0 0 0.25rem` instead of `0rem`. Values inside CSS functions are left unchanged, so write a pill radius as `calc(infinity * 1px)`.
