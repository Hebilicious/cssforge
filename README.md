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
    "cssforge": "node node_modules/@hebilicious/cssforge/src/cli"
  }
}
```

_In the future JSR will support using `npx @hebilicious/cssforge` directly._

Then run the following command :

```bash
npm run cssforge # Basic usage
npm run cssforge --help # To see all options
npm run cssforge --watch # To watch for changes
```

If you're using a deno.json :

```json
{
  "tasks": {
    "cssforge": "deno run -A jsr:@hebilicious/cssforge/cli"
  }
}
```

Then :

```bash
deno task cssforge # Basic usage
deno task cssforge --help # To see all options
deno task cssforge --watch # To watch for changes
```

3. Use the generated variables in your CSS:

For example, you can import as a layer :

```css
@import "cssforge.output.css" layer(cssforge);

.button {
  background-color: var(--color-primary-500);
  padding: var(--size-2) var(--size-4);
}
```

4. Use the generated css in your JS/TS :

```typescript
import { cssForge } from "./.cssforge/output.ts";

// Use like this anywhere :
//`cssForge.colors.palette.value.basic.white` is fully typed { key: --myKey, value: white, variable: --key: white }

export { cssForge };
```

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
                "c1": "palette.value.simple.white",
                "c2": "palette.value.simple.green",
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
              1: "palette.value.simple.white",
              2: "gradients.value.white-green", //Reference the color name directly.
            },
          },
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
                "c1": "palette.value.simple.white",
                "c2": "palette.value.simple.green",
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
              1: "palette.value.simple.white",
              2: "gradients.value.white-green", //Reference the color name directly.
            },
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
  /*____ Colors ____*/
  /* Palette */
  --palette-simple-white: oklch(100% 0 0);
  --palette-simple-black: oklch(0% 0 0);
  --palette-simple-green: oklch(86.644% 0.29483 142.49535);
  --palette-simple-blue: oklch(45.201% 0.31321 264.05202);
  --palette-simple-violet: oklch(70% 0.2 270);
  --palette-simple-red: oklch(62.796% 0.25768 29.23388);
  /*  Gradients  */
  --gradients-white-green-primary: linear-gradient(
    to right,
    var(--palette-simple-white),
    var(--palette-simple-green)
  );
  /* Theme: light */
  /* background */
}
```

<!-- /md:generate -->

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

#### Referencing Fluid Typography

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
            "2": "spacing.custom.size.value.2",
            "3": "spacing.custom.size.value.3",
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
            "2": "spacing.custom.size.value.2",
            "3": "spacing.custom.size.value.3",
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

- [Basic Setup](./example/basic)
- [] Tailwind

## TODO

- [] Module: Custom Media Queries
  https://www.w3.org/TR/mediaqueries-5/#at-ruledef-custom-media
- [] Typography : Line Height
- [] Stable schema spec
- [] VSCode Extension
- [] Bundlers Plugin (Vite, Rollup, Webpack ...)
- [] Nuxt Module

## License

MIT
