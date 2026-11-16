---
"@hebilicious/cssforge": minor
---

Rewrite the CLI with AcidCat, and add an MCP server.

- New commands: `cssforge tokens build`, `cssforge tokens generate`, `cssforge config check`, `cssforge watch tokens.built` and `cssforge list`. Each command answers with JSON on stdout.
- `cssforge mcp` serves the same capabilities to an agent as MCP tools, through stdio.
- `@hebilicious/cssforge/app` exports the AcidCat application, for typed calls from a user interface. The catalog ships as `cssforge.acidcat.json`.
- `cssforge [flags]`, with no command, still builds, and `-w`, `-m`, `--prefix` and `--color-formats hex,rgb` still work.
- Breaking: the output of the CLI is JSON. Build warnings are in the `diagnostics` of the result instead of `cssforge: warning:` lines on stderr. An invalid flag exits with `3` instead of `1`, and an interrupted watch exits with `130`. The `--color-formats` flag of a command takes one format per flag or a JSON array. The default export of `@hebilicious/cssforge/cli` (a citty command) is removed, and so is the `citty` dependency. `build()` and `watch()` keep their behavior.
