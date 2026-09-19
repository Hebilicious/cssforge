import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(scriptDir, "..");

const packageJsonPath = path.join(packageRoot, "package.json");
const jsrJsonPath = path.join(packageRoot, "jsr.json");

const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
const jsrJsonSource = fs.readFileSync(jsrJsonPath, "utf8");

// Rewrite the version in place so the file keeps the repository formatting.
const versionPattern = /("version"\s*:\s*")[^"]*(")/;
if (!versionPattern.test(jsrJsonSource)) {
	throw new Error(`No version field found in ${jsrJsonPath}`);
}

const updatedJsrJsonSource = jsrJsonSource.replace(
	versionPattern,
	`$1${packageJson.version}$2`,
);

JSON.parse(updatedJsrJsonSource);

fs.writeFileSync(jsrJsonPath, updatedJsrJsonSource);
