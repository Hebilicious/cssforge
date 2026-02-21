import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(scriptDir, "..");

const packageJsonPath = path.join(packageRoot, "package.json");
const jsrJsonPath = path.join(packageRoot, "jsr.json");

const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
const jsrJson = JSON.parse(fs.readFileSync(jsrJsonPath, "utf8"));

jsrJson.version = packageJson.version;

fs.writeFileSync(jsrJsonPath, `${JSON.stringify(jsrJson, null, 2)}\n`);
