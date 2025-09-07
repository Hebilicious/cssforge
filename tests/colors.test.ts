import { assertEquals } from "jsr:@std/assert";
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

  const { css } = processColors(config.colors);
  const lines = getLines(css);
  assertEquals(
    lines[1].trim(),
    "--color-coral-100: oklch(73.511% 0.16799 40.24666);",
  );
  assertEquals(
    lines[2].trim(),
    "--color-coral-200: oklch(69.622% 0.19552 32.32143);",
  );
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
  const { css } = processColors(config.colors);
  const lines = getLines(css);

  assertEquals(
    lines[1].trim(),
    "--color-brand-200: oklch(86.644% 0.29483 142.49535);",
  );
  assertEquals(
    lines[2].trim(),
    "--color-brand-300: oklch(45.201% 0.31321 264.05202);",
  );
  assertEquals(lines[3].trim(), "--color-brand-400: oklch(70% 0.2 270);");
  assertEquals(
    lines[4].trim(),
    "--color-brand-default: oklch(62.796% 0.25768 29.23388);",
  );
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
  const { css } = processColors(config.colors);
  const lines = getLines(css);
  assertEquals(
    lines[1].trim(),
    "--color-simple-white: oklch(100% 0 0);",
  );
  assertEquals(
    lines[2].trim(),
    "--color-simple-black: oklch(0% 0 0);",
  );
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
                1: "colors.palette.value.simple.white",
                2: "colors.palette.value.simple.black",
              },
            },
          },
        },
      },
    },
  });
  const { css } = processColors(config.colors);
  const lines = getLines(css);
  assertEquals(
    lines[5].trim(),
    "--theme-light-background-primary: var(--color-simple-white);",
  );
  assertEquals(
    lines[6].trim(),
    "--theme-light-background-secondary: var(--color-simple-black);",
  );
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
  const { css } = processColors(config.colors);
  const lines = getLines(css);
  assertEquals(
    lines[1].trim(),
    "--color-alpha-softGray1: oklch(14.48% 0 0 / 12%);",
  );
  assertEquals(
    lines[2].trim(),
    "--color-alpha-softGray2: oklch(14.48% 0 0 / 24%);",
  );
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
                  "1": "colors.palette.value.coral.50",
                  "2": "colors.palette.value.coral.90",
                  "3": "colors.palette.value.coral.100",
                  "4": "colors.palette.value.indigo.100",
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
  const expected =
    `--gradient-orangeGradient-primary: linear-gradient(261.78deg, var(--color-coral-50) 33.1%, var(--color-coral-90) 56.3%, var(--color-coral-100) 65.78%, var(--color-indigo-100) 84.23%);`;

  assertEquals(lines.at(-1), expected);
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
                  "c1": "colors.palette.value.coral.50",
                  "c2": "colors.palette.value.coral.50",
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
                "grad": "colors.gradients.value.orangeGradient.primary",
              },
            },
          },
        },
      },
    },
  });

  const { css } = processColors(config.colors);
  const lines = getLines(css);
  const lastLine = lines.pop()?.trim();
  assertEquals(
    lastLine,
    "--theme-light-background-primary: var(--gradient-orangeGradient-primary);",
  );
});
