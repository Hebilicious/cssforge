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

## Exposed API entrypoint

- `packages/cssforge/src/mod.ts` exports `defineConfig`, `generateCSS`, the processing helpers,
  and the config and token types (`CSSForgeConfig`, `ColorFormatConfig`, `HexFormatOutputs`,
  `RgbFormatOutputs`, `ColorSettings`, `ColorFormat`, `HexColorValues`, `RgbColorValues`,
  `TokenColorFormats`, `GenerateOptions`, `StyleDictionaryJSONOptions`).

## Guidance

If a user asks for a field not represented in docs or these types, do not fabricate it.
Offer the nearest supported pattern from README + types.
