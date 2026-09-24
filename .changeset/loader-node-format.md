---
"@hebilicious/cssforge": patch
---

Read project TypeScript in the config graph as ESM whenever Node would read it as CommonJS. The loader
asks Node for the format it chose instead of repeating the package.json lookup and guessing from the
source text.

A CommonJS-authored `.ts` module inside a CommonJS package now loads as ESM, which matches the documented
`export default` config shape.
