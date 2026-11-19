---
"@hebilicious/cssforge": minor
---

Sync the tokens of a design tool with the configuration, starting with Paper.

- `cssforge sync remote add --file <id or URL>` binds a Paper file. `cssforge sync fetch`, `cssforge sync plan` and `cssforge sync push` read the file, show the plan and send it: create, update and delete the tokens that the configuration generates.
- What designers change in the file waits in an inbox: `cssforge sync inbox list`. Settle a new token with `cssforge sync inbox adopt` (after you add it to the configuration) or `cssforge sync inbox reject`, and a changed or deleted token with `cssforge sync inbox overwrite`.
- The state is in `.cssforge/sync/<remote>.json`. Commit it.
- Each design tool is an adapter. Tokens have a value per mode (`default`, `light` and `dark` from `light-dark()`, or a selector such as `.dark`), a remote token has its own key, and `sync remote add --options` passes options to the adapter, so a tool with modes and ids, such as Figma, fits the same commands. Paper holds only the `default` mode.
- Each result lists the tokens that Paper has no place for, with the reason, and the number of requests made to Paper.
- The commands are also MCP tools of `cssforge mcp` and typed calls of `@hebilicious/cssforge/capabilities`. `sync.push` and `tokens.build` are marked destructive for MCP clients, and the read-only tools are marked read-only.
- `@acid-cat/core-ts` is updated to 0.15.0.
