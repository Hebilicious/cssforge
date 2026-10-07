# Source Schema Map

When README examples are not enough, use source types.

## Core config type

- `packages/cssforge/src/config.ts`
- `CSSForgeConfig` fields:
  - `colors: ColorConfig`
  - `typography: TypographyConfig`
  - `spacing: SpacingConfig`
  - `motion: MotionConfig`
  - `primitives: PrimitiveConfig`

## Module type sources

- Colors schema: `packages/cssforge/src/modules/colors.ts`
- Spacing schema: `packages/cssforge/src/modules/spacing.ts`
- Typography schema: `packages/cssforge/src/modules/typography.ts`
- Motion schema: `packages/cssforge/src/modules/motion.ts`
- Primitives schema: `packages/cssforge/src/modules/primitive.ts`

## Settings

A `settings` object sits beside each module's `value`, with `settings.color` grouping the
color output settings.

- `ColorSettings`, `ColorFormatConfig`, `HexFormatOutputs` and `RgbFormatOutputs` in
  `packages/cssforge/src/modules/colors.ts`, re-exported from `mod.ts`.
- `settings.color.formats` is keyed by format: `hex` produces `string`, `digits` and
  `number`, `rgb` produces `string` and `array`, and each format takes `alpha`.
- `settings.color.fallback` names the format whose `string` value becomes the CSS declaration,
  or `false` for none. Without it, the first format that produces a CSS value is used.
- A color's `settings` override the palette's per setting; `formats` merge per format and take
  `false` to remove one.
- Unknown keys, wrong shapes, and color format settings on a gradient or a theme are rejected
  with the configuration path. Spacing and primitives keep flat `PixelSettings`.
- A palette token carries `gamutMapped: true` when the color is outside sRGB.

## Fluid typography checks

- `FluidTypeScaleDefinition.settings.minLegibleSize` in
  `packages/cssforge/src/modules/typography.ts`: px number greater than 0, or `false`; default
  `12`. Read at `typography.fluid.<scale>.settings.minLegibleSize`; anything else is rejected.
- A step growing more than 2.5x (max/min size in px) throws (WCAG 1.4.4); exactly 2.5x passes.
- Warnings, as `Diagnostic` (`code`, `severity`, `path`, `message`) from `getDiagnostics`:
  `typography-below-legibility-floor` per step (path `typography_fluid.<scale>@<label>`) and
  `typography-static-scale` once per scale when every step changes less than 10%.

## Fluid typography output

- Every step has one canonical size in px at `minWidth` and `maxWidth`
  (`fluidTypeSteps` in `packages/cssforge/src/modules/typography.ts`). Step 0 and above are
  utopia-core's. Step `-n` is `step 0 / minTypeScale^n` at every width, so its wide end is
  `maxFontSize / minTypeScale^n`. The checks run once per step on it, and both representations
  are written from it. There is no option: every output holds both.
- clamp steps: `--typography_fluid-<scale>[-<prefix>]-<label>` at
  `typography_fluid.<scale>@<label>`, each the `clamp()` utopia-core's `calculateClamp` writes
  (identical to utopia for step 0 and above). Primitive tier.
- pow tokens under a `pow` segment: inputs and helpers
  `--typography_fluid-<scale>[-<prefix>]-pow-<name>` at `typography_fluid.<scale>.pow.<name>`
  for `min-width`, `max-width`, `min-font-size`, `max-font-size`, `min-type-scale`, `max-type-scale` (plain
  numbers, primitive tier), `progress`, `at-min`, `at-max`; steps
  `--typography_fluid-<scale>[-<prefix>]-pow-<label>` at `typography_fluid.<scale>.pow@<label>`.
  Helpers and steps carry `referencePaths` to the pow tokens they use and the semantic tier.
  Step `-n` is `calc(<pow step 0> / pow(min-type-scale, n))`.
- References use these paths from `variables`, for example
  `typography_fluid.body.pow@l` or `typography_fluid.body.pow.max-type-scale`; the prefix is not part
  of the path.
- A label that gives a pow key (`min-width`, `pow-min-width`, ...) fails the key collision check.
  The label `pow` is rejected, as it is the segment that holds the pow tokens.
- `value.relativeTo` maps `viewport-width` (default) to `vw`, `viewport` to `vi` and
  `container` to `cqi` in both representations; anything else is rejected.

## Motion

- `MotionConfig` and `MotionDurationSettings` in `packages/cssforge/src/modules/motion.ts`,
  re-exported from `mod.ts`: `motion.duration.<group>.value.<name>` and
  `motion.easing.<group>.value.<name>`, emitted as `--motion-duration-<group>-<name>` and
  `--motion-easing-<group>-<name>`, with resolve paths `motion.duration.<group>.<name>` and
  `motion.easing.<group>.<name>`.
- A duration is a non-negative number with `ms` or `s` (`0ms` passes, a bare `0` is rejected).
  An easing is `linear`, `ease`, `ease-in`, `ease-out`, `ease-in-out`, `step-start`,
  `step-end`, `cubic-bezier()` with x1 and x2 in [0, 1], `steps()` or `linear()`.
- `settings.long` (boolean, duration groups only; easing groups take no settings) raises the
  duration warning threshold from 300ms to 500ms for modals and drawers.
- Warnings: `motion-long-duration` per duration over the threshold and `motion-ease-in` per
  `ease-in` or ease-in shaped `cubic-bezier()` (slope at the start below 1 and at the end
  above 1), with the token path as `path`.
- `goodCssEasings` (`out`, `inOut`) is an exported preset to spread into an easing group's
  `value`; nothing is added unless spread.

## Derived colors

- `ColorMix` in `packages/cssforge/src/modules/colors.ts`, re-exported from `mod.ts`:
  `{ mix: { from, with, amount, in? } }`, accepted as a palette variant or a theme value.
- `from` / `with`: a dotted token path without spaces, parentheses or `#` (the `variables`
  path syntax, such as `"palette.brand.500"`) naming a color declared earlier, emitted as
  `var(--…)`; otherwise a CSS color colorjs.io parses, emitted as written.
- `amount`: 0-100, the percentage of `with`. `in`: only `"oklch"`, the default.
- Emitted as `color-mix(in oklch, <from>, <with> <amount>%)`. A palette mix with `formats`
  gets its sRGB values from a static OKLCH mix.

## Light/dark themes

- `ColorThemesSettings`, `LightDarkSettings` and `LightDarkColorScheme` in
  `packages/cssforge/src/modules/colors.ts`, re-exported from `mod.ts`.
- `colors.theme.settings.lightDark: { light, dark, colorScheme? }` names two themes, and needs
  the `theme: { value, settings }` form. `colorScheme: { light?, dark? }` takes selectors.
- Each paired color is emitted once at `:root` as `light-dark(<light>, <dark>)`, keyed
  `--theme-<color>-<variant>` (or `--<variant>` with `variantNameOnly`) at the path
  `theme.<color>.<variant>`, with `color-scheme: light dark` and one rule per `colorScheme`
  selector.
- Rejected: different color/variant sets, a `selector`/`atRule` on a paired theme,
  `variantNameOnly` differing between the pair, a paired color named like another theme.

## Exposed API entrypoint

- `packages/cssforge/src/mod.ts` exports `defineConfig`, `generateCSS`, `getDiagnostics`, `goodCssEasings`, the processing helpers,
  and the config and token types (`CSSForgeConfig`, `MotionConfig`, `MotionDurationSettings`, `ColorFormatConfig`, `ColorMix`, `HexFormatOutputs`,
  `RgbFormatOutputs`, `ColorSettings`, `ColorThemesSettings`, `LightDarkSettings`,
  `LightDarkColorScheme`, `ColorFormat`, `HexColorValues`, `RgbColorValues`,
  `TokenColorFormats`, `Diagnostic`, `DiagnosticCode`, `GenerateOptions`, `StyleDictionaryJSONOptions`).

## Guidance

If a user asks for a field not represented in docs or these types, do not fabricate it.
Offer the nearest supported pattern from README + types.
