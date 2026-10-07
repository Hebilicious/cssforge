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
          },
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
});
