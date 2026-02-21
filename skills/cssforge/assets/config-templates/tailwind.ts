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
