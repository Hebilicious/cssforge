import { assertEquals } from "jsr:@std/assert";
import { defineConfig, processTypography } from "../src/mod.ts";
import { getLines } from "./helpers.ts";

Deno.test("processTypography - generates correct CSS variables", () => {
  const config = defineConfig({
    typography: {
      arial: {
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
  });

  const expectedSizes = [
    "4xl",
    "3xl",
    "2xl",
    "xl",
    "lg",
    "base",
    "sm",
    "xs",
    "2xs",
  ];
  const result = processTypography(config.typography);
  const lines = getLines(result.css);
  assertEquals(lines.length, expectedSizes.length);

  // Test a specific value for precision
  const xlLine = lines.find((line) => line.includes("--typography-arial-xl:"));
  assertEquals(
    xlLine?.trim(),
    "--typography-arial-xl: clamp(1.3672rem, 1.3111rem + 0.2803vw, 1.5625rem);",
  );

  // Test that we have all the expected size variables
  expectedSizes.forEach((size) => {
    const hasSize = lines.some((line) => line.includes(`--typography-arial-${size}:`));
    assertEquals(hasSize, true, `Missing size ${size}`);
  });
});

Deno.test("typography - can handle custom labels and prefixes", () => {
  const config = defineConfig({
    typography: {
      arial: {
        typescale: {
          value: {
            minWidth: 320,
            minFontSize: 14,
            minTypeScale: 1.25,
            maxWidth: 1435,
            maxFontSize: 16,
            maxTypeScale: 1.25,
            positiveSteps: 7,
            negativeSteps: 2,
            prefix: "text",
          },
          settings: {
            customLabel: {
              "-2": "xs",
              "-1": "s",
              "0": "m",
              "1": "l",
              "2": "xl",
              "3": "xxl",
              "4": "h4",
              "5": "h3",
              "6": "h2",
              "7": "h1",
            },
          },
        },
      },
    },
  });

  const expectedSizes = [
    "xs",
    "s",
    "m",
    "l",
    "xl",
    "xxl",
    "h4",
    "h3",
    "h2",
    "h1",
  ];
  const result = processTypography(config.typography);
  const lines = getLines(result.css);
  assertEquals(lines.length, expectedSizes.length);

  // Test a specific value for precision
  const xlLine = lines.find((line) => line.includes("--typography-text-xl:"));
  assertEquals(
    xlLine?.trim(),
    "--typography-text-xl: clamp(1.3672rem, 1.3111rem + 0.2803vw, 1.5625rem);",
  );

  // Test that we have all the expected size variables
  expectedSizes.forEach((size) => {
    const hasSize = lines.some((line) => line.includes(`--typography-text-${size}:`));
    assertEquals(hasSize, true, `Missing size ${size}`);
  });
});

Deno.test("processTypography - can process weights", () => {
  const positiveSteps = 3;
  const negativeSteps = 3;
  const config = defineConfig({
    typography: {
      arial: {
        weight: {
          value: {
            regular: "500",
          },
        },
        typescale: {
          value: {
            minWidth: 320,
            minFontSize: 14,
            minTypeScale: 1.25,
            maxWidth: 1435,
            maxFontSize: 16,
            maxTypeScale: 1.25,
            positiveSteps,
            negativeSteps,
          },
        },
      },
    },
  });

  const result = processTypography(config.typography);
  const lines = getLines(result.css);
  assertEquals(lines.length, positiveSteps + negativeSteps + 1 + 1); // 1 for base size and 1 for weight

  // Test that we have the weight variable
  const xlLine = lines.find((line) => line.includes("--weight-arial-regular:"));
  assertEquals(
    xlLine?.trim(),
    "--weight-arial-regular: 500;",
  );
});
