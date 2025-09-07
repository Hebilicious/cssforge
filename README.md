# CSS Forge

0 runtime design tokens generator for modern style systems.

## Why

CSS forge is a suite of tools that leverages modern CSS features and conventions to help
you generate design tokens. All operations happen at build time, so you can use the
generated tokens in your stylesheets without any runtime overhead. Cssforge accepts a
single, serializable configuration object.

## Features

- 🎨 **Colors**: Create palettes, gradients and themes. Automatically convert to OKLCH.
- 📐 **Type Scale**: Generate fluid typography with `clamp()`
- 📏 **Spacing Scale**: Organise spacing utilities
- 📦 **Primitives**: Define custom design tokens
- 🔄 **Watch Mode**: Auto-regenerate when your config changes
- 🎯 **Zero Runtime**: All processing happens at build time
- 🔌 **Framework Agnostic**: Use with any CSS workflow

## Installation

For programmatic usage, you can install CSS Forge as a dependency:

```bash
# Using npm
npx jsr add @hebilicious/cssforge

# Using Deno
deno install jsr:@hebilicious/cssforge
```

For CLI usage, you can also run CSS Forge directly from JSR or install it globally:

```bash
# Run directly from jsr with npx
npx jsr run @hebilicious/cssforge/cli

# Run directly from jsr with deno
deno run -A jsr:@hebilicious/cssforge/cli 

# Or install globally
deno install -A -n cssforge jsr:@hebilicious/cssforge/cli
```

## Quick Start

1. Create a configuration file (`cssforge.config.ts`):

```typescript
import { defineConfig } from "jsr:@hebilicious/cssforge";

export default defineConfig({
  spacing: {
    size: {
      value: {
        1: "0.25rem",
        2: "0.5rem",
        3: "0.75rem",
        4: "1rem",
      },
    },
  },
  typography: {
    arial: {
      typescale: {
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
          100: { hex: "#FF7F50" },
        },
        mint: {
          100: { hex: "#4ADE80" },
        },
        indigo: {
          100: { hex: "#4F46E5" },
        },
      },
    },
  },
});
```

2. Run CSS Forge with the CLI :

If you're using a package.json, you can add the follwing into your scripts :

```json
{
  "scripts": {
    "cssforge": "npx @hebilicious/cssforge/cli"
  }
}
```

Then run the following command :

```bash
npx cssforge --watch
```

If you're using a deno.json :

```json
{
  "tasks": {
    "cssforge": "deno run -A jsr:@hebilicious/cssforge/cli"
  }
}
```

The run the following command :

```bash
deno run cssforge --watch
```

3. Use the generated variables in your CSS:

```css
@import "cssforge.output.css" layer(cssforge);

.button {
  background-color: var(--color-primary-500);
  padding: var(--size-2) var(--size-4);
}
```

4. Use the generated css in your JS/TS :

```typescript
import { generateTS } from "jsr:@hebilicious/cssforge";
import { cssForge } from "./.cssforge/output.ts";

// Use like this anywhere :
//`cssForge.colors.palette.value.basic.white` is fully typed { key: --myKey, value: white, variable: --key: white }

export { cssForge };
```

## Configuration

### Colors

Define colors in any format - they'll be automatically converted to OKLCH. You can compose
colors from the palette into gradients and themes.

```typescript
export default defineConfig({
  colors: {
    palette: {
      value: {
        simple: {
          white: "oklch(100% 0 0)",
          black: "#000",
          green: { rgb: [0, 255, 0] },
          blue: { hsl: [240, 100, 50] },
          violet: { oklch: "oklch(0.7 0.2 270)" },
          red: { hex: "#FF0000" },
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
                "c1": "colors.palette.value.simple.white",
                "c2": "colors.palette.value.simple.green",
              },
            },
          },
        },
      },
    },
    theme: {
      value: {
        light: {
          background: {
            value: {
              primary: "var(--1)",
              secondary: "var(--2)",
            },
            variables: {
              1: "colors.palette.value.simple.white",
              2: "colors.gradients.value.white-green", //Reference the color name directly.
            },
          },
        },
      },
    },
  },
});
```

This will generate the following css :

```css
/*____ CSSForge ____*/
:root {
  /*____ Colors ____*/
  /* Palette */
  --color-simple-white: oklch(100% 0 0);
  --color-simple-black: oklch(0% 0 0);
  --color-simple-green: oklch(86.644% 0.29483 142.49535);
  --color-simple-blue: oklch(45.201% 0.31321 264.05202);
  --color-simple-violet: oklch(70% 0.2 270);
  --color-simple-red: oklch(62.796% 0.25768 29.23388);
  /*  Gradients  */
  --gradient-white-green-primary: linear-gradient(
    to right,
    var(--color-simple-white),
    var(--color-simple-green)
  );
  /* Theme: light */
  /* background */
  --theme-light-background-primary: var(--color-simple-white);
  --theme-light-background-secondary: var(--gradient-white-green-primary);
}
```

### Spacing

Define custom spacing scale, that can be referenced for other types, such as primitives.
By default all spacing values are converted to from `px` to `rem`. This can be disabled
with the settings.

```typescript
export default defineConfig({
  spacing: {
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
});
```

This will generate the following css :

```css
/*____ CSSForge ____*/
:root {
  /*____ Spacing ____*/
  --size-1: 0.25rem;
  --size-2: 0.5rem;
  --size-3: 0.75rem;
  --size-4: 1rem;
}
```

### Typography

Define your typography, with typescales powered by
[utopia](https://utopia.fyi/type/calculator):

```typescript
export default defineConfig({
  typography: {
    arial: {
      weight: {
        value: {
          regular: "500",
        },
      },
      typescale: {
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

This will generate the following css :

```css
/*____ CSSForge ____*/
:root {
  /*____ Typography ____*/
  --typography-arial-4xl: clamp(2.6703rem, 2.5608rem + 0.5474vw, 3.0518rem);
  --typography-arial-3xl: clamp(2.1362rem, 2.0486rem + 0.4379vw, 2.4414rem);
  --typography-arial-2xl: clamp(1.709rem, 1.6389rem + 0.3503vw, 1.9531rem);
  --typography-arial-xl: clamp(1.3672rem, 1.3111rem + 0.2803vw, 1.5625rem);
  --typography-arial-lg: clamp(1.0938rem, 1.0489rem + 0.2242vw, 1.25rem);
  --typography-arial-base: clamp(0.875rem, 0.8391rem + 0.1794vw, 1rem);
  --typography-arial-sm: clamp(0.7rem, 0.6713rem + 0.1435vw, 0.8rem);
  --typography-arial-xs: clamp(0.56rem, 0.537rem + 0.1148vw, 0.64rem);
  --typography-arial-2xs: clamp(0.448rem, 0.4296rem + 0.0918vw, 0.512rem);
  --weight-arial-regular: 500;
}
```

### Customizing Typescales

You can customize the typescale by providing your prefix and custom labels. The prefix
will overwrite the name of the key that you are using to define your typography.

```typescript
const config = defineConfig({
  typography: {
    comicsans: {
      typescale: {
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

Will generate the following css variables :

```css
/*____ CSSForge ____*/
:root {
  /*____ Typography ____*/
  --typography-text-e: clamp(1.3672rem, 1.3111rem + 0.2803vw, 1.5625rem);
  --typography-text-d: clamp(1.0938rem, 1.0489rem + 0.2242vw, 1.25rem);
  --typography-text-c: clamp(0.875rem, 0.8391rem + 0.1794vw, 1rem);
  --typography-text-b: clamp(0.7rem, 0.6713rem + 0.1435vw, 0.8rem);
  --typography-text-a: clamp(0.56rem, 0.537rem + 0.1148vw, 0.64rem);
}
```

#### Referencing Typescale

To reference typescales, use the `@` symbol and the label of the typescale; ie:
`typography.text.typescale@a`. By default the labels follow the Tailwind convention :

- 2xs
- xs
- sm
- base
- lg
- xl
- 2xl

### Primitives

More flexible than other types, primitives allow you to define any type of token by
composing the base types.

```typescript
export default defineConfig({
  typography: {
    arial: {
      typescale: {
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
    size: {
      value: {
        2: "0.5rem",
        3: "0.75rem",
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
            "base": "typography.arial.typescale@base",
            "2": "spacing.size.value.2",
            "3": "spacing.size.value.3",
          },
        },
      },
    },
  },
});
```

This will generate the following css :

```css
/*____ CSSForge ____*/
:root {
  /*____ Spacing ____*/
  --size-2: 0.5rem;
  --size-3: 0.75rem;
  /*____ Typography ____*/
  --typography-arial-4xl: clamp(2.6703rem, 2.5608rem + 0.5474vw, 3.0518rem);
  --typography-arial-3xl: clamp(2.1362rem, 2.0486rem + 0.4379vw, 2.4414rem);
  --typography-arial-2xl: clamp(1.709rem, 1.6389rem + 0.3503vw, 1.9531rem);
  --typography-arial-xl: clamp(1.3672rem, 1.3111rem + 0.2803vw, 1.5625rem);
  --typography-arial-lg: clamp(1.0938rem, 1.0489rem + 0.2242vw, 1.25rem);
  --typography-arial-base: clamp(0.875rem, 0.8391rem + 0.1794vw, 1rem);
  --typography-arial-sm: clamp(0.7rem, 0.6713rem + 0.1435vw, 0.8rem);
  --typography-arial-xs: clamp(0.56rem, 0.537rem + 0.1148vw, 0.64rem);
  --typography-arial-2xs: clamp(0.448rem, 0.4296rem + 0.0918vw, 0.512rem);
  /*____ Primitives ____*/
  /* button */
  --button-small-width: 7.5rem;
  --button-small-height: 2.5rem;
  --button-small-fontSize: var(--typography-arial-base);
  --button-small-radius: 0.5rem;
  --button-small-padding: var(--size-2) var(--size-3);
}
```

## CLI Usage

```bash
# Basic usage
cssforge

# Watch mode
cssforge --watch

# Custom paths and output 
cssforge --config ./foo/bar/custom-path.ts --css ./dist/design-tokens.css --ts ./dist/design-tokens.ts --json ./dist/design-tokens.json --mode all
```

## Programmatic Usage

You can also use CSS Forge programmatically:

```typescript
import { generateCSS } from "jsr:@hebilicious/cssforge";

// Generate CSS string
const css = generateCSS(config);
```

## Best Practices

- **Version Control**: Commit your generated CSS files
- **CSS Layers**: Use `@layer` to manage specificity

## Examples

Check out our examples:

- [Basic Setup](./examples/basic)

TODO Examples : [] Nuxt [] Tailwind [] Vite

## License

MIT
