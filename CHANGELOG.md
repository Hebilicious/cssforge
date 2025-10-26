# @hebilicious/cssforge

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
