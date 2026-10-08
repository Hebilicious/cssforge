---
"@hebilicious/cssforge": minor
---

Check fluid type scales for accessibility and report build warnings.

- A fluid type step whose maximum size is more than 2.5× its minimum now fails generation (WCAG 1.4.4 Resize Text). Exactly 2.5× passes. The error names the scale, the step, both sizes and the ratio.
- A scale whose every step changes by less than 10% across the viewport range warns once, because its `clamp()` values are effectively static.
- A step whose smaller size is below `settings.minLegibleSize` (default `12`, in px) warns. Set it to another px number, or `false` to turn the floor off.
- `getDiagnostics(config)` returns the build warnings as `{ code, severity, path, message }`, and `processTypography` returns them as `diagnostics`. The CLI prints each one to stderr as `cssforge: warning: <message>` and still writes the outputs with exit code `0`.
