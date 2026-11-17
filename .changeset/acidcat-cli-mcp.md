---
"@hebilicious/cssforge": minor
---

Rewrite the CLI, and add an MCP server and typed calls from code.

- Commands: `cssforge build` (also `cssforge` alone), `cssforge generate`, `cssforge check`, `cssforge --watch` and `cssforge list`. On a terminal, the output is text for a person; for a script, in CI or for a coding agent, it is JSON. `--output human|json` chooses.
- `cssforge mcp` serves the same commands to an agent as MCP tools, through stdio.
- `@hebilicious/cssforge/capabilities` gives the same commands to code, with types: `createSession(cssforge, { target: "library", … })`.
- The catalog of the commands ships as `cssforge.acidcat.json`.
- Breaking: `-w`, `-m` and `--prefix` are removed: use `--watch` (as the first argument: `cssforge --watch --mode css`), `--mode` and `--root`. `--color-formats` takes one format per flag or a JSON array, not a comma separated list.
- Breaking: the output changes. Build warnings are in the `diagnostics` of the result instead of `cssforge: warning:` lines on stderr. An invalid flag exits with `3` instead of `1`, and an interrupted watch exits with `130`.
- Breaking: `@hebilicious/cssforge/cli` is no longer a module to import: `build()`, `watch()`, `parseColorFormats()`, `writeFileRecursive()`, `main()` and its default export are removed. It is only the `cssforge` program. Call `tokens.build` through `@hebilicious/cssforge/capabilities` instead. The `citty` dependency is removed.
