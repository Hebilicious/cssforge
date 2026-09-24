# @hebilicious/cssforge

## 0.8.2

### Patch Changes

- 1ef8e09: Read project TypeScript in the config graph as ESM whenever Node would read it as CommonJS. The loader
  asks Node for the format it chose instead of repeating the package.json lookup and guessing from the
  source text.

  A CommonJS-authored `.ts` module inside a CommonJS package now loads as ESM, which matches the documented
  `export default` config shape.

## 0.8.1

### Patch Changes

- 444bfc5: Load `cssforge.config.ts` as ESM even when the project declares `"type": "commonjs"`. Node read the config
  as CommonJS there, switched module syntax detection off, and rejected `export default`, so neither the CLI
  nor the bundler plugin could load a config in those projects.

  The loader's message now also carries the failure it caught, which bundlers previously hid behind the
  config path.

## 0.8.0

### Minor Changes

- 21357d9: Add `loadConfig`, the loader the CLI and the bundler plugin share. It returns the config together with
  the absolute paths of every local module the config loaded, and it re-evaluates the whole graph on each
  call.

  `cssforge --watch` now watches those files instead of only the config path, so editing a token module
  the config imports regenerates the output. Previously a second load also kept the values it cached for
  imported token modules.

  Watch mode is also harder to disturb: a failed rebuild keeps watching the file that has to be repaired,
  rebuilds wait for an in-place write to settle instead of reading a truncated module, and rebuilds run
  one at a time so a change during a build cannot be overwritten by the older build.

## 0.7.0

### Minor Changes

- c2d2a9f: Export `InvalidNameError` from the package entry.

  Name validation throws `InvalidNameError`, and it was already reaching consumers
  through `generateCSS`, `generateStyleDictionaryJSON`, `processColors`,
  `processPrimitives`, `processSpacing` and `processTypography`, but the class was
  not part of the package surface. The only way to recognize the failure was the
  string comparison `error.name === "InvalidNameError"`, with no type safety and no
  stable import path.

  ```ts
  import { generateCSS, InvalidNameError } from "@hebilicious/cssforge";

  try {
    generateCSS(config);
  } catch (error) {
    if (error instanceof InvalidNameError) {
      // report the offending configuration path
    }
  }
  ```

  This is a new named export on the package entry, on both the npm and JSR
  channels, so it is a minor release: `dist/mod.d.ts` now declares it and
  `src/mod.ts` re-exports it, while no existing export, validation rule, error
  message or generated output changed.

### Patch Changes

- 43005ea: Report the real release version from the CLI. The command metadata is now derived from
  `package.json`, the single source of truth, instead of a hard-coded string, so `--version`
  matches the installed package on both the npm and JSR channels. A new release consistency
  check fails when `package.json`, `jsr.json`, the generated `src/version.ts`, or the matching
  `CHANGELOG.md` entry disagree.
- da4827b: Document theme class placement for descendant-scoped palettes in the Colors example.

  The `another` palette is now declared with `settings: { selector: ":root.Another" }` and the
  README documents that the theme class belongs on the root element (`<html class="Another">`).
  Custom property references are substituted when the alias is computed, before inheritance, so
  a palette token declared on a descendant cannot resolve a theme alias that is computed on
  `:root`.

- 464a339: Reject token names that cannot produce valid CSS custom property names.

  `validateName()` accepted whitespace and CSS delimiter characters, and module
  code interpolated those names directly into declaration keys. A configuration
  such as:

  ```ts
  primitives: {
    "card button": {
      value: { default: { value: { gap: "1rem" } } },
    },
  }
  ```

  previously emitted `--card button-default-gap: 1rem;`, which is not a valid
  custom property declaration. Generation now fails with a configuration-path
  error instead:

  ```text
  Invalid name: card button at configuration path "primitives.card button".
  Names must be valid CSS identifier segments: letters, digits, hyphens,
  underscores and non-ASCII characters only.
  ```

  Compatibility implications:

  - Breaking only for configurations that emitted invalid CSS. A name that already
    produced valid CSS keeps working unchanged.
  - Numeric keys (`palette.coral.50`), hyphens (`2xl`, `background-color`),
    underscores (`sm_2`) and non-ASCII names (`größe`) are still accepted, because
    segments are joined with hyphens and CSS identifiers allow those characters.
    A segment may also begin with a digit or a hyphen, since the module prefix
    starts the identifier.
  - Rejected token key segments are whitespace and the ASCII characters
    `` !"#$%&'()*+,./:;<=>?@[\]^`{|}~ ``. Accepted ASCII is limited to letters,
    digits, hyphens and underscores; every code point from U+0080 upward is
    accepted. A backslash escape is rejected even though raw CSS accepts it,
    because the name would not survive round-tripping through configuration paths,
    generated keys and `variables` lookups.
  - This applies to every module that shares name validation: palette colors,
    gradient and theme names, spacing scales, prefixes and tokens, typography
    scales, prefixes and weights, and primitive names, variants and property names.
  - Variable alias keys (`variables: { "my color": "..." }`) and typography
    `settings.customLabel` values are validated too, because they are interpolated
    into emitted `var(--...)` references and generated keys. These two fields are
    display names rather than token keys, so only the CSS character rule applies:
    an alias named `spacing` or a label named `value` keeps working, as it did
    before. Aliases written as `--name` are accepted, and the leading `--` is
    ignored during validation.
  - A `customLabel` entry may resolve through the prototype chain because
    generation reads it with bracket access. The label that is actually emitted is
    validated, so an inherited mapping cannot leak an invalid key.
  - Palette colors and themes log ordinary per-token failures and continue. Name
    errors are raised as an `InvalidNameError` and are re-thrown through those
    handlers, so a configuration mistake now fails loudly instead of being logged
    and silently dropped from the output.

  Escaping was rejected as an alternative policy: it cannot preserve a stable
  one-to-one mapping between configuration paths, generated keys and `variables`
  lookups, and silently normalising distinct names into one key is not acceptable.

  Related to #24 (hyphenated alias support); this change does not depend on it.

- 5669e7a: Reject unsupported output modes with an error naming the accepted alternatives instead of silently producing no output, and validate the mode before any output file is written or watch mode starts.
- 188c6b8: Reject configurations whose distinct token paths generate the same CSS custom
  property name.

  Generated names are built by joining configuration path segments with hyphens,
  so two different paths can produce one name. A configuration such as
  `primitives: { "a-b": { value: { c: { value: { x: "1rem" } } } }, a: { value: { "b-c": { value: { x: "2rem" } } } } }`
  previously emitted `--a-b-c-x` twice with different values, and the CSS, JSON
  and TypeScript outputs disagreed about which value the token held.

  Generation now fails with a diagnostic that names both contributing
  configuration paths, for example:

  ```
  Token key collision: "primitives.a-b.c.x" and "primitives.a.b-c.x" both generate "--a-b-c-x". Rename one of the configuration paths.
  ```

  Compatibility: configurations that silently collided now fail instead of
  producing ambiguous output. Configurations whose generated names are unique are
  unaffected, including `variantNameOnly` themes that deliberately reuse a name
  such as `--primary` across different selectors or at-rules, because tokens in
  different scopes do not conflict.

- 603aaea: Resolve aliases that contain a hyphen and keep `var()` fallbacks intact.

  Values such as `var(--surface-muted)`, `var(--surface-muted, var(--bg))`, and
  gradients that reference several aliases previously failed to resolve, because
  a reference was only recognized when the closing parenthesis followed the name
  immediately. References are now parsed as CSS `var()` functions, so hyphenated
  names, nested fallbacks, whitespace, and quoted strings behave correctly.
  Unmapped custom properties and malformed `var(` text still pass through
  unchanged.

- c3ae80d: Fix CLI output paths on Windows: resolve each output file's parent directory with the platform-aware `dirname` instead of a forward-slash-only expression, so Windows paths create the containing directory rather than a directory at the output file path.

## 0.6.0

### Minor Changes

- 143e495: Publish to npm as the primary channel and ship a `cssforge` executable.

  - Install with `npm install --save-dev @hebilicious/cssforge` (or `pnpm add -D`), then use
    `"cssforge": "cssforge"` in `package.json` scripts. Consumers no longer need to reach into
    `node_modules/@hebilicious/cssforge/src` with `tsx`.
  - Import the package by name in configuration files:
    `import { defineConfig } from "@hebilicious/cssforge";`
  - Node 24 or newer is required. `cssforge.config.ts` loads through the native TypeScript
    support of that runtime.
  - The CLI now runs when the entry point is reached through a package-manager symlink or a
    `jsr:` URL. Both cases previously exited silently without doing anything.
  - JSR stays available as the secondary channel for Deno, published after npm and verified
    after publication.

## 0.5.0

### Minor Changes

- 438b9a1: Add Style Dictionary token JSON output, with resolved values by default and an optional CSS-variable mode for usage matching.

## 0.4.1

### Patch Changes

- 8b3f5ab: fix nesting for selector and atRules

## 0.4.0

### Minor Changes

- ab752be: # Introduce variantNameOnly feature for themes.

  When working with themes, you can choose to only include the variant name in the CSS
  variable name by setting `variantNameOnly: true` in the color definition settings. This
  is usually used in combination with `condition` to conditionnally apply themes.

  - Default: `--theme-${themeName}-${colorName}-${variantName}`
  - VariantOnly Name: `--${variantName}`
  - Path : `theme.${themeName}.${colorName}.${variantName}`

## 0.3.0

### Minor Changes

- 41bff15: # Conditions and variables access

  Add the posibility to add conditions for colors modules. This is a breaking change for
  the configuration format.

## 0.2.1

### Patch Changes

- 1df1f2d: fix: update reserved keywords

## 0.2.0

### Minor Changes

- 3a6582e: feat: add fluid spacing

## 0.1.1

### Patch Changes

- 4e448fd: chore: update module documentation

## 0.1.0

### Minor Changes

- a202035: Initial Release
