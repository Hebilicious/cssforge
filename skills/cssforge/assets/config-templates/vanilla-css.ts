import { defineConfig } from "@hebilicious/cssforge";

export default defineConfig({
  colors: {
    palette: {
      value: {
        neutral: {
          value: {
            white: "oklch(100% 0 none)",
            ink: "oklch(15% 0 none)",
          },
        },
        brand: {
          value: {
            primary: "#1d4ed8",
            primaryHover: { mix: { from: "palette.brand.primary", with: "black", amount: 15 } },
          },
        },
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
            text: {
              value: { body: "var(--ink)" },
              variables: { ink: "palette.neutral.ink" },
            },
          },
        },
        dark: {
          value: {
            background: {
              value: { primary: "var(--ink)" },
              variables: { ink: "palette.neutral.ink" },
            },
            text: {
              value: { body: "var(--white)" },
              variables: { white: "palette.neutral.white" },
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
          2: "8px",
          4: "16px",
        },
      },
    },
  },
});
