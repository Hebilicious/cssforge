import { assertEquals } from "@std/assert";
import { processPrimitives } from "../src/modules/primitive.ts";
import { defineConfig } from "../src/mod.ts";

Deno.test("processPrimitives - processes button with variables", () => {
  const config = defineConfig({
    typography: {
      fluid: {
        arial: {
          value: {
            minWidth: 320,
            minFontSize: 14,
            minTypeScale: 1.25,
            maxWidth: 1435,
            maxFontSize: 16,
            maxTypeScale: 1.25,
            positiveSteps: 5,
            negativeSteps: 3,
            prefix: "foo",
          },
        },
      },
    },
    spacing: {
      custom: {
        size: {
          value: {
            2: "0.5rem",
            3: "0.75rem",
          },
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
              "base": "typography_fluid.arial@m",
              "2": "spacing.custom.size.value.2",
              "3": "spacing.custom.size.value.3",
            },
            settings: { pxToRem: false },
          },
        },
      },
    },
  });

  const result = processPrimitives(config);
  const expected = [
    "/* button */",
    "--button-small-width: 120px;",
    "--button-small-height: 40px;",
    "--button-small-fontSize: var(--typography_fluid-arial-foo-m);",
    "--button-small-radius: 8px;",
    "--button-small-padding: var(--spacing-size-2) var(--spacing-size-3);",
  ].join("\n");

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
  const expected = [
    "/* button */",
    "--button-small-width: 120px;",
    "--button-small-height: 40px;",
    "--button-small-radius: 8px;",
    "--button-big-width: 15rem;",
    "--button-big-height: 5rem;",
    "--button-big-radius: 1rem;",
  ].join("\n");

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
              "bg": "theme.value.light.background.primary",
              "grad": "gradients.value.orangeGradient.primary",
              "border": "palette.value.coral.50",
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
    "--card-default-background-image: var(--gradients-orangeGradient-primary);",
    "--card-default-border-color: var(--palette-coral-50);",
  ].join("\n");

  assertEquals(result.css, expected);
});

Deno.test("processPrimitives - uses fluid spacing references", () => {
  const config = defineConfig({
    spacing: {
      fluid: {
        gap: {
          value: {
            minSize: 4,
            maxSize: 24,
            minWidth: 320,
            maxWidth: 1280,
            negativeSteps: [0],
            positiveSteps: [1],
            prefix: "gs",
          },
        },
      },
    },
    primitives: {
      box: {
        value: {
          default: {
            value: {
              padding: "var(--s) var(--m)",
            },
            variables: {
              "s": "spacing_fluid.gap@s",
              "m": "spacing_fluid.gap@m",
            },
            settings: { pxToRem: false },
          },
        },
      },
    },
  });
  const primitives = processPrimitives(config);
  const expected = [
    "/* box */",
    "--box-default-padding: var(--spacing_fluid-gap-gs-s) var(--spacing_fluid-gap-gs-m);",
  ].join("\n");
  assertEquals(primitives.css, expected);
});
