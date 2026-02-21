import { defineConfig } from "@hebilicious/cssforge";

export default defineConfig({
  colors: {
    palette: {
      value: {
        forge: {
          value: {
            // Anvil neon accents
            cyan: "#00f3ff",
            magenta: "#ff00a0",

            // Backgrounds
            void: "#030206",
            space: "#140d26",
            "space-light": "#1c1333",

            // Metal surfaces
            "metal-1": "#08080c",
            "metal-2": "#111118",
            "metal-3": "#15151c",
            "metal-4": "#1a1a24",
            "metal-5": "#2a2a35",
            "metal-6": "#2b2b3a",
            "metal-7": "#3b3b4f",
            "metal-8": "#44445c",
            "metal-9": "#555568",
            "metal-10": "#6a6a82",

            // Text
            white: "#ffffff",
            "text-1": "#e0e0f0",
            "text-2": "#8888aa",
            "text-3": "#555570",
          },
        },
      },
    },
  },
  spacing: {
    fluid: {
      space: {
        value: {
          minSize: 4,
          maxSize: 24,
          minWidth: 320,
          maxWidth: 1280,
          negativeSteps: [0],
          positiveSteps: [2, 3, 4, 5],
          prefix: "space",
        },
      },
    },
  },
  typography: {
    fluid: {
      docs: {
        value: {
          minWidth: 320,
          minFontSize: 15,
          minTypeScale: 1.2,
          maxWidth: 1280,
          maxFontSize: 18,
          maxTypeScale: 1.25,
          negativeSteps: 1,
          positiveSteps: 3,
          prefix: "text",
        },
      },
    },
  },
});
