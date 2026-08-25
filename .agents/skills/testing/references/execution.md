# Test execution

Moon owns repository task commands, inputs, dependencies, caching, and project selection. Inspect the relevant `moon.yml`; do not reconstruct commands from a copied tool manual.

## Narrow verification

Use the smallest selection that proves the changed promise:

- `packages/cssforge/tests/` owns retained library behavior tests.
- `packages/cssforge/moon.yml` owns package tests, type checking, builds, and publication dry-runs.
- Each `example/*/moon.yml` owns its generation, build, and Playwright tasks.

Focus the underlying runner only when Moon's task contract still owns the environment and dependencies. If a focused invocation bypasses task setup, run the owning Moon target instead.

## Input closure

When a Moon test task changes, ensure its inputs cover:

- the production paths exercised by the task;
- retained test files and fixtures;
- runner configuration;
- relevant shared configuration outside the project directory.

Do not add unrelated repository paths merely to force cache invalidation. Validate affected selection with representative relevant and irrelevant changed paths when task inputs are modified.

## Lifecycle

- During development, run the focused red/green selection repeatedly.
- Before handoff, run the focused selection plus the nearest owning typecheck or build when the public contract can be affected.
- Use example Playwright tasks only for browser or framework-consumption promises.
- Use `cssforge:jsr-dry-run` only for publication-shape promises or release verification.

Missing, skipped, flaky, or ambiguous evidence is not green. Put disposable logs, generated comparisons, and probes under `.artifacts/`.
