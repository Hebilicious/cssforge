import { assertEquals } from "@std/assert";
import { defineConfig, processColors } from "../src/mod.ts";
import { getLines } from "./helpers.ts";

Deno.test("processColors - converts hex to oklch", () => {
  const config = defineConfig({
    colors: {
      palette: {
        value: {
          coral: {
            100: { hex: "#FF7F50" },
            200: { hex: "#FF6347" },
          },
        },
      },
    },
  });

  const { css, resolveMap } = processColors(config.colors);
  const lines = getLines(css);
  assertEquals(
    lines[1].trim(),
    "--palette-coral-100: oklch(73.511% 0.16799 40.24666);",
  );
  assertEquals(
    lines[2].trim(),
    "--palette-coral-200: oklch(69.622% 0.19552 32.32143);",
  );
  assertEquals(Array.from(resolveMap.keys()), [
    "palette.value.coral.100",
    "palette.value.coral.200",
  ]);
});

Deno.test("processColors - handles different color formats", () => {
  const config = defineConfig(
    {
      colors: {
        palette: {
          value: {
            brand: {
              default: { hex: "#FF0000" },
              200: { rgb: [0, 255, 0] },
              300: { hsl: [240, 100, 50] },
              400: { oklch: "oklch(0.7 0.2 270)" },
            },
          },
        },
      },
    } as const,
  );
  const { css, resolveMap } = processColors(config.colors);
  const lines = getLines(css);

  assertEquals(
    lines[1].trim(),
    "--palette-brand-200: oklch(86.644% 0.29483 142.49535);",
  );
  assertEquals(
    lines[2].trim(),
    "--palette-brand-300: oklch(45.201% 0.31321 264.05202);",
  );
  assertEquals(lines[3].trim(), "--palette-brand-400: oklch(70% 0.2 270);");
  assertEquals(
    lines[4].trim(),
    "--palette-brand-default: oklch(62.796% 0.25768 29.23388);",
  );

  assertEquals(Array.from(resolveMap.keys()), [
    "palette.value.brand.200",
    "palette.value.brand.300",
    "palette.value.brand.400",
    "palette.value.brand.default",
  ]);
});

Deno.test("processColors - handles string values", () => {
  const config = defineConfig({
    colors: {
      palette: {
        value: {
          simple: {
            white: "oklch(100% 0 0)",
            black: "#000",
          },
        },
      },
    },
  });
  const { css, resolveMap } = processColors(config.colors);
  const lines = getLines(css);
  assertEquals(
    lines[1].trim(),
    "--palette-simple-white: oklch(100% 0 0);",
  );
  assertEquals(
    lines[2].trim(),
    "--palette-simple-black: oklch(0% 0 0);",
  );
  assertEquals(Array.from(resolveMap.keys()), [
    "palette.value.simple.white",
    "palette.value.simple.black",
  ]);
});

Deno.test("processColors - handles themes", () => {
  const config = defineConfig({
    colors: {
      palette: {
        value: {
          simple: {
            white: "oklch(100% 0 0)",
            black: { hex: "#000" },
          },
        },
      },
      theme: {
        value: {
          light: {
            background: {
              value: {
                primary: "var(--1)",
                secondary: "var(--2)",
              },
              variables: {
                1: "palette.value.simple.white",
                2: "palette.value.simple.black",
              },
            },
          },
        },
      },
    },
  });
  const { css, resolveMap } = processColors(config.colors);
  const lines = getLines(css);
  assertEquals(
    lines[5].trim(),
    "--theme-light-background-primary: var(--palette-simple-white);",
  );
  assertEquals(
    lines[6].trim(),
    "--theme-light-background-secondary: var(--palette-simple-black);",
  );
  assertEquals(Array.from(resolveMap.keys()), [
    "palette.value.simple.white",
    "palette.value.simple.black",
    "theme.value.light.background.primary",
    "theme.value.light.background.secondary",
  ]);
});

Deno.test("processColors - handles transparency", () => {
  const config = defineConfig({
    colors: {
      palette: {
        value: {
          alpha: {
            softGray1: "oklch(14.48% 0 0 / 12%)",
            softGray2: "oklch(14.48% 0 0 / 24%)",
          },
        },
      },
    },
  });
  const { css, resolveMap } = processColors(config.colors);
  const lines = getLines(css);
  assertEquals(
    lines[1],
    "--palette-alpha-softGray1: oklch(14.48% 0 0 / 12%);",
  );
  assertEquals(
    lines[2],
    "--palette-alpha-softGray2: oklch(14.48% 0 0 / 24%);",
  );
  assertEquals(Array.from(resolveMap.keys()), [
    "palette.value.alpha.softGray1",
    "palette.value.alpha.softGray2",
  ]);
});

Deno.test("processColors - generates gradient with color variables", () => {
  const config = defineConfig({
    colors: {
      palette: {
        value: {
          coral: {
            "50": { hex: "#FF7E60" },
            "90": { hex: "#FF7F40" },
            "100": { hex: "#FF6347" },
          },
          indigo: {
            "100": { hex: "#4F46E5" },
          },
        },
      },
      gradients: {
        value: {
          orangeGradient: {
            value: {
              primary: {
                value:
                  "linear-gradient(261.78deg, var(--1) 33.1%, var(--2) 56.3%, var(--3) 65.78%, var(--4) 84.23%)",
                variables: {
                  "1": "palette.value.coral.50",
                  "2": "palette.value.coral.90",
                  "3": "palette.value.coral.100",
                  "4": "palette.value.indigo.100",
                },
              },
            },
          },
        },
      },
    },
  });

  const result = processColors(config.colors);
  const lines = getLines(result.css);
  const expected = [
    "--gradients-orangeGradient-primary: linear-gradient(261.78deg, var(--palette-coral-50) 33.1%, var(--palette-coral-90) 56.3%, var(--palette-coral-100) 65.78%, var(--palette-indigo-100) 84.23%);",
  ].join("\n");

  assertEquals(lines.at(-1), expected);
  assertEquals(Array.from(result.resolveMap.keys()), [
    "palette.value.coral.50",
    "palette.value.coral.90",
    "palette.value.coral.100",
    "palette.value.indigo.100",
    "gradients.value.orangeGradient.primary",
  ]);
});

Deno.test("processColors - handles themes referencing gradients", () => {
  const config = defineConfig({
    colors: {
      palette: {
        value: {
          coral: {
            "50": { hex: "#FF7E60" },
          },
        },
      },
      gradients: {
        value: {
          orangeGradient: {
            value: {
              primary: {
                value: "linear-gradient(to right, var(--c1), var(--c2))",
                variables: {
                  "c1": "palette.value.coral.50",
                  "c2": "palette.value.coral.50",
                },
              },
            },
          },
        },
      },
      theme: {
        value: {
          light: {
            background: {
              value: {
                primary: "var(--grad)",
              },
              variables: {
                "grad": "gradients.value.orangeGradient.primary",
              },
            },
          },
        },
      },
    },
  });

  const { css, resolveMap } = processColors(config.colors);
  const lines = getLines(css);
  const lastLine = lines.pop();
  assertEquals(
    lastLine,
    "--theme-light-background-primary: var(--gradients-orangeGradient-primary);",
  );
  assertEquals(Array.from(resolveMap.keys()), [
    "palette.value.coral.50",
    "gradients.value.orangeGradient.primary",
    "theme.value.light.background.primary",
  ]);
});
