import { defineConfig } from "@hebilicious/cssforge";

export default defineConfig({
  colors: {
    palette: {
      value: {
        brand: {
          value: {
            primary: "#1d4ed8",
            accent: "#f97316",
            surface: "#0f172a",
          },
        },
        another: {
          value: {
            yellow: "#FFFF00",
            cyan: "#00FFFF",
          },
          settings: {
            // Declared on the root element so the theme aliases below, which are
            // computed on :root, can substitute these tokens.
            selector: ":root.Another",
          },
        },
      },
      settings: {
        // Generate a hex value for every palette color, gated by
        // `@supports not (color: oklch(0% 0 0))`, so the example keeps working in
        // a browser without `oklch()` support. `tests/oklch-fallback.spec.ts`
        // asserts the gate from the browser.
        color: { formats: ["hex"] },
      },
    },
    theme: {
      light: {
        value: {
          background: {
            value: {
              primary: "var(--1)",
            },
            variables: {
              1: "palette.brand.primary",
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
            },
            variables: {
              1: "palette.another.yellow",
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
    },
  },
  spacing: {
    custom: {
      size: {
        value: {
          1: "4px",
          2: "8px",
          3: "12px",
          4: "16px",
        },
      },
    },
  },
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
          negativeSteps: 1,
          positiveSteps: 2,
          prefix: "text",
        },
      },
    },
  },
});
