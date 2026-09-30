---
"@hebilicious/cssforge": patch
---

Reject unknown, misplaced, and wrongly shaped settings in every module, not just in colors.

A setting no schema accepts generated nothing quietly: a misspelled key was ignored, a
`settings` on a primitive group or a gradient variant did nothing, and a `settings` that was
not an object silently disabled the px-to-rem conversion, so `8px` was emitted where `0.5rem`
was meant. Spacing, typography, primitives, gradients and themes now report the configuration
path, the unknown key, and the keys the level accepts. The `settings` fields no module reads
are gone from `Primitive` and the gradient variant type.
