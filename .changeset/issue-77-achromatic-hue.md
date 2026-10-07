---
"@hebilicious/cssforge": patch
---

Fix achromatic color hue representation in oklch() values. When a color has zero chroma (e.g., white, black, gray), emit the hue as `none` instead of a numeric value. This correctly represents that achromatic colors have no meaningful hue component.

- White now emits as `oklch(100% 0 none)` instead of `oklch(100% 0 0)`
- Black now emits as `oklch(0% 0 none)` instead of `oklch(0% 0 0)`
- Any color with chroma rounding to 0 at 5-decimal precision emits hue as `none`
- sRGB/hex byte conversions retain their NaN→0 mapping (unchanged)
