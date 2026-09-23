# CSS Forge

0 runtime design tokens generator for modern style systems.

> [!WARNING]
> CSSForge is an experimental library and its API _will_ change while I figure out a
> schema that makes sense. That being said, when the schema change, you should be able to
> search and replace your variables names.

## Why

CSS forge is library that leverages modern CSS features and conventions to help you
generate CSS custom properties (css variables).

At the core of CSSforge is the schema : A serializable configuration object.

CSSforge has 0 runtime and generate at build time raw CSS, Typescript or JSON.

This intentionally keeps things simple and flexible, and allows you to integrate it with
any framework or CSS workflow.

In the future, CSSforge will try to integrate with popular design tools such as Figma.

## Features

- 🎨 **Colors**: Create palettes, gradients and themes. Automatically convert to OKLCH.
- 📐 **Typography**: Generate fluid typography
- 📏 **Spacing**: Organise spacing utilities
- 📦 **Primitives**: Define custom design tokens
- 🎯 **Zero Runtime**: All processing happens at build time
- 🔄 **Watch Mode**: Auto-regenerate when your config changes
- 🔌 **Framework Agnostic**: Use with any CSS workflow

## Installation

CSS Forge requires Node 24 or newer. It loads `cssforge.config.ts` with the native
TypeScript support of that runtime, so no extra loader or `tsx` installation is needed.
Configuration files use ES module syntax; add `"type": "module"` to your `package.json` to
load them without Node's module type detection warning.

```bash
# Using npm
npm install --save-dev @hebilicious/cssforge

# Using pnpm
pnpm add -D @hebilicious/cssforge
```

The package installs a `cssforge` executable:

```bash
pnpm cssforge --mode all # pnpm
npx cssforge --mode all # npm
```

The rest of this document writes commands as `cssforge <args>`.

### Alternative installation (Deno and JSR)

CSS Forge is also published to [JSR](https://jsr.io/@hebilicious/cssforge) at the same version
as npm. Use it for Deno projects and for JSR-native imports:

```bash
# Deno
deno add jsr:@hebilicious/cssforge

# npm (10.9 +) or pnpm
npx jsr add @hebilicious/cssforge
pnpm i jsr:@hebilicious/cssforge
```

The `jsr:` specifier replaces the package name in imports, and the published CLI entry
point runs directly with Deno:

```bash
deno run -A jsr:@hebilicious/cssforge/cli --mode all
```

```typescript
import { defineConfig } from "jsr:@hebilicious/cssforge";
```

## Contributing Workflow

This repository is a pnpm workspace orchestrated with moon.

```bash
pnpm install
moon run :format
moon run cssforge:test
moon run cssforge:typecheck
moon run cssforge:build
moon run cssforge:smoke-test
moon run cssforge:jsr-smoke
moon run cssforge:jsr-dry-run
```

`cssforge:smoke-test` packs the package and installs that tarball in clean npm and pnpm
projects, and `cssforge:jsr-smoke` exercises the JSR entry points (with Deno when it is
installed).

## Quick Start

1. Create a configuration file (`cssforge.config.ts`):

```typescript
import { defineConfig } from "@hebilicious/cssforge";

export default defineConfig({
  spacing: {
    custom: {
      size: {
        value: {
          1: "0.25rem",
          2: "0.5rem",
          3: "0.75rem",
          4: "1rem",
        },
      },
    },
  },
  typography: {
    fluid: {
      arial: {
        value: {
          minWidth: 320,
          minFontSize: 14,
          minTypeScale: 1.25,
          maxWidth: 1435,
          maxFontSize: 16,
          maxTypeScale: 1.25,
          positiveSteps: 5,
          negativeSteps: 3,
        },
      },
    },
  },
  colors: {
    palette: {
      value: {
        coral: {
          value: {
            100: { hex: "#FF7F50" },
          },
        },
        mint: {
          value: {
            100: { hex: "#4ADE80" },
          },
        },
        indigo: {
          value: {
            100: { hex: "#4F46E5" },
          },
        },
      },
    },
  },
});
```

2. Run CSS Forge with the CLI :

```bash
cssforge # Basic usage
cssforge --help # To see all options
cssforge --watch # To watch for changes
```

3. Use the generated variables in your CSS:

The CLI writes `./.cssforge/output.css` by default. From a consumer stylesheet placed at
the project root, import that file as a layer :

```css
/* Relative to a consumer stylesheet placed at the project root. */
@import "./.cssforge/output.css" layer(cssforge);

.button {
  background-color: var(--palette-coral-100);
  padding: var(--spacing-size-2) var(--spacing-size-4);
}
```

> !IMPORTANT Do not manually edit the generated CSS file, edit the configuration file
> instead and regenerate.

4. Use the generated css in your JS/TS :

The CLI also writes `./.cssforge/output.ts`, which exports every token as a fully typed
`cssForge` object :

```typescript
import { cssForge } from "./.cssforge/output.ts";

// Fully typed token : cssForge.spacing.custom.size["2"] is
// { key: "--spacing-size-2", value: "0.5rem", variable: "--spacing-size-2: 0.5rem;" }
export const spacing2 = cssForge.spacing.custom.size["2"];

export { cssForge };
```

The generated file is a `.ts` module, so importing it needs
`"allowImportingTsExtensions": true` (with `"noEmit": true`) in your `tsconfig.json`.

## Bundler Plugin

Generate tokens inside the build instead of running the CLI first. The plugin is powered by
[unplugin](https://unplugin.unjs.io) and covers Vite, Rollup, Rolldown, webpack, Rspack, Rsbuild,
esbuild, Farm, and Bun.

```bash
pnpm add -D @hebilicious/cssforge-unplugin
```

```typescript
// vite.config.ts
import cssforge from "@hebilicious/cssforge-unplugin/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [cssforge()],
});
```

```typescript
// src/main.ts
import "virtual:cssforge.css";
```

TypeScript needs the ambient declaration for that import :

```typescript
// src/vite-env.d.ts
/// <reference types="@hebilicious/cssforge-unplugin/client" />
```

The stylesheet is generated on demand from `cssforge.config.ts`. The plugin registers the config and
every local module it imports as watch files, so editing a token regenerates it, and a Vite dev
server updates the styles without reloading the page.

Each bundler has its own entry point :

| Bundler | Import |
| --- | --- |
| Vite | `@hebilicious/cssforge-unplugin/vite` |
| Rollup | `@hebilicious/cssforge-unplugin/rollup` |
| Rolldown | `@hebilicious/cssforge-unplugin/rolldown` |
| webpack | `@hebilicious/cssforge-unplugin/webpack` |
| Rspack | `@hebilicious/cssforge-unplugin/rspack` |
| Rsbuild | `@hebilicious/cssforge-unplugin/rsbuild` |
| esbuild | `@hebilicious/cssforge-unplugin/esbuild` |
| Farm | `@hebilicious/cssforge-unplugin/farm` |
| Bun | `@hebilicious/cssforge-unplugin/bun` |

The plugin options are :

```typescript
cssforge({
  // Resolved against the build's working directory. Default: ./cssforge.config.ts
  config: "./cssforge.config.ts",
  // Also write the stylesheet to disk. Default: false
  write: { css: "./.cssforge/output.css" },
});
```

`write: true` uses `./.cssforge/output.css`, the CLI's default path. Use it when another tool needs a
real file, or when a bundler has no CSS handling for virtual modules.

The plugin calls the same `generateCSS` implementation as the CLI, so `virtual:cssforge.css` matches
`cssforge --mode css` output byte for byte. The served stylesheet is unlayered, and
`@import "virtual:cssforge.css" layer(cssforge)` does not work because a CSS import resolves to a
file; set `write` and import the written file with `layer(cssforge)` to keep the tokens in a layer.
The CLI stays the integration path for everything else: Deno and JSR, Style Dictionary, CI steps, and
tools without a bundler.

## Configuration

### Colors

Define colors in any format - they'll be automatically converted to OKLCH. You can compose
colors from the palette into gradients and themes.

<!-- md:generate defineConfig
export default defineConfig({
  colors: {
    palette: {
      value: {
        simple: {
          value: {
            white: "oklch(100% 0 0)",
            black: "#000",
            green: { rgb: [0, 255, 0] },
            blue: { hsl: [240, 100, 50] },
            violet: { oklch: "oklch(0.7 0.2 270)" },
            red: { hex: "#FF0000" },
          },
        },
        another: {
          value: {
            yellow: { hex: "#FFFF00" },
            cyan: { hex: "#00FFFF" },
          },
          settings: {
            selector: ":root.Another",
          },
        },
      },
    },
    gradients: {
      value: {
        "white-green": {
          value: {
            primary: {
              value: "linear-gradient(to right, var(--c1), var(--c2))",
              variables: {
                "c1": "palette.simple.white",
                "c2": "palette.simple.green",
              },
            },
          },
        },
      },
    },
    theme: {
      light: {
        value: {
          background: {
            value: {
              primary: "var(--1)",
              secondary: "var(--2)",
            },
            variables: {
              1: "palette.simple.white",
              2: "gradients.white-green.primary", //Reference the color name directly.
            },
            settings: {
              variantNameOnly: true,
            },
          },
        },
      },
      dark: {
        value: {
          background: {
            value: {
              primary: "var(--1)",
              secondary: "var(--2)",
            },
            variables: {
              1: "palette.another.yellow",
              2: "palette.another.cyan",
            },
            settings: {
              variantNameOnly: true,
            },
          },
        },
        settings: {
          atRule: "@media (prefers-color-scheme: dark)",
        },
      },
      pink: {
        value: {
          background: {
            value: {
              primary: "var(--1)",
              secondary: "var(--2)",
            },
            variables: {
              1: "palette.simple.red",
              2: "palette.simple.violet",
            },
            settings: {
              variantNameOnly: true,
            },
          },
        },
        settings: {
          selector: ".ThemePink",
        },
      },
    },
  },
});
-->

```typescript
export default defineConfig({
  colors: {
    palette: {
      value: {
        simple: {
          value: {
            white: "oklch(100% 0 0)",
            black: "#000",
            green: { rgb: [0, 255, 0] },
            blue: { hsl: [240, 100, 50] },
            violet: { oklch: "oklch(0.7 0.2 270)" },
            red: { hex: "#FF0000" },
          },
        },
        another: {
          value: {
            yellow: { hex: "#FFFF00" },
            cyan: { hex: "#00FFFF" },
          },
          settings: {
            selector: ":root.Another",
          },
        },
      },
    },
    gradients: {
      value: {
        "white-green": {
          value: {
            primary: {
              value: "linear-gradient(to right, var(--c1), var(--c2))",
              variables: {
                "c1": "palette.simple.white",
                "c2": "palette.simple.green",
              },
            },
          },
        },
      },
    },
    theme: {
      light: {
        value: {
          background: {
            value: {
              primary: "var(--1)",
              secondary: "var(--2)",
            },
            variables: {
              1: "palette.simple.white",
              2: "gradients.white-green.primary", //Reference the color name directly.
            },
            settings: {
              variantNameOnly: true,
            },
          },
        },
      },
      dark: {
        value: {
          background: {
            value: {
              primary: "var(--1)",
              secondary: "var(--2)",
            },
            variables: {
              1: "palette.another.yellow",
              2: "palette.another.cyan",
            },
            settings: {
              variantNameOnly: true,
            },
          },
        },
        settings: {
          atRule: "@media (prefers-color-scheme: dark)",
        },
      },
      pink: {
        value: {
          background: {
            value: {
              primary: "var(--1)",
              secondary: "var(--2)",
            },
            variables: {
              1: "palette.simple.red",
              2: "palette.simple.violet",
            },
            settings: {
              variantNameOnly: true,
            },
          },
        },
        settings: {
          selector: ".ThemePink",
        },
      },
    },
  },
});
```

This will generate the following CSS :

```css
/*____ CSSForge ____*/
:root {
/*____ Colors ____*/
/* Palette */
/* simple */
--palette-simple-white: oklch(100% 0 0);
--palette-simple-black: oklch(0% 0 0);
--palette-simple-green: oklch(86.644% 0.29483 142.49535);
--palette-simple-blue: oklch(45.201% 0.31321 264.05202);
--palette-simple-violet: oklch(70% 0.2 270);
--palette-simple-red: oklch(62.796% 0.25768 29.23388);
/* Gradients */
/* white-green */
--gradients-white-green-primary: linear-gradient(to right, var(--palette-simple-white), var(--palette-simple-green));
/* Themes */
/* Theme: light */
/* background */
--primary: var(--palette-simple-white);
--secondary: var(--gradients-white-green-primary);
/* Theme: dark */
@media (prefers-color-scheme: dark) {
  /* background */
  --primary: var(--palette-another-yellow);
  --secondary: var(--palette-another-cyan);
}
}
/* another */
:root.Another {
  --palette-another-yellow: oklch(96.798% 0.21101 109.76924);
  --palette-another-cyan: oklch(90.54% 0.15455 194.76896);
}
/* Theme: pink */
.ThemePink {
  /* background */
  --primary: var(--palette-simple-red);
  --secondary: var(--palette-simple-violet);
}
```

<!-- /md:generate -->

The `another` palette is emitted under `:root.Another`, so the element carrying the theme
class has to be the root element:

```html
<html class="Another">
```

Custom property references are substituted when the alias is computed, before inheritance.
`--primary: var(--palette-another-yellow)` is computed on `:root`, so
`--palette-another-yellow` has to be defined on `:root` as well. Scoping the palette to
`:root.Another` keeps both declarations on the same element; a theme class on a descendant
leaves `--primary` invalid at computed-value time, and every `var(--primary, fallback)`
reference uses its fallback.

#### Condition

You can conditionnally apply colors, gradients or themes by setting the `atRule` or the
`selector` properties. Your variables will be wrapped within `:root` and the selectors
will be placed outside of it.

#### Theme: Variant Name Only

When working with themes, you can choose to only include the variant name in the CSS
variable name by setting `variantNameOnly: true` in the color definition settings. This is
usually used in combination with `selector` to conditionnally apply themes.

- Default: `--theme-${themeName}-${colorName}-${variantName}`
- VariantOnly Name: `--${variantName}`
- Path : `theme.${themeName}.${colorName}.${variantName}`

### Spacing

Define custom spacing scale, that can be referenced for other types, such as primitives.
By default all spacing values are converted to from `px` to `rem`. This can be disabled
with the settings.

<!-- md:generate defineConfig
export default defineConfig({
  spacing: {
    custom: {
      size: {
        value: {
          1: "0.25rem",
          2: "0.5rem",
          3: "0.75rem",
          4: "16px",
        },
        settings: { pxToRem: true, rem: 16 }, // Optional, default settings
      },
    },
  },
});
-->

```typescript
export default defineConfig({
  spacing: {
    custom: {
      size: {
        value: {
          1: "0.25rem",
          2: "0.5rem",
          3: "0.75rem",
          4: "16px",
        },
        settings: { pxToRem: true, rem: 16 }, // Optional, default settings
      },
    },
  },
});
```

This will generate the following CSS :

```css
/*____ CSSForge ____*/
:root {
/*____ Spacing ____*/
--spacing-size-1: 0.25rem;
--spacing-size-2: 0.5rem;
--spacing-size-3: 0.75rem;
--spacing-size-4: 1rem;
}
```

<!-- /md:generate -->

#### Fluid Spacing (Utopia)

You can generate fluid spacing scales powered by [Utopia](https://utopia.fyi). Fluid
scales output `clamp()` expressions which interpolate between a minimum and maximum size
across a viewport range.

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

```typescript
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
```

This will generate the following CSS :

```css
/*____ CSSForge ____*/
:root {
/*____ Spacing ____*/
--spacing_fluid-base-hi-xs: clamp(0rem, 0rem + 0vw, 0rem);
--spacing_fluid-base-hi-s: clamp(0.25rem, -0.1667rem + 2.0833vw, 1.5rem);
--spacing_fluid-base-hi-m: clamp(0.75rem, -0.5rem + 6.25vw, 4.5rem);
--spacing_fluid-base-hi-xs-s: clamp(0rem, -0.5rem + 2.5vw, 1.5rem);
--spacing_fluid-base-hi-s-m: clamp(0.25rem, -1.1667rem + 7.0833vw, 4.5rem);
}
```

<!-- /md:generate -->

You can combine fluid and static spacing:

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
          positiveSteps: [1.5, 2, 3, 4, 6],
          negativeSteps: [0.75, 0.5, 0.25],
          prefix: "smooth",
        },
      },
    },
    custom: {
      gap: {
        value: { 1: "4px", 2: "8px" },
      },
    },
  },
});
-->

```typescript
export default defineConfig({
  spacing: {
    fluid: {
      base: {
        value: {
          minSize: 4,
          maxSize: 24,
          minWidth: 320,
          maxWidth: 1280,
          positiveSteps: [1.5, 2, 3, 4, 6],
          negativeSteps: [0.75, 0.5, 0.25],
          prefix: "smooth",
        },
      },
    },
    custom: {
      gap: {
        value: { 1: "4px", 2: "8px" },
      },
    },
  },
});
```

This will generate the following CSS :

```css
/*____ CSSForge ____*/
:root {
/*____ Spacing ____*/
--spacing_fluid-base-smooth-3xs: clamp(0.0625rem, -0.0417rem + 0.5208vw, 0.375rem);
--spacing_fluid-base-smooth-2xs: clamp(0.125rem, -0.0833rem + 1.0417vw, 0.75rem);
--spacing_fluid-base-smooth-xs: clamp(0.1875rem, -0.125rem + 1.5625vw, 1.125rem);
--spacing_fluid-base-smooth-s: clamp(0.25rem, -0.1667rem + 2.0833vw, 1.5rem);
--spacing_fluid-base-smooth-m: clamp(0.375rem, -0.25rem + 3.125vw, 2.25rem);
--spacing_fluid-base-smooth-l: clamp(0.5rem, -0.3333rem + 4.1667vw, 3rem);
--spacing_fluid-base-smooth-xl: clamp(0.75rem, -0.5rem + 6.25vw, 4.5rem);
--spacing_fluid-base-smooth-2xl: clamp(1rem, -0.6667rem + 8.3333vw, 6rem);
--spacing_fluid-base-smooth-3xl: clamp(1.5rem, -1rem + 12.5vw, 9rem);
--spacing_fluid-base-smooth-3xs-2xs: clamp(0.0625rem, -0.1667rem + 1.1458vw, 0.75rem);
--spacing_fluid-base-smooth-2xs-xs: clamp(0.125rem, -0.2083rem + 1.6667vw, 1.125rem);
--spacing_fluid-base-smooth-xs-s: clamp(0.1875rem, -0.25rem + 2.1875vw, 1.5rem);
--spacing_fluid-base-smooth-s-m: clamp(0.25rem, -0.4167rem + 3.3333vw, 2.25rem);
--spacing_fluid-base-smooth-m-l: clamp(0.375rem, -0.5rem + 4.375vw, 3rem);
--spacing_fluid-base-smooth-l-xl: clamp(0.5rem, -0.8333rem + 6.6667vw, 4.5rem);
--spacing_fluid-base-smooth-xl-2xl: clamp(0.75rem, -1rem + 8.75vw, 6rem);
--spacing_fluid-base-smooth-2xl-3xl: clamp(1rem, -1.6667rem + 13.3333vw, 9rem);
--spacing-gap-1: 0.25rem;
--spacing-gap-2: 0.5rem;
}
```

<!-- /md:generate -->

### Typography

Define your typography, with fluid typescales powered by
[utopia](https://utopia.fyi/type/calculator):

<!-- md:generate defineConfig
export default defineConfig({
  typography: {
    weight: {
      arial: {
        value: {
          regular: "600",
        },
      },
    },
    fluid: {
      arial: {
        value: {
          minWidth: 320,
          minFontSize: 14,
          minTypeScale: 1.25,
          maxWidth: 1435,
          maxFontSize: 16,
          maxTypeScale: 1.25,
          positiveSteps: 5,
          negativeSteps: 3,
        },
      },
    },
  },
});
-->

```typescript
export default defineConfig({
  typography: {
    weight: {
      arial: {
        value: {
          regular: "600",
        },
      },
    },
    fluid: {
      arial: {
        value: {
          minWidth: 320,
          minFontSize: 14,
          minTypeScale: 1.25,
          maxWidth: 1435,
          maxFontSize: 16,
          maxTypeScale: 1.25,
          positiveSteps: 5,
          negativeSteps: 3,
        },
      },
    },
  },
});
```

This will generate the following CSS :

```css
/*____ CSSForge ____*/
:root {
/*____ Typography ____*/
--typography_fluid-arial-4xl: clamp(2.6703rem, 2.5608rem + 0.5474vw, 3.0518rem);
--typography_fluid-arial-3xl: clamp(2.1362rem, 2.0486rem + 0.4379vw, 2.4414rem);
--typography_fluid-arial-2xl: clamp(1.709rem, 1.6389rem + 0.3503vw, 1.9531rem);
--typography_fluid-arial-xl: clamp(1.3672rem, 1.3111rem + 0.2803vw, 1.5625rem);
--typography_fluid-arial-l: clamp(1.0938rem, 1.0489rem + 0.2242vw, 1.25rem);
--typography_fluid-arial-m: clamp(0.875rem, 0.8391rem + 0.1794vw, 1rem);
--typography_fluid-arial-s: clamp(0.7rem, 0.6713rem + 0.1435vw, 0.8rem);
--typography_fluid-arial-xs: clamp(0.56rem, 0.537rem + 0.1148vw, 0.64rem);
--typography_fluid-arial-2xs: clamp(0.448rem, 0.4296rem + 0.0918vw, 0.512rem);
--typography-weight-arial-regular: 600;
}
```

<!-- /md:generate -->

#### Customizing Fluid Typography Scales

You can customize the typescale by providing your prefix and custom labels. The prefix
will overwrite the name of the key that you are using to define your typography.

<!-- md:generate defineConfig
const config = defineConfig({
  typography: {
    fluid: {
      comicsans: {
        value: {
          minWidth: 320,
          minFontSize: 14,
          minTypeScale: 1.25,
          maxWidth: 1435,
          maxFontSize: 16,
          maxTypeScale: 1.25,
          positiveSteps: 2,
          negativeSteps: 2,
          prefix: "text",
        },
        settings: {
          customLabel: {
            "-2": "a",
            "-1": "b",
            "0": "c",
            "1": "d",
            "2": "e",
          },
        },
      },
    },
  },
});
-->

```typescript
const config = defineConfig({
  typography: {
    fluid: {
      comicsans: {
        value: {
          minWidth: 320,
          minFontSize: 14,
          minTypeScale: 1.25,
          maxWidth: 1435,
          maxFontSize: 16,
          maxTypeScale: 1.25,
          positiveSteps: 2,
          negativeSteps: 2,
          prefix: "text",
        },
        settings: {
          customLabel: {
            "-2": "a",
            "-1": "b",
            "0": "c",
            "1": "d",
            "2": "e",
          },
        },
      },
    },
  },
});
```

This will generate the following CSS :

```css
/*____ CSSForge ____*/
:root {
/*____ Typography ____*/
--typography_fluid-comicsans-text-e: clamp(1.3672rem, 1.3111rem + 0.2803vw, 1.5625rem);
--typography_fluid-comicsans-text-d: clamp(1.0938rem, 1.0489rem + 0.2242vw, 1.25rem);
--typography_fluid-comicsans-text-c: clamp(0.875rem, 0.8391rem + 0.1794vw, 1rem);
--typography_fluid-comicsans-text-b: clamp(0.7rem, 0.6713rem + 0.1435vw, 0.8rem);
--typography_fluid-comicsans-text-a: clamp(0.56rem, 0.537rem + 0.1148vw, 0.64rem);
}
```

<!-- /md:generate -->

### Primitives

More flexible than other types, primitives allow you to define any type of token by
composing the base types.

<!-- md:generate defineConfig
export default defineConfig({
  typography: {
    fluid: {
      arial: {
        value: {
          minWidth: 320,
          minFontSize: 14,
          minTypeScale: 1.25,
          maxWidth: 1435,
          maxFontSize: 16,
          maxTypeScale: 1.25,
          positiveSteps: 5,
          negativeSteps: 3,
        },
      },
    },
  },
  spacing: {
    custom: {
      size: {
        value: {
          2: "0.5rem",
          3: "0.75rem",
        },
      },
    },
  },
  primitives: {
    button: {
      value: {
        small: {
          value: {
            width: "120px",
            height: "40px",
            fontSize: "var(--base)",
            radius: "8px",
            padding: "var(--2) var(--3)",
          },
          variables: {
            "base": "typography_fluid.arial@m",
            "2": "spacing.custom.size.2",
            "3": "spacing.custom.size.3",
          },
        },
      },
    },
  },
});
```
-->

```typescript
export default defineConfig({
  typography: {
    fluid: {
      arial: {
        value: {
          minWidth: 320,
          minFontSize: 14,
          minTypeScale: 1.25,
          maxWidth: 1435,
          maxFontSize: 16,
          maxTypeScale: 1.25,
          positiveSteps: 5,
          negativeSteps: 3,
        },
      },
    },
  },
  spacing: {
    custom: {
      size: {
        value: {
          2: "0.5rem",
          3: "0.75rem",
        },
      },
    },
  },
  primitives: {
    button: {
      value: {
        small: {
          value: {
            width: "120px",
            height: "40px",
            fontSize: "var(--base)",
            radius: "8px",
            padding: "var(--2) var(--3)",
          },
          variables: {
            "base": "typography_fluid.arial@m",
            "2": "spacing.custom.size.2",
            "3": "spacing.custom.size.3",
          },
        },
      },
    },
  },
});
```

This will generate the following CSS :

```css
/*____ CSSForge ____*/
:root {
/*____ Spacing ____*/
--spacing-size-2: 0.5rem;
--spacing-size-3: 0.75rem;
/*____ Typography ____*/
--typography_fluid-arial-4xl: clamp(2.6703rem, 2.5608rem + 0.5474vw, 3.0518rem);
--typography_fluid-arial-3xl: clamp(2.1362rem, 2.0486rem + 0.4379vw, 2.4414rem);
--typography_fluid-arial-2xl: clamp(1.709rem, 1.6389rem + 0.3503vw, 1.9531rem);
--typography_fluid-arial-xl: clamp(1.3672rem, 1.3111rem + 0.2803vw, 1.5625rem);
--typography_fluid-arial-l: clamp(1.0938rem, 1.0489rem + 0.2242vw, 1.25rem);
--typography_fluid-arial-m: clamp(0.875rem, 0.8391rem + 0.1794vw, 1rem);
--typography_fluid-arial-s: clamp(0.7rem, 0.6713rem + 0.1435vw, 0.8rem);
--typography_fluid-arial-xs: clamp(0.56rem, 0.537rem + 0.1148vw, 0.64rem);
--typography_fluid-arial-2xs: clamp(0.448rem, 0.4296rem + 0.0918vw, 0.512rem);
/*____ Primitives ____*/
/* button */
--button-small-width: 7.5rem;
--button-small-height: 2.5rem;
--button-small-fontSize: var(--typography_fluid-arial-m);
--button-small-radius: 0.5rem;
--button-small-padding: var(--spacing-size-2) var(--spacing-size-3);
}
```

<!-- /md:generate -->

## Referencing Variables

### Basic Referencing

To reference any variable, use the `.` notation to navigate through the schema without
using `.value`.

For example, if an object has the following structure :

```typescript
{
  spacing: {
    custom: {
      size: {
        value: {
          1: "0.25rem",
        },
      },
    },
  },
}
```

The reference would be : `spacing.custom.size.1`, not `spacing.custom.size.value.1`.

#### Referencing Fluid Spacing

To reference fluid spacing, use the `@` symbol and the label of the scale; ie:
`spacing_fluid-base@xs`. Do not include the prefix in the reference. The labels follow the
following convention :

- 3xs
- 2xs
- xs
- s
- m
- l
- xl
- 2xl
- 3xl

### Referencing Fluid Typography

To reference fluid typography, use the `@` symbol and the label of the scale; ie:
`typography_fluid.comicsans@a`. Do not include the prefix in the reference. The labels
follow the following convention :

- 3xs
- 2xs
- xs
- s
- m
- l
- xl
- 2xl
- 3xl

## CLI Usage

```bash
# Basic usage
cssforge

# Watch mode
cssforge --watch

# Custom paths and output
cssforge --config ./foo/bar/custom-path.ts --css ./dist/design-tokens.css --ts ./dist/design-tokens.ts --json ./dist/design-tokens.json --style-dictionary ./dist/design-tokens.sd.json --mode all

# Style Dictionary JSON with final values (default)
cssforge --mode style-dictionary --style-dictionary ./dist/design-tokens.sd.json

# Keep CSS variables as values for usage matching
cssforge --mode style-dictionary --style-dictionary ./dist/design-tokens.sd.json --style-dictionary-value-mode css-reference
```

## Programmatic Usage

You can also use CSS Forge programmatically:

```typescript
import { generateCSS, generateStyleDictionaryJSON } from "@hebilicious/cssforge";

// Generate CSS string
const css = generateCSS(config);

// Write final values for Style Dictionary
const resolvedTokens = generateStyleDictionaryJSON(config);

// Keep var(--token) as each token's value for usage matching
const usageTokens = generateStyleDictionaryJSON(config, { valueMode: "css-reference" });
```

## Style Dictionary JSON

CSS Forge can generate a separate token file for Style Dictionary and other tools that read
the same JSON shape. This output does not change the CSS, TypeScript, or regular JSON files
you already generate.

### Generate the file

Use `style-dictionary` mode to generate only the token file:

```bash
cssforge --mode style-dictionary --style-dictionary ./.cssforge/tokens.json
```

Use `--mode all` to generate it together with the CSS, TypeScript, and regular JSON outputs.
The `--style-dictionary` option controls where the token file is written.

A generated token looks like this:

```json
{
  "palette": {
    "neutral": {
      "900": {
        "value": "oklch(17.764% 0 0)",
        "type": "color",
        "$tier": "primitive",
        "$resolvedValue": "oklch(17.764% 0 0)",
        "attributes": {
          "cssVariable": "--palette-neutral-900",
          "cssVariableReference": "var(--palette-neutral-900)",
          "tailwindVariable": "--palette-neutral-900",
          "resolvedValue": "oklch(17.764% 0 0)",
          "sourcePath": "palette.neutral.900"
        }
      }
    }
  }
}
```

Semantic tokens also include `$reference` and `attributes.referencePaths`. These paths match
the keys in the generated file, so consumers can connect a semantic token to its source.

### Token fields

| Field | Contains | Use it for |
| --- | --- | --- |
| `value` | The token value in the selected value mode | Rendering and Style Dictionary transforms |
| `type` | The value kind, falling back to the CSS Forge module when the value kind is not narrower | Grouping and previews that depend on what the token holds |
| `$tier` | `primitive` or `semantic` | Separating base scales from intent tokens |
| `$reference` | The token path this token was built from, when it has one | Following a semantic token back to its source |
| `attributes.cssVariable` | The token's CSS custom property, such as `--palette-neutral-900` | Declaring or overriding the token in CSS |
| `attributes.tailwindVariable` | The same custom property name, without the `var()` wrapper | Tools that match authored `var(--token)` usage to tokens |
| `attributes.resolvedValue` | The final value, even in `css-reference` mode | Showing a value without following references |
| `$resolvedValue` | The same final value as a top-level DTCG-style field | Tools that read `$resolvedValue` before falling back to `value` |

`type` narrows `fontSize`, `lineHeight`, `fontWeight`, `fontFamily`, `borderRadius`,
`letterSpacing`, `shadow`, `opacity`, `zIndex`, and `number` when the token's name and value
agree, and stays `color`, `spacing`, `gradient`, `typography`, `primitive`, or `component`
otherwise.

A narrowed kind is also matched by the leaf name aliases `font-size`, `text-size`,
`line-height`, `leading`, `font-weight`, `font-family`, `radius`, `rounded`, `tracking`,
`box-shadow`, `text-shadow`, `shadow`, `alpha`, `z-index`, `gap`, `duration`, and `delay`.

### Choose the value mode

| Mode | `value` contains | Use it for |
| --- | --- | --- |
| `resolved` (default) | The final value, such as `oklch(...)`, `1rem`, or `clamp(...)` | Style Dictionary transforms and token previews |
| `css-reference` | The token's own CSS variable, such as `var(--palette-neutral-900)` | Tools that match CSS variable usage in source files |

The default `resolved` mode recursively resolves references to other CSS Forge tokens. Cycles
and unknown CSS variables remain as `var(...)` instead of causing generation to fail.

`css-reference` values are CSS custom-property references, not Style Dictionary aliases.
Style Dictionary aliases use `{path.to.token}`. Use the default `resolved` mode when Style
Dictionary will transform the file.

```bash
# Keep CSS variables as values for usage matching
cssforge --mode style-dictionary --style-dictionary ./.cssforge/tokens.json --style-dictionary-value-mode css-reference
```

### Programmatic API

```typescript
import { generateStyleDictionaryJSON } from "@hebilicious/cssforge";

const resolvedTokens = generateStyleDictionaryJSON(config);
const usageTokens = generateStyleDictionaryJSON(config, {
  valueMode: "css-reference",
});
```

### Example: Musea

Musea can use the generated file as its token source:

```typescript
import { musea } from "@vizejs/vite-plugin-musea";

musea({
  tokensPath: ".cssforge/tokens.json",
});
```

Musea reads `value`, `type`, and `$reference` from this file. Keep the default `resolved` value
mode: previews and token swatches render from `value`, and `attributes.tailwindVariable` is what
lets Musea attribute a `var(--token)` written in an art file back to its token.

## Agentic usage

CSSForge is intentionally designed to be extremely simple and integrate well with various
agents, such as Github Copilot, Gemini, Claude Code ... While there's no documentation
yet, you can add the README file to the agent context directly.

For most agents, this syntax works
`@https://raw.githubusercontent.com/Hebilicious/cssforge/refs/heads/main/README.md`.

## Best Practices

- **Version Control**: Commit your generated CSS files
- **CSS Layers**: Use `@layer` to manage specificity
- **Config First**: Always edit the config file, never edit the generated files

## Examples

Check out our examples:

- Basic
  - [Basic Setup](./example/basic)
- Tailwind Integrations
  - [Next.js](./example/tailwind-nextjs)
  - [Nuxt](./example/tailwind-nuxt)
  - [SolidStart](./example/tailwind-solidstart)
  - [SvelteKit](./example/tailwind-sveltekit)
- Vanilla CSS Integrations
  - [React (Vite)](./example/vanilla-react-css)
  - [Vue (Vite)](./example/vanilla-vue-css)
  - [Svelte (Vite)](./example/vanilla-svelte-css)
  - [Solid (Vite)](./example/vanilla-solid-css)

## TODO

- [ ] Module:
      [Custom Media Queries](https://www.w3.org/TR/mediaqueries-5/#at-ruledef-custom-media)
- [ ] Typography : Line Height
- [ ] Stable schema spec
- [ ] VSCode Extension
- [ ] Bundlers Plugin (Vite, Rollup, Webpack ...)
- [ ] Nuxt Module

## License

MIT
