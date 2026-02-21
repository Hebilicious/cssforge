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
      { text: "Guide", link: "/docs" },
      {
        text: "JSR",
        link: "https://jsr.io/@hebilicious/cssforge",
      },
      {
        text: "GitHub",
        link: "https://github.com/Hebilicious/cssforge",
      },
    ],
    search: { provider: "local" },
    editLink: {
      pattern:
        "https://github.com/Hebilicious/cssforge/edit/main/packages/cssforge-docs/:path",
    },
    footer: {
      message: "Released under the MIT License.",
      copyright: "Copyright Hebilicious",
    },
  },
});
