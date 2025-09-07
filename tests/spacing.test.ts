// spacing_test.ts
import { assertEquals } from "jsr:@std/assert";
import { processSpacing } from "../src/modules/spacing.ts";
import { defineConfig } from "../src/config.ts";

Deno.test("processSpacing - generates correct spacing scale", () => {
  const config = defineConfig({
    spacing: {
      size: {
        value: { 1: "0.25rem", 2: "0.5rem", 3: "0.75rem", s: "16px" },
      },
    },
  });

  const result = processSpacing(config.spacing);
  const expected =
    "--size-1: 0.25rem;\n--size-2: 0.5rem;\n--size-3: 0.75rem;\n--size-s: 1rem;";
  assertEquals(result.css, expected);
});

// Test with string keys
Deno.test("processSpacing - handles settings", () => {
  const config = defineConfig({
    spacing: {
      size: {
        value: { 1: "16px", 2: "0.5rem" },
        settings: { pxToRem: true },
      },
      scale: {
        value: { "md": "8px", "lg": "0.75rem" },
        settings: { pxToRem: false },
      },
    },
  });

  const result = processSpacing(config.spacing);
  const expected =
    "--size-1: 1rem;\n--size-2: 0.5rem;\n--scale-md: 8px;\n--scale-lg: 0.75rem;";

  assertEquals(result.css, expected);
});
