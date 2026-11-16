/**
 * Writes the AcidCat catalog of the CSS Forge tools, `cssforge.acidcat.json`,
 * from the application in `src/capabilities.ts`.
 *
 * The application is the source of the catalog; never edit the JSON by hand.
 * `tests/acidcat.test.ts` fails when the committed catalog differs from the
 * one the application writes.
 *
 * Usage: node ./scripts/catalog.ts
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderCatalog } from "@acid-cat/core-ts";
import { cssforge, toJsonSchema } from "../src/capabilities.ts";

const catalogPath = resolve(import.meta.dirname, "../cssforge.acidcat.json");

writeFileSync(catalogPath, renderCatalog(cssforge, { toJsonSchema }));
console.log(`Wrote ${catalogPath}`);
