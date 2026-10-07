# Good CSS to CSS Forge Mapping

This reference maps good-css foundations and motion rules to CSS Forge configuration.

## Color System

### OKLCH with None Hue for Grays

Good CSS rule: Write grays, white and black with `none` as the hue to prevent unintended hue shifts when mixing.

CSS Forge implementation: Automatic. The palette converts all colors to OKLCH, and set a color like:

```typescript
colors: {
  palette: {
    value: {
      neutral: {
        value: {
          white: "oklch(100% 0 none)",
          gray: "oklch(50% 0 none)",
          black: "oklch(0% 0 none)",
        },
      },
    },
  },
}
```

When you pass a hex or other format for a gray, CSS Forge converts it to OKLCH with `none` for the hue automatically.

### Derived Colors with color-mix()

Good CSS rule: Derive hover, tint, and transparent variants from a base color with `color-mix(in oklch, ...)` instead of hand-tuning near-duplicates.

CSS Forge implementation: Use the `mix` feature on palette or theme colors:

```typescript
colors: {
  palette: {
    value: {
      accent: {
        base: "oklch(55% 0.2 264)",
        hover: { mix: { from: "palette.accent.base", with: "black", amount: 15 } },
        subtle: { mix: { from: "palette.accent.base", with: "transparent", amount: 88 } },
      },
    },
  },
}
```

The generated CSS uses `color-mix(in oklch, ...)` and the browser evaluates it at paint time.

### One Token per Color with light-dark()

Good CSS rule: Use `light-dark()` to emit one set of color tokens that adapt to the device's color scheme.

CSS Forge implementation: Use `theme.settings.lightDark`:

```typescript
colors: {
  palette: {
    value: {
      neutral: { white: "#ffffff", ink: "#1a1a1a" },
    },
  },
  theme: {
    value: {
      light: {
        value: {
          background: {
            value: { primary: "var(--white)" },
            variables: { white: "palette.neutral.white" },
          },
        },
      },
      dark: {
        value: {
          background: {
            value: { primary: "var(--ink)" },
            variables: { ink: "palette.neutral.ink" },
          },
        },
      },
    },
    settings: {
      lightDark: {
        light: "light",
        dark: "dark",
        colorScheme: { light: '[data-theme="light"]', dark: '[data-theme="dark"]' },
      },
    },
  },
}
```

Generated CSS:
```css
:root {
  color-scheme: light dark;
  --theme-background-primary: light-dark(var(--palette-neutral-white), var(--palette-neutral-ink));
}
[data-theme="light"] { color-scheme: light; }
[data-theme="dark"] { color-scheme: dark; }
```

**Manual step:** Add `<meta name="color-scheme" content="light dark">` to the page `<head>`.

## Typography

### Fluid Sizes with clamp()

Good CSS rule: Use `clamp(min, preferred, max)` for font sizes that grow with the screen. Keep the maximum at or below 2.5 times the minimum to ensure WCAG 1.4.4 compliance at 500% zoom.

CSS Forge implementation: Fluid typography generates `clamp()` values and checks the 2.5× limit:

```typescript
typography: {
  fluid: {
    base: {
      value: {
        minWidth: 320,
        minFontSize: 16,
        minTypeScale: 1.2,
        maxWidth: 1280,
        maxFontSize: 18,
        maxTypeScale: 1.25,
        positiveSteps: 3,
        negativeSteps: 1,
      },
    },
  },
}
```

Generated CSS:
```css
--typography_fluid-base-xl: clamp(1.28rem, 1.216rem + 0.32vw, 1.44rem);
```

### Fluid Typography Checks

CSS Forge performs automatic validation:

- **Error: more than 2.5× growth.** A step whose max is more than 2.5× its min fails the build. Lower `maxFontSize` or reduce `positiveSteps`.
- **Warning: static scale.** When every step changes by less than 10% across the viewport, its `clamp()` is effectively static.
- **Warning: below legibility floor.** When a step's minimum size is under `settings.minLegibleSize` (default 12px), a warning is issued:

```typescript
typography: {
  fluid: {
    caption: {
      value: {
        minWidth: 320,
        minFontSize: 11,
        minTypeScale: 1.2,
        maxWidth: 1280,
        maxFontSize: 13,
        maxTypeScale: 1.25,
        positiveSteps: 1,
        negativeSteps: 0,
      },
      settings: { minLegibleSize: 10 },
    },
  },
}
```

Set `minLegibleSize: false` to turn the floor off.

### Fluid Typography with pow()

Good CSS rule: Define a scale once and derive every step from six numbers using `pow()`, tunable live in DevTools without recompiling.

CSS Forge implementation: Use `settings.output: "pow"` to emit the scale inputs instead of computed `clamp()` values:

```typescript
typography: {
  fluid: {
    body: {
      value: {
        minWidth: 320,
        minFontSize: 18,
        minTypeScale: 1.2,
        maxWidth: 1240,
        maxFontSize: 20,
        maxTypeScale: 1.25,
        positiveSteps: 2,
        negativeSteps: 1,
        relativeTo: "container",
      },
      settings: { output: "pow" },
    },
  },
}
```

Generated CSS:
```css
--typography_fluid-body-narrow: 20;
--typography_fluid-body-wide: 77.5;
--typography_fluid-body-size-narrow: 1.125;
--typography_fluid-body-size-wide: 1.25;
--typography_fluid-body-ratio-narrow: 1.2;
--typography_fluid-body-ratio-wide: 1.25;
--typography_fluid-body-fluid: clamp(0rem, (100cqi - var(--typography_fluid-body-narrow) * 1rem) / (var(--typography_fluid-body-wide) - var(--typography_fluid-body-narrow)), 1rem);
--typography_fluid-body-xl: calc(var(--typography_fluid-body-at-narrow) * pow(var(--typography_fluid-body-ratio-narrow), 2) + var(--typography_fluid-body-at-wide) * pow(var(--typography_fluid-body-ratio-wide), 2));
```

Set `relativeTo: "container"` to size the scale by its container (`cqi`) instead of the viewport. It works in both `clamp` and `pow` output.

## Spacing

### Pixel to Rem Conversion

Good CSS rule: Keep spacing values in units that follow the reader's font size setting.

CSS Forge implementation: By default, all top-level `px` lengths are converted to `rem`. Values inside CSS functions like `calc()` or `var()` are left alone:

```typescript
spacing: {
  custom: {
    size: {
      value: {
        1: "4px",    // becomes 0.25rem
        2: "8px",    // becomes 0.5rem
        pill: "calc(infinity * 1px)", // left as-is, for border-radius
      },
    },
  },
}
```

Set `settings: { pxToRem: false }` to keep pixels as-is.

### Nested Rounded Corners

Good CSS rule: Derive the outer radius of a padded rounded element from the inner radius using `calc()` to avoid reaching zero.

CSS Forge implementation: Use primitives with variables referencing spacing tokens:

```typescript
spacing: {
  custom: {
    size: { value: { pad: "8px", radius: "12px" } },
  },
},
primitives: {
  card: {
    value: {
      outer: {
        value: "calc(var(--r) + var(--pad))",
        variables: {
          r: "spacing.custom.size.radius",
          pad: "spacing.custom.size.pad",
        },
      },
    },
  },
}
```

Generated CSS:
```css
--primitives-card-outer: calc(var(--spacing-size-radius) + var(--spacing-size-pad));
```

## Motion

### Motion Tokens

Good CSS rule: Define easing curves and durations once, then reference them from transitions. Never use `ease-in` on UI.

CSS Forge implementation: Define motion duration and easing groups. Use the exported `goodCssEasings` for the recommended curves:

```typescript
import { goodCssEasings } from "@hebilicious/cssforge";

export default defineConfig({
  motion: {
    duration: {
      ui: {
        value: {
          press: "100ms",
          tooltip: "150ms",
          dropdown: "200ms",
        },
      },
      overlay: {
        value: { modal: "400ms" },
        settings: { long: true },
      },
    },
    easing: {
      ui: { value: { ...goodCssEasings } },
    },
  },
});
```

Generated CSS:
```css
--motion-duration-ui-press: 100ms;
--motion-duration-ui-tooltip: 150ms;
--motion-easing-ui-out: cubic-bezier(0.23, 1, 0.32, 1);
--motion-easing-ui-inOut: cubic-bezier(0.77, 0, 0.175, 1);
```

### Motion Duration Limits

Good CSS rule: Keep UI transitions at 300ms or less. Modals and drawers may take 200–500ms.

CSS Forge implementation: CSS Forge warns when a duration exceeds 300ms. Set `settings.long: true` on duration groups for overlays like modals to raise the limit to 500ms:

```typescript
motion: {
  duration: {
    ui: { value: { quick: "150ms" } },      // limit 300ms
    overlay: {
      value: { drawer: "400ms" },
      settings: { long: true },              // limit 500ms
    },
  },
}
```

Warnings are printed to stderr and do not fail the build.

### Easing Curve Validation

CSS Forge warns when a curve looks like `ease-in` (starts slow, ends fast), because it reads as lag on UI:

- `ease-in` warns
- `cubic-bezier()` whose slope at the start is below 1 and at the end is above 1 warns
- `ease`, `ease-out`, `ease-in-out`, `linear`, `steps()` and `linear()` do not warn

## Manual Implementation

These good-css rules stay in your stylesheet or HTML:

- **color-scheme meta tag:** Add `<meta name="color-scheme" content="light dark">` to `<head>` so the browser picks the scheme before CSS loads.
- **Logical properties:** Write `padding-inline`, `margin-block-start` instead of `padding-left`, `margin-top`.
- **Hover media query:** Wrap `:hover` rules in `@media (hover: hover) and (pointer: fine)`.
- **Focus styling:** Use `:focus-visible` with `outline`, never `outline: none`.
- **Active state:** Add `:active` to every pressable element.
- **Transitions:** Wrap motion inside `@media (prefers-reduced-motion: no-preference)`, name the properties (never `all`).
- **Overflow:** Cut off with `overflow: clip`; keep `overflow: hidden` only where a script scrolls.
