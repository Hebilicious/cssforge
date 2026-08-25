import { defineConfig } from "vitepress";

export default defineConfig({
  title: "CSS Forge",
  description:
    "0 runtime design tokens generator for modern style systems.",
  cleanUrls: true,
  appearance: "dark",
  markdown: {
    theme: "github-dark",
  },
  themeConfig: {
    nav: [
      {
        text: "Guide",
        link: "/guide/getting-started",
        activeMatch: "/guide/",
      },
      {
        text: "Tokens",
        items: [
          { text: "Colors", link: "/tokens/colors" },
          { text: "Spacing", link: "/tokens/spacing" },
          { text: "Typography", link: "/tokens/typography" },
          { text: "Primitives", link: "/tokens/primitives" },
        ],
      },
      { text: "Agents", link: "/agents" },
      {
        text: "JSR",
        link: "https://jsr.io/@hebilicious/cssforge",
      },
      {
        text: "GitHub",
        link: "https://github.com/Hebilicious/cssforge",
      },
    ],
    sidebar: [
      {
        text: "Guide",
        items: [
          { text: "Getting started", link: "/guide/getting-started" },
          { text: "Configuration", link: "/guide/configuration" },
          { text: "CLI and API", link: "/guide/usage" },
          { text: "Examples", link: "/guide/examples" },
        ],
      },
      {
        text: "Design tokens",
        items: [
          { text: "Colors", link: "/tokens/colors" },
          { text: "Spacing", link: "/tokens/spacing" },
          { text: "Typography", link: "/tokens/typography" },
          { text: "Primitives", link: "/tokens/primitives" },
        ],
      },
      {
        text: "For agents",
        items: [
          { text: "Agent guide", link: "/agents" },
        ],
      },
      {
        text: "Project",
        items: [
          { text: "Contributing", link: "/contributing" },
        ],
      },
    ],
    search: { provider: "local" },
    editLink: {
      pattern: ({ filePath, frontmatter }) => {
        const sourcePath = typeof frontmatter.sourcePath === "string"
          ? frontmatter.sourcePath
          : `packages/docs/${filePath}`;

        return `https://github.com/Hebilicious/cssforge/edit/main/${sourcePath}`;
      },
    },
    footer: {
      message: "Released under the MIT License.",
      copyright: "Copyright Hebilicious",
    },
  },
});
