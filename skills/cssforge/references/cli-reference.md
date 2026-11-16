# CLI Reference

The command line, the MCP server and the typed API come from one AcidCat application:
`packages/cssforge/src/app.ts`. Its catalog is `packages/cssforge/cssforge.acidcat.json`. The
entry point is `packages/cssforge/src/cli.ts`, and the operations are in
`packages/cssforge/src/forge.ts`.

## Commands

Each command answers with JSON on stdout.

- `cssforge tokens build [flags]`: write the outputs. Result: `{ files, diagnostics, dependencies }`.
- `cssforge tokens generate [flags]`: print one output, write nothing. Result:
  `{ format, content, diagnostics, dependencies }`.
- `cssforge config check [flags]`: validate the config. Result: `{ diagnostics, dependencies }`.
- `cssforge watch tokens.built [flags]`: build now and after each change of the config or a
  local module it imports. One JSON line per build: `{ data: { ok: true, files, … } }` or
  `{ data: { ok: false, failure } }`. Exits with `130` when interrupted.
- `cssforge mcp`: serve the same capabilities as MCP tools through stdio.
- `cssforge list`: every command with its flags.

`cssforge [flags]`, with no command, is `cssforge tokens build [flags]`; `-w` / `--watch` makes it
`watch tokens.built`.

## Flags

- `--config`: config path (default `./cssforge.config.ts`)
- `--root`: directory that relative paths resolve against (default: the working directory).
  The earlier `--prefix` still works without a command.
- `--mode`, `-m` (without a command): `css | json | ts | style-dictionary | all` (default `all`;
  `tokens build` and `watch tokens.built`)
- `--format`: `css | json | ts | style-dictionary` (default `css`; `tokens generate`)
- `--css`: css output path (default `./.cssforge/output.css`)
- `--json`: json output path (default `./.cssforge/output.json`)
- `--ts`: ts output path (default `./.cssforge/output.ts`)
- `--style-dictionary`: Style Dictionary token JSON path (default `./.cssforge/tokens.sd.json`)
- `--style-dictionary-value-mode`: `resolved | css-reference` (default `resolved`)
- `--color-formats`: sRGB formats generated alongside oklch (`hex`, `rgb`), appended to the
  formats `settings.color.formats` declares. Repeat the flag (`--color-formats hex
  --color-formats rgb`) or give a JSON array. Without a command, `hex,rgb` still works.

## Results and exit codes

- Build warnings, such as a fluid type step below the legibility floor, are the `diagnostics`
  of the result. They never fail the build; the exit code stays `0`.
- A failure is `{ _tag, message, path? }` on stdout with exit code `1`. Tags:
  `ConfigLoadFailed`, `InvalidConfig`, `WriteFailed`.
- An invalid flag or value exits with `3`, with the message on stderr.

## Typical commands from docs

The npm package exposes a `cssforge` executable, so consumers run it directly (`npx cssforge`
with npm, `pnpm cssforge` with pnpm):

- Basic: `npx cssforge tokens build`
- Watch: `npx cssforge watch tokens.built`
- Custom paths:
  - `npx cssforge tokens build --config ./path/cssforge.config.ts --css ./dist/tokens.css --ts ./dist/tokens.ts --json ./dist/tokens.json --mode all`
- Extra color formats:
  - `npx cssforge tokens build --color-formats hex --color-formats rgb`
- MCP server for an agent: `claude mcp add cssforge -- npx cssforge mcp`

## Programmatic API

From `README.md`:

- `import { generateCSS } from "@hebilicious/cssforge";`
- `const css = generateCSS(config);`
- `generateCSS(config, { colorFormats: ["hex", "rgb"] })` adds the extra color formats to
  the ones the config declares
- `getDiagnostics(config)` returns the build warnings as `{ code, severity, path, message }`,
  the same ones the CLI reports
