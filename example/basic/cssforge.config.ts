import { defineConfig } from "../../src/mod.ts";

export default defineConfig(
  {
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
          },
        },
      },
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
        base: {
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
          // dark-mode overrides wrapped in a condition
          coral_dark: {
            value: {
              100: { hex: "#FF6347" },
            },
            settings: {
              condition: "@media (prefers-color-scheme: dark)",
            },
          },
          mint_dark: {
            value: {
              100: { hex: "#22C55E" },
            },
            settings: {
              condition: "@media (prefers-color-scheme: dark)",
            },
          },
          indigo_dark: {
            value: {
              100: { hex: "#4338CA" },
            },
            settings: {
              condition: "@media (prefers-color-scheme: dark)",
            },
          },
        },
      },
      theme: {
        main: {
          value: {
            background: {
              value: {
                primary: "var(--coral)",
                secondary: "var(--mint)",
              },
              variables: {
                coral: "palette.coral.100",
                mint: "palette.mint.100",
              },
            },
          },
        },
      },
    },
  },
);
