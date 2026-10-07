---
"@hebilicious/cssforge": minor
---

Add a `motion` module for transition durations and easing curves.

- `motion.duration.<group>.value` and `motion.easing.<group>.value` emit `--motion-duration-<group>-<name>` and `--motion-easing-<group>-<name>`, referenced from primitives as `motion.duration.<group>.<name>` and `motion.easing.<group>.<name>`.
- A duration must be a non-negative number with `ms` or `s`, and an easing a CSS keyword, `cubic-bezier()` with x1 and x2 in [0, 1], `steps()` or `linear()`. Anything else fails generation with the token's path.
- A duration over 300ms warns (`motion-long-duration`), or over 500ms in a group with `settings.long: true` for modals and drawers. `ease-in` and ease-in shaped `cubic-bezier()` curves warn (`motion-ease-in`). Both go through `getDiagnostics` and the CLI's `cssforge: warning:` output.
- `goodCssEasings` exports the two recommended curves, `out` and `inOut`, to spread into an easing group. Nothing is added unless a config spreads it.
