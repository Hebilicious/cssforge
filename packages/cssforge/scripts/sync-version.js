import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(scriptDir, "..");

const packageJsonPath = path.join(packageRoot, "package.json");
const denoJsonPath = path.join(packageRoot, "deno.json");

const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
const denoJson = JSON.parse(fs.readFileSync(denoJsonPath, "utf8"));

denoJson.version = packageJson.version;

fs.writeFileSync(denoJsonPath, `${JSON.stringify(denoJson, null, 2)}\n`);
