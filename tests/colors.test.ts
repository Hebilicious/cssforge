import { assert, assertEquals } from "@std/assert";
import { assertSnapshot } from "@std/testing/snapshot";
import { defineConfig, processColors } from "../src/mod.ts";
import { getLines } from "./helpers.ts";

Deno.test("processColors - converts hex to oklch", async (t) => {
  const config = defineConfig({
    colors: {
      palette: {
        value: {
          coral: {
            value: {
              100: { hex: "#FF7F50" },
              200: { hex: "#FF6347" },
            },
          },
        },
      },
    },
  });

  const { css, resolveMap } = processColors(config.colors);
  const lines = getLines(css);
  assertEquals(
    lines[2].trim(),
    "--palette-coral-100: oklch(73.511% 0.16799 40.24666);",
  );
  assertEquals(
    lines[3].trim(),
    "--palette-coral-200: oklch(69.622% 0.19552 32.32143);",
  );
  assertEquals(Array.from(resolveMap.keys()), [
    "palette.coral.100",
    "palette.coral.200",
  ]);
  await assertSnapshot(t, css);
  await assertSnapshot(t, Array.from(resolveMap.entries()));
});

Deno.test("processColors - handles different color formats", async (t) => {
  const config = defineConfig(
    {
      colors: {
        palette: {
          value: {
            brand: {
              value: {
                default: { hex: "#FF0000" },
                200: { rgb: [0, 255, 0] },
                300: { hsl: [240, 100, 50] },
                400: { oklch: "oklch(0.7 0.2 270)" },
              },
            },
          },
        },
      },
    } as const,
  );
  const { css, resolveMap } = processColors(config.colors);
  const lines = getLines(css);

  assertEquals(
    lines[2].trim(),
    "--palette-brand-200: oklch(86.644% 0.29483 142.49535);",
  );
  assertEquals(
    lines[3].trim(),
    "--palette-brand-300: oklch(45.201% 0.31321 264.05202);",
  );
  assertEquals(lines[4].trim(), "--palette-brand-400: oklch(70% 0.2 270);");
  assertEquals(
    lines[5].trim(),
    "--palette-brand-default: oklch(62.796% 0.25768 29.23388);",
  );

  assertEquals(Array.from(resolveMap.keys()), [
    "palette.brand.200",
    "palette.brand.300",
    "palette.brand.400",
    "palette.brand.default",
  ]);
  await assertSnapshot(t, css);
  await assertSnapshot(t, Array.from(resolveMap.entries()));
});

Deno.test("processColors - handles string values", async (t) => {
  const config = defineConfig({
    colors: {
      palette: {
        value: {
          simple: {
            value: {
              white: "oklch(100% 0 0)",
              black: "#000",
            },
          },
        },
      },
    },
  });
  const { css, resolveMap } = processColors(config.colors);
  const lines = getLines(css);
  assertEquals(
    lines[2].trim(),
    "--palette-simple-white: oklch(100% 0 0);",
  );
  assertEquals(
    lines[3].trim(),
    "--palette-simple-black: oklch(0% 0 0);",
  );
  assertEquals(Array.from(resolveMap.keys()), [
    "palette.simple.white",
    "palette.simple.black",
  ]);
  await assertSnapshot(t, css);
  await assertSnapshot(t, Array.from(resolveMap.entries()));
});

Deno.test("processColors - handles themes", async (t) => {
  const config = defineConfig({
    colors: {
      palette: {
        value: {
          simple: {
            value: {
              white: "oklch(100% 0 0)",
              black: { hex: "#000" },
            },
          },
        },
      },
      theme: {
        light: {
          value: {
            background: {
              value: {
                primary: "var(--1)",
                secondary: "var(--2)",
              },
              variables: {
                1: "palette.simple.white",
                2: "palette.simple.black",
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
    lines[7].trim(),
    "--theme-light-background-primary: var(--palette-simple-white);",
  );
  assertEquals(
    lines[8].trim(),
    "--theme-light-background-secondary: var(--palette-simple-black);",
  );
  assertEquals(Array.from(resolveMap.keys()), [
    "palette.simple.white",
    "palette.simple.black",
    "theme.light.background.primary",
    "theme.light.background.secondary",
  ]);
  await assertSnapshot(t, css);
  await assertSnapshot(t, Array.from(resolveMap.entries()));
});

Deno.test("processColors - handles transparency", async (t) => {
  const config = defineConfig({
    colors: {
      palette: {
        value: {
          alpha: {
            value: {
              softGray1: "oklch(14.48% 0 0 / 12%)",
              softGray2: "oklch(14.48% 0 0 / 24%)",
            },
          },
        },
      },
    },
  });
  const { css, resolveMap } = processColors(config.colors);
  const lines = getLines(css);
  assertEquals(
    lines[2].trim(),
    "--palette-alpha-softGray1: oklch(14.48% 0 0 / 12%);",
  );
  assertEquals(
    lines[3].trim(),
    "--palette-alpha-softGray2: oklch(14.48% 0 0 / 24%);",
  );
  assertEquals(Array.from(resolveMap.keys()), [
    "palette.alpha.softGray1",
    "palette.alpha.softGray2",
  ]);
  await assertSnapshot(t, css);
  await assertSnapshot(t, Array.from(resolveMap.entries()));
});

Deno.test("processColors - generates gradient with color variables", async (t) => {
  const config = defineConfig({
    colors: {
      palette: {
        value: {
          coral: {
            value: {
              "50": { hex: "#FF7E60" },
              "90": { hex: "#FF7F40" },
              "100": { hex: "#FF6347" },
            },
          },
          indigo: {
            value: {
              "100": { hex: "#4F46E5" },
            },
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
                  "1": "palette.coral.50",
                  "2": "palette.coral.90",
                  "3": "palette.coral.100",
                  "4": "palette.indigo.100",
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
    "palette.coral.50",
    "palette.coral.90",
    "palette.coral.100",
    "palette.indigo.100",
    "gradients.orangeGradient.primary",
  ]);
  await assertSnapshot(t, result.css);
  await assertSnapshot(t, Array.from(result.resolveMap.entries()));
});

Deno.test("processColors - handles themes referencing gradients", async (t) => {
  const config = defineConfig({
    colors: {
      palette: {
        value: {
          coral: {
            value: {
              "50": { hex: "#FF7E60" },
            },
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
                  "c1": "palette.coral.50",
                  "c2": "palette.coral.50",
                },
              },
            },
          },
        },
      },
      theme: {
        light: {
          value: {
            background: {
              value: {
                primary: "var(--grad)",
              },
              variables: {
                "grad": "gradients.orangeGradient.primary",
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
    "palette.coral.50",
    "gradients.orangeGradient.primary",
    "theme.light.background.primary",
  ]);
  await assertSnapshot(t, css);
  await assertSnapshot(t, Array.from(resolveMap.entries()));
});

Deno.test("processColors - handles gradients with conditions", async (t) => {
  const config = defineConfig({
    colors: {
      palette: {
        value: {
          coral: {
            value: {
              "50": { hex: "#FF7E60" },
            },
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
                  "c1": "palette.coral.50",
                  "c2": "palette.coral.50",
                },
              },
            },
            settings: {
              condition: "@media (prefers-color-scheme: dark)",
            },
          },
        },
      },
    },
  });

  const { css, resolveMap } = processColors(config.colors);
  const lines = getLines(css);

  const mediaQueryIndex = lines.findIndex((line) =>
    line.includes("@media (prefers-color-scheme: dark)")
  );

  assertEquals(lines[mediaQueryIndex], "@media (prefers-color-scheme: dark) {");

  const varIndex = lines.findIndex((line, idx) =>
    idx > mediaQueryIndex && line.includes("--gradients-orangeGradient-primary:")
  );

  assert(
    varIndex > mediaQueryIndex,
    "Gradient variable should be inside the media query block",
  );

  assertEquals(
    lines[varIndex].trim(),
    "--gradients-orangeGradient-primary: linear-gradient(to right, var(--palette-coral-50), var(--palette-coral-50));",
  );

  assertEquals(Array.from(resolveMap.keys()), [
    "palette.coral.50",
    "gradients.orangeGradient.primary",
  ]);
  await assertSnapshot(t, css);
  await assertSnapshot(t, Array.from(resolveMap.entries()));
});

Deno.test("processColors - handles palette colors with conditions", async (t) => {
  const config = defineConfig({
    colors: {
      palette: {
        value: {
          background: {
            value: {
              light: "oklch(100% 0 0)",
            },
          },
          backgroundDark: {
            value: {
              dark: { hex: "#000" },
            },
            settings: {
              condition: "@media (prefers-color-scheme: dark)",
            },
          },
        },
      },
    },
  });
  const { css, resolveMap } = processColors(config.colors);
  const lines = getLines(css);

  assertEquals(
    lines[2].trim(),
    "--palette-background-light: oklch(100% 0 0);",
  );

  const mediaQueryIndex = lines.findIndex((line) =>
    line.includes("@media (prefers-color-scheme: dark)")
  );

  assertEquals(lines[mediaQueryIndex], "@media (prefers-color-scheme: dark) {");

  const darkVarIndex = lines.findIndex((line) =>
    line.includes("--palette-backgroundDark-dark:")
  );

  assertEquals(
    lines[darkVarIndex].trim(),
    "--palette-backgroundDark-dark: oklch(0% 0 0);",
  );

  const closingBraceIndex = lines.findIndex((line, idx) =>
    idx > mediaQueryIndex && line === "}"
  );
  assert(
    closingBraceIndex > darkVarIndex,
    "Closing brace should exist after variables",
  );

  assertEquals(Array.from(resolveMap.keys()), [
    "palette.background.light",
    "palette.backgroundDark.dark",
  ]);
  await assertSnapshot(t, css);
  await assertSnapshot(t, Array.from(resolveMap.entries()));
});

Deno.test("processColors - handles themes with class condition", async (t) => {
  const config = defineConfig({
    colors: {
      palette: {
        value: {
          base: {
            value: {
              primary: { hex: "#FF7F50" },
            },
          },
        },
      },
      theme: {
        dark: {
          value: {
            background: {
              value: {
                primary: "var(--1)",
              },
              variables: {
                "1": "palette.base.primary",
              },
            },
          },
          settings: {
            condition: ".dark-theme",
          },
        },
      },
    },
  });

  const { css, resolveMap } = processColors(config.colors);
  const lines = getLines(css);

  const classIndex = lines.findIndex((l) => l.includes(".dark-theme"));
  assertEquals(lines[classIndex], ".dark-theme {");

  const varIndex = lines.findIndex((l) => l.includes("--theme-dark-background-primary:"));
  assert(varIndex > classIndex, "theme variable should be inside the class block");

  assertEquals(Array.from(resolveMap.keys()), [
    "palette.base.primary",
    "theme.dark.background.primary",
  ]);
  await assertSnapshot(t, css);
  await assertSnapshot(t, Array.from(resolveMap.entries()));
});
