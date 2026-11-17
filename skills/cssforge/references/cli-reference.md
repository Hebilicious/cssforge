# CLI Reference

The command line, the MCP server and the library target come from the capabilities in
`packages/cssforge/src/capabilities.ts`. Its catalog is `packages/cssforge/cssforge.acidcat.json`. The
entry point is `packages/cssforge/src/cli.ts`, and the operations are in
`packages/cssforge/src/forge.ts`.

## Commands

On a terminal, each command writes text for a person. For a script, in CI or for a coding agent
(detected from variables such as `CLAUDECODE` or `CODEX_THREAD_ID`), it writes JSON on stdout.
`--agent` writes JSON and `--human` writes text, wherever it runs (also `--output agent|human`, or `-o`). The results below are the JSON form.

`build`, `generate`, `check` and `--watch` are aliases of `tokens build`, `tokens generate`,
`config check` and `watch tokens.built`. `cssforge` alone, or with only flags, runs `build`.

- `cssforge build [flags]`: write the outputs. Result: `{ files, diagnostics, dependencies }`.
- `cssforge generate [flags]`: print one output, write nothing. Result:
  `{ format, content, diagnostics, dependencies }`.
- `cssforge check [flags]`: validate the config. Result: `{ diagnostics, dependencies }`.
- `cssforge --watch [flags]` (`--watch` first): build now and after each change of the config or a
  local module it imports. One JSON line per build: `{ data: { ok: true, files, … } }` or
  `{ data: { ok: false, failure } }`. Exits with `130` when interrupted.
- `cssforge mcp`: serve the same capabilities as MCP tools through stdio.
- `cssforge list`: every command with its flags.

## Flags

- `--config`: config path (default `./cssforge.config.ts`)
- `--root`: directory that relative paths resolve against (default: the working directory)
- `--mode`: `css | json | ts | style-dictionary | all` (default `all`;
  `build` and `--watch`)
- `--format`: `css | json | ts | style-dictionary` (default `css`; `generate`)
- `--css`: css output path (default `./.cssforge/output.css`)
- `--json`: json output path (default `./.cssforge/output.json`)
- `--ts`: ts output path (default `./.cssforge/output.ts`)
- `--style-dictionary`: Style Dictionary token JSON path (default `./.cssforge/tokens.sd.json`)
- `--style-dictionary-value-mode`: `resolved | css-reference` (default `resolved`)
- `--human`, `--agent`, or `--output`/`-o` `human | agent`: text for a person, or JSON (any command)
- `--color-formats`: sRGB formats generated alongside oklch (`hex`, `rgb`), appended to the
  formats `settings.color.formats` declares. Repeat the flag (`--color-formats hex
  --color-formats rgb`) or give a JSON array.

## Results and exit codes

- Build warnings, such as a fluid type step below the legibility floor, are the `diagnostics`
  of the result. They never fail the build; the exit code stays `0`.
- A failure is `{ _tag, message, path? }` on stdout with exit code `1`. Tags:
  `ConfigLoadFailed`, `InvalidConfig`, `WriteFailed`.
- An invalid flag or value exits with `3`, with the message on stderr.

## Typical commands from docs

The npm package exposes a `cssforge` executable, so consumers run it directly (`npx cssforge`
with npm, `pnpm cssforge` with pnpm):

- Basic: `npx cssforge`
- Watch: `npx cssforge --watch`
- Custom paths:
  - `npx cssforge --config ./path/cssforge.config.ts --css ./dist/tokens.css --ts ./dist/tokens.ts --json ./dist/tokens.json --mode all`
- Extra color formats:
  - `npx cssforge --color-formats hex --color-formats rgb`
- MCP server for an agent: `claude mcp add cssforge -- npx cssforge mcp`

## Programmatic API

From `README.md`:

- `import { generateCSS } from "@hebilicious/cssforge";`
- `const css = generateCSS(config);`
- `generateCSS(config, { colorFormats: ["hex", "rgb"] })` adds the extra color formats to
  the ones the config declares
- `getDiagnostics(config)` returns the build warnings as `{ code, severity, path, message }`,
  the same ones the CLI reports
- `import { createSession, cssforge, tokensBuild, toJsonSchema } from
  "@hebilicious/cssforge/capabilities"`, then `createSession(cssforge, { target: "library",
  context: { cwd }, toJsonSchema })`, calls the same capabilities as the CLI, with types
