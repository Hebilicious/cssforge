---
"@hebilicious/cssforge": minor
---

Rewrite the CLI, and add an MCP server and typed calls from code.

- Commands: `cssforge tokens build`, `cssforge tokens generate`, `cssforge config check`, `cssforge watch tokens.built` and `cssforge list`. Each command answers with JSON on stdout.
- `cssforge mcp` serves the same commands to an agent as MCP tools, through stdio.
- `@hebilicious/cssforge/capabilities` gives the same commands to code, with types: `createSession(cssforge, { target: "library", … })`.
- The catalog of the commands ships as `cssforge.acidcat.json`.
- Breaking: `cssforge [flags]` without a command no longer builds; run `cssforge tokens build [flags]`. `-w`, `-m` and `--prefix` are removed: use `cssforge watch tokens.built`, `--mode` and `--root`. `--color-formats` takes one format per flag or a JSON array, not a comma separated list.
- Breaking: the output is JSON. Build warnings are in the `diagnostics` of the result instead of `cssforge: warning:` lines on stderr. An invalid flag exits with `3` instead of `1`, and an interrupted watch exits with `130`.
- Breaking: `build()`, `watch()`, `parseColorFormats()`, `writeFileRecursive()` and the default export of `@hebilicious/cssforge/cli` are removed. Call `tokens.build` through `@hebilicious/cssforge/capabilities` instead. The `citty` dependency is removed.
