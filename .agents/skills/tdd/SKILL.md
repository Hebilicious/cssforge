---
name: tdd
description: Develop CSS Forge features and bug fixes test-first in small red-green slices through public interfaces.
---

# Test-driven development

Work in vertical red-to-green slices. Follow `$testing` for evidence placement, seam selection, snapshots, Moon ownership, and verification lifecycle.

## Choose the seam

Select the cheapest public interface that proves the requested behavior. Most generator behavior belongs in a focused test under `packages/cssforge/tests/` using exports from the package surface. CLI wiring belongs at the CLI seam; framework consumption belongs in the owning example project.

When the public interface itself is in question, use `$codebase-design` before fixing the test shape.

## Good tests

A good test:

- describes behavior a caller relies on;
- uses the public interface;
- has independently known expected output;
- survives internal refactoring;
- fails clearly when its promise is broken.

Read [tests.md](tests.md) for CSS Forge examples and [mocking.md](mocking.md) when a dependency boundary is involved.

## Loop

1. State one promise and its seam.
2. Write the smallest retained test for that promise.
3. Run the focused selection and confirm it fails for the intended reason.
4. Implement only enough behavior to satisfy that test.
5. Run the identical selection and confirm it passes.
6. Continue with the next independently valuable slice.
7. Refactor only while the retained suite stays green.

If the seam or expected observation is still uncertain, use a disposable probe first. Deliberately retain or delete every probe; exploratory tests do not accumulate by default.

Avoid horizontal batches of speculative tests, tests of private helpers, expected values recomputed with the implementation's algorithm, and snapshots accepted without reviewing the contract they encode.
