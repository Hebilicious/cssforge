import { defineConfig } from "@hebilicious/cssforge";

export default defineConfig({
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
        brand: {
          value: {
            primary: "#1d4ed8",
            primaryHover: { mix: { from: "palette.brand.primary", with: "black", amount: 15 } },
            accent: "#f97316",
            accentHover: { mix: { from: "palette.brand.accent", with: "black", amount: 15 } },
            accentSubtle: { mix: { from: "palette.brand.accent", with: "transparent", amount: 88 } },
          },
        },
      },
    },
    theme: {
      value: {
        light: {
          value: {
            background: {
              value: { primary: "var(--white)", secondary: "var(--gray)" },
              variables: { white: "palette.neutral.white", gray: "palette.neutral.gray" },
            },
            text: {
              value: { body: "var(--black)", muted: "var(--gray)" },
              variables: { black: "palette.neutral.black", gray: "palette.neutral.gray" },
            },
          },
        },
        dark: {
          value: {
            background: {
              value: { primary: "var(--black)", secondary: "var(--gray)" },
              variables: { black: "palette.neutral.black", gray: "palette.neutral.gray" },
            },
            text: {
              value: { body: "var(--white)", muted: "var(--gray)" },
              variables: { white: "palette.neutral.white", gray: "palette.neutral.gray" },
            },
          },
        },
      },
      settings: {
        lightDark: {
          light: "light",
          dark: "dark",
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
  motion: {
    duration: {
      ui: {
        value: {
          press: "100ms",
          tooltip: "150ms",
          dropdown: "200ms",
        },
      },
    },
    easing: {
      ui: {
        value: {
          out: "cubic-bezier(0.23, 1, 0.32, 1)",
          inOut: "cubic-bezier(0.77, 0, 0.175, 1)",
        },
      },
    },
  },
});
