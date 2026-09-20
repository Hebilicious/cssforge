---
"@hebilicious/cssforge": patch
---

Report the real release version from the CLI. The command metadata is now derived from
`package.json`, the single source of truth, instead of a hard-coded string, so `--version`
matches the installed package on both the npm and JSR channels. A new release consistency
check fails when `package.json`, `jsr.json`, the generated `src/version.ts`, or the matching
`CHANGELOG.md` entry disagree.
