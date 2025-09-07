import { defineConfig } from "../../src/mod.ts";

export default defineConfig(
  {
    spacing: {
      size: {
        value: {
          1: "0.25rem",
          2: "0.5rem",
          3: "0.75rem",
          4: "1rem",
        },
      },
    },
    typography: {
      default: {
        typescale: {
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
  } as const,
);
