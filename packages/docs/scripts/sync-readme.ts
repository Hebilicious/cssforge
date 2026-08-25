import {
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";

interface MarkdownSection {
  title: string;
  body: string;
}

interface ParsedMarkdown {
  intro: string;
  sections: Map<string, MarkdownSection>;
}

interface GeneratedPage {
  path: string;
  title: string;
  description: string;
  content: string;
}

const root = resolve(import.meta.dirname, "../../..");
const docsRoot = resolve(root, "packages/docs");
const readmePath = resolve(root, "packages/cssforge/README.md");
const sourcePath = "packages/cssforge/README.md";
const githubBase = "https://github.com/Hebilicious/cssforge/tree/main";

function parseSections(markdown: string, level: number): ParsedMarkdown {
  const marker = "#".repeat(level);
  const matches = [
    ...markdown.matchAll(new RegExp(`^${marker} (.+)$`, "gm")),
  ];
  const intro = markdown.slice(0, matches[0]?.index ?? markdown.length).trim();
  const sections = new Map<string, MarkdownSection>();

  matches.forEach((match, index) => {
    const start = (match.index ?? 0) + match[0].length;
    const end = matches[index + 1]?.index ?? markdown.length;
    const title = match[1].trim();

    sections.set(title, {
      title,
      body: markdown.slice(start, end).trim(),
    });
  });

  return { intro, sections };
}

function requireSection(
  sections: Map<string, MarkdownSection>,
  title: string,
): MarkdownSection {
  const section = sections.get(title);

  if (!section) {
    throw new Error(`README section not found: ${title}`);
  }

  return section;
}

function renderSection(section: MarkdownSection, level = 2): string {
  return `${"#".repeat(level)} ${section.title}\n\n${section.body}`;
}

function renderTokenPage(section: MarkdownSection): string {
  return section.body.replace(/^#### /gm, "## ");
}

function renderTopLevelPage(section: MarkdownSection): string {
  return section.body.replace(/^### /gm, "## ");
}

function transformMarkdown(markdown: string): string {
  let content = markdown;

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

  return content.replace(
    /\]\(\.\/([\w/.-]+)\)/g,
    `](${githubBase}/$1)`,
  );
}

function renderPage(page: GeneratedPage): string {
  return `---
title: ${page.title}
description: ${page.description}
outline: [2, 3]
sourcePath: ${sourcePath}
---

# ${page.title}

${page.content.trim()}
`;
}

const readme = transformMarkdown(readFileSync(readmePath, "utf-8"));
const readmeSections = parseSections(readme, 2);
const configuration = requireSection(
  readmeSections.sections,
  "Configuration",
);
const configurationSections = parseSections(configuration.body, 3);
const readmeIntro = readmeSections.intro.replace(/^# CSS Forge\s*/, "").trim();

const pages: GeneratedPage[] = [
  {
    path: "guide/getting-started.md",
    title: "Getting started",
    description: "Install CSS Forge and generate your first design tokens.",
    content: [
      readmeIntro,
      renderSection(requireSection(readmeSections.sections, "Why")),
      renderSection(requireSection(readmeSections.sections, "Features")),
      renderSection(requireSection(readmeSections.sections, "Installation")),
      renderSection(requireSection(readmeSections.sections, "Quick Start")),
    ].join("\n\n"),
  },
  {
    path: "guide/configuration.md",
    title: "Configuration",
    description: "Understand the CSS Forge config shape and token references.",
    content: [
      "A CSS Forge config groups design tokens by family. Use the focused token pages for each family's complete schema and examples.",
      renderSection(
        requireSection(readmeSections.sections, "Referencing Variables"),
      ),
    ].join("\n\n"),
  },
  {
    path: "guide/usage.md",
    title: "Using CSS Forge",
    description: "Run CSS Forge from the CLI or its programmatic API.",
    content: [
      renderSection(requireSection(readmeSections.sections, "CLI Usage")),
      renderSection(
        requireSection(readmeSections.sections, "Programmatic Usage"),
      ),
      renderSection(requireSection(readmeSections.sections, "Best Practices")),
    ].join("\n\n"),
  },
  {
    path: "guide/style-dictionary.md",
    title: "Style Dictionary JSON",
    description:
      "Generate token JSON for Style Dictionary and compatible tools.",
    content: renderTopLevelPage(
      requireSection(readmeSections.sections, "Style Dictionary JSON"),
    ),
  },
  {
    path: "guide/examples.md",
    title: "Examples",
    description: "Explore CSS Forge integrations across popular frameworks.",
    content: requireSection(readmeSections.sections, "Examples").body,
  },
  ...["Colors", "Spacing", "Typography", "Primitives"].map(
    (title): GeneratedPage => ({
      path: `tokens/${title.toLowerCase()}.md`,
      title,
      description: `${title} configuration and generated-variable reference.`,
      content: renderTokenPage(
        requireSection(configurationSections.sections, title),
      ),
    }),
  ),
  {
    path: "contributing.md",
    title: "Contributing",
    description: "Develop CSS Forge locally and review the project roadmap.",
    content: [
      renderSection(
        requireSection(readmeSections.sections, "Contributing Workflow"),
      ),
      renderSection(requireSection(readmeSections.sections, "TODO")),
      renderSection(requireSection(readmeSections.sections, "License")),
    ].join("\n\n"),
  },
];

rmSync(resolve(docsRoot, "docs.md"), { force: true });

for (const page of pages) {
  const outputPath = resolve(docsRoot, page.path);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, renderPage(page), "utf-8");
  console.log(`Generated ${page.path}`);
}
