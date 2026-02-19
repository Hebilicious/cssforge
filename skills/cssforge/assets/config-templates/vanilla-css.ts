import { defineConfig } from "@hebilicious/cssforge";

export default defineConfig({
  colors: {
    palette: {
      value: {
        brand: {
          value: {
            primary: "#1d4ed8",
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
          2: "8px",
          4: "16px",
        },
      },
    },
  },
});
