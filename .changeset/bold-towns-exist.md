---
"@hebilicious/cssforge": minor
---

# Introduce variantNameOnly feature for themes.

When working with themes, you can choose to only include the variant name in the CSS
variable name by setting `variantNameOnly: true` in the color definition settings. This is
usually used in combination with `condition` to conditionnally apply themes.

- Default: `--theme-${themeName}-${colorName}-${variantName}`
- VariantOnly Name: `--${variantName}`
- Path : `theme.${themeName}.${colorName}.${variantName}`
