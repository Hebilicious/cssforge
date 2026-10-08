# Source Schema Map

When README examples are not enough, use source types.

## Core config type

- `packages/cssforge/src/config.ts`
- `CSSForgeConfig` fields:
  - `colors: ColorConfig`
  - `typography: TypographyConfig`
  - `spacing: SpacingConfig`
  - `primitives: PrimitiveConfig`

## Module type sources

- Colors schema: `packages/cssforge/src/modules/colors.ts`
- Spacing schema: `packages/cssforge/src/modules/spacing.ts`
- Typography schema: `packages/cssforge/src/modules/typography.ts`
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

- `packages/cssforge/src/mod.ts` exports `defineConfig`, `generateCSS`, `getDiagnostics`, the processing helpers,
  and the config and token types (`CSSForgeConfig`, `ColorFormatConfig`, `ColorMix`, `HexFormatOutputs`,
  `RgbFormatOutputs`, `ColorSettings`, `ColorThemesSettings`, `LightDarkSettings`,
  `LightDarkColorScheme`, `ColorFormat`, `HexColorValues`, `RgbColorValues`,
  `TokenColorFormats`, `Diagnostic`, `DiagnosticCode`, `GenerateOptions`, `StyleDictionaryJSONOptions`).

## Guidance

If a user asks for a field not represented in docs or these types, do not fabricate it.
Offer the nearest supported pattern from README + types.
