import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../../..");
const readmePath = resolve(root, "packages/cssforge/README.md");
const outputPath = resolve(root, "packages/docs/docs.md");

const readme = readFileSync(readmePath, "utf-8");

const GITHUB_BASE =
  "https://github.com/Hebilicious/cssforge/tree/main";

let content = readme;

// Transform GitHub-flavored alerts to VitePress containers
content = content.replace(
  /^> \[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\n((?:> .*\n?)*)/gm,
  (_match, type: string, body: string) => {
    const containerType = type.toLowerCase();
    const text = body
      .split("\n")
      .map((line: string) => line.replace(/^> ?/, ""))
      .join("\n")
      .trim();
    return `::: ${containerType}\n${text}\n:::\n`;
  },
);

// Replace relative links like ./example/ with GitHub URLs
content = content.replace(
  /\]\(\.\/([\w/.-]+)\)/g,
  `](${GITHUB_BASE}/$1)`,
);

// Prepend VitePress frontmatter
const frontmatter = `---
title: Documentation
outline: [2, 3]
---

`;

writeFileSync(outputPath, frontmatter + content, "utf-8");
console.log(`Synced README → ${outputPath}`);
