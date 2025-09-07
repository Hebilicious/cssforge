// primitives_test.ts
import { assertEquals } from "jsr:@std/assert";
import { processPrimitives } from "../src/modules/primitive.ts";
import { defineConfig } from "../src/mod.ts";

Deno.test("processPrimitives - processes button with variables", () => {
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
    spacing: {
      size: {
        value: {
          2: "0.5rem",
          3: "0.75rem",
        },
      },
    },
    primitives: {
      button: {
        value: {
          small: {
            value: {
              width: "120px",
              height: "40px",
              fontSize: "var(--base)",
              radius: "8px",
              padding: "var(--2) var(--3)",
            },
            variables: {
              "base": "typography.arial.typescale@base",
              "2": "spacing.size.value.2",
              "3": "spacing.size.value.3",
            },
            settings: { pxToRem: false },
          },
        },
      },
    },
  });

  const result = processPrimitives(config);
  const expected =
    "/* button */\n--button-small-width: 120px;\n--button-small-height: 40px;\n--button-small-fontSize: var(--typography-arial-base);\n--button-small-radius: 8px;\n--button-small-padding: var(--size-2) var(--size-3);";

  assertEquals(result.css, expected);
});

Deno.test("processPrimitives - processes buttons with settings", () => {
  const config = defineConfig({
    primitives: {
      button: {
        value: {
          small: {
            value: {
              width: "120px",
              height: "40px",
              radius: "8px",
            },
            settings: { pxToRem: false },
          },
          big: {
            value: {
              width: "240px",
              height: "80px",
              radius: "16px",
            },
            settings: { pxToRem: true },
          },
        },
      },
    },
  });

  const result = processPrimitives(config);
  const expected =
    "/* button */\n--button-small-width: 120px;\n--button-small-height: 40px;\n--button-small-radius: 8px;\n--button-big-width: 15rem;\n--button-big-height: 5rem;\n--button-big-radius: 1rem;";

  assertEquals(result.css, expected);
});

Deno.test("processPrimitives - references colors, gradients, and themes", () => {
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
    primitives: {
      card: {
        value: {
          default: {
            value: {
              "background-color": "var(--bg)",
              "background-image": "var(--grad)",
              "border-color": "var(--border)",
            },
            variables: {
              "bg": "colors.theme.value.light.background.primary",
              "grad": "colors.gradients.value.orangeGradient.primary",
              "border": "colors.palette.value.coral.50",
            },
          },
        },
      },
    },
  });

  const result = processPrimitives(config);
  const expected = [
    "/* card */",
    "--card-default-background-color: var(--theme-light-background-primary);",
    "--card-default-background-image: var(--gradient-orangeGradient-primary);",
    "--card-default-border-color: var(--color-coral-50);",
  ].join("\n");

  assertEquals(result.css, expected);
});
