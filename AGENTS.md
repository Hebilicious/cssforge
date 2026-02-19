# Css Forge Library

This is a library for generating CSS variables from design tokens. The repository is a
Node.js + pnpm workspace using moon v2 and proto.

## Creating new features and modules

Follow the established module conventions in `packages/cssforge/src/modules` and add tests
following the pattern in `packages/cssforge/tests`.

## Dependencies

Ask permissions before adding new dependencies. Always prefer using features from the
standard library or writing code from first principles.

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
