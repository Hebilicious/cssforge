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
});
