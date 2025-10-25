# Css Forge Library

This is a library for generating CSS variables from design tokens. This library uses Deno
and TypeScript.

## Creating new features and modules

Make sure to follow the established conventions for modules in `src/modules`. Make sure to
add tests following the pattern in the `tests` folder.

## Dependencies

Ask permissions before adding new dependencies. Always prefer using features from the
standard library or writing code from first principles.

## Updating the README.md

To update the README, use the `deno task readme:update` command. There is a special syntax
in the README that generates the codeblocks. For a comment like this:

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
