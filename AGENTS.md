# Css Forge Library

This is a library for generating CSS variables from design tokens. The repository is a
Node.js + pnpm workspace using moon v2 and proto.

## Creating new features and modules

Follow the established module conventions in `packages/cssforge/src/modules` and add tests
following the pattern in `packages/cssforge/tests`.

## Dependencies

Ask permissions before adding new dependencies. Always prefer using features from the
standard library or writing code from first principles.

## Engineering workflow

- For implementation or pull-request work, do not work directly on `main`. Use a dedicated
  branch and worktree. Read-only inspection may remain in the current checkout.
- Run `git status` before editing and review the complete diff afterward. Preserve unrelated
  changes and commit only when explicitly requested.
- Define repository operations in `moon.yml` or `.moon/tasks/**/*.yml`, not `package.json`
  scripts. Run existing operations through their Moon targets; use pnpm directly only for
  dependency management.
- During implementation, run the narrowest relevant Moon targets.
- Any task that adds, changes, moves, deletes, runs, reviews, or diagnoses tests or test
  evidence uses `$testing`.
- Before handing off implementation, test, build, or tooling changes, use `$code-review`.
  Documentation and agent-instruction changes require it only when explicitly requested.

## Library architecture

- Keep token transformation, validation, normalization, and generation in framework-neutral
  TypeScript that runs without browser or framework globals.
- Keep one canonical implementation for each token rule, reference resolver, formatter, and
  output transformation. CLI code and framework examples should call the shared implementation
  instead of reproducing it.
- Treat newly introduced external configuration and file data as `unknown` at runtime and
  validate it before creating typed internal state.
- Write new core package, test, and tooling code in TypeScript. Avoid `any` and `@ts-ignore`;
  framework examples may retain configuration formats required by their ecosystems.

## Updating the README.md

To update the README, run `moon run cssforge:readme-update` from the workspace root.
There is a special syntax in the README that generates codeblocks. For a comment like
this:

<comment>
<!-- md:generate defineConfig
export default defineConfig({
  spacing: {
    fluid: {
      base: {
        value: {
          minSize: 4,
          maxSize: 24,
          minWidth: 320,
          maxWidth: 1280,
          negativeSteps: [0],
          positiveSteps: [3],
          prefix: "hi",
        },
      },
    },
  },
});
-->
</comment>

It will generate a codeblock below. Therefore, these comments are the source of truth and
should never be deleted. But they should be updated if the source code changes.
