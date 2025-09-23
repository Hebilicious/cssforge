import fs from "node:fs";

// Read and parse package.json to get the new version
const packageJsonFile = fs.readFileSync("package.json", "utf8");
const packageJson = JSON.parse(packageJsonFile);
const newVersion = packageJson.version;

// Read the deno.json file as a string
const denoJsonContent = fs.readFileSync("deno.json", "utf8");

// Write the modified string back to deno.json
fs.writeFileSync(
  "deno.json",
  denoJsonContent.replace(/"version":\s*"[^"]*"/, `"version": "${newVersion}"`),
);
