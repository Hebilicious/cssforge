# CLI Reference

CLI implementation: `packages/cssforge/src/cli.ts`

## Supported args

- `--watch`, `-w`: watch config file for changes
- `--config`: config path (default `./cssforge.config.ts`)
- `--mode`, `-m`: `css | json | ts | all` (default `all`)
- `--prefix`: prefix prepended to all paths
- `--strict`: fail the build when scope diagnostics are reported (default: warn and generate)
- `--css`: css output path (default `./.cssforge/output.css`)
- `--json`: json output path (default `./.cssforge/output.json`)
- `--ts`: ts output path (default `./.cssforge/output.ts`)

## Typical commands from docs

The npm package exposes a `cssforge` executable, so consumers run it directly (`npx cssforge`
with npm, `pnpm cssforge` with pnpm):

- Basic: `npx cssforge`
- Watch: `npx cssforge --watch`
- Custom paths:
  - `npx cssforge --config ./path/cssforge.config.ts --css ./dist/tokens.css --ts ./dist/tokens.ts --json ./dist/tokens.json --mode all`

Deno projects run the same CLI from the secondary JSR channel:

- `deno run -A jsr:@hebilicious/cssforge/cli --mode all`

## Programmatic API

From `README.md`:

- `import { generateCSS } from "@hebilicious/cssforge";`
- `const css = generateCSS(config);`
