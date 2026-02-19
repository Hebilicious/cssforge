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

## Typical commands from docs

- Basic: `tsx ./node_modules/@hebilicious/cssforge/src/cli.ts`
- Watch: `tsx ./node_modules/@hebilicious/cssforge/src/cli.ts --watch`
- Custom paths:
  - `tsx ./node_modules/@hebilicious/cssforge/src/cli.ts --config ./path/cssforge.config.ts --css ./dist/tokens.css --ts ./dist/tokens.ts --json ./dist/tokens.json --mode all`

## Programmatic API

From `README.md`:

- `import { generateCSS } from "@hebilicious/cssforge";`
- `const css = generateCSS(config);`
