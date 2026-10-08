# CLI Reference

CLI implementation: `packages/cssforge/src/cli.ts`

## Supported args

- `--watch`, `-w`: watch config file for changes
- `--config`: config path (default `./cssforge.config.ts`)
- `--mode`, `-m`: `css | json | ts | all` (default `all`)
- `--prefix`: prefix prepended to all paths
- `--css`: css output path (default `./.cssforge/output.css`)
- `--json`: json output path (default `./.cssforge/output.json`)
- `--ts`: ts output path (default `./.cssforge/output.ts`)
- `--style-dictionary`: Style Dictionary token JSON path (default `./.cssforge/tokens.sd.json`)
- `--style-dictionary-value-mode`: `resolved | css-reference` (default `resolved`)
- `--color-formats`: comma separated sRGB formats generated alongside oklch (`hex`, `rgb`),
  appended to the formats `settings.color.formats` declares. Each added format generates its
  CSS value, and `settings.color.fallback` still picks the declaration
- `--fluid-type-function`: `pow | clamp` (default `pow`), how fluid type steps are written in
  the CSS. The JSON, TypeScript and Style Dictionary outputs are the same for both

## Build warnings

Warnings such as a fluid type step below the legibility floor go to stderr as
`cssforge: warning: <message>` before the outputs are written. They never fail the build: the
outputs are still written and the exit code stays `0`.

## Typical commands from docs

The npm package exposes a `cssforge` executable, so consumers run it directly (`npx cssforge`
with npm, `pnpm cssforge` with pnpm):

- Basic: `npx cssforge`
- Watch: `npx cssforge --watch`
- Custom paths:
  - `npx cssforge --config ./path/cssforge.config.ts --css ./dist/tokens.css --ts ./dist/tokens.ts --json ./dist/tokens.json --mode all`
- Extra color formats:
  - `npx cssforge --mode all --color-formats hex,rgb`
- Fluid type steps as one `clamp()` each instead of `pow()`:
  - `npx cssforge --fluid-type-function clamp`

Deno projects run the same CLI from the secondary JSR channel:

- `deno run -A jsr:@hebilicious/cssforge/cli --mode all`

## Programmatic API

From `README.md`:

- `import { generateCSS } from "@hebilicious/cssforge";`
- `const css = generateCSS(config);`
- `generateCSS(config, { colorFormats: ["hex", "rgb"] })` adds the extra color formats to
  the ones the config declares
- `generateCSS(config, { fluidTypeFunction: "clamp" })` writes each fluid type step as one
  `clamp()`; the default `"pow"` writes the scale's inputs and derives the steps with `pow()`
- `getDiagnostics(config)` returns the build warnings as `{ code, severity, path, message }`,
  the same ones the CLI prints
