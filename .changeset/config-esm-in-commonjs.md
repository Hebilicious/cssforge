---
"@hebilicious/cssforge": patch
---

Load `cssforge.config.ts` as ESM even when the project declares `"type": "commonjs"`. Node read the config
as CommonJS there, switched module syntax detection off, and rejected `export default`, so neither the CLI
nor the bundler plugin could load a config in those projects.

The loader's message now also carries the failure it caught, which bundlers previously hid behind the
config path.
