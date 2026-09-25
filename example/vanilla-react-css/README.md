# React + Vanilla CSS (Vite)

Node.js example that integrates CSS Forge tokens into a React app using vanilla CSS.

## Scaffold Source

```bash
pnpm create vite@latest vanilla-react-css -- --template react-ts --no-interactive
```

## Resolved Versions

- `react@19.2.4`
- `vite@7.3.1`
- `@playwright/test@1.58.2`

## Run Locally

```bash
pnpm install
pnpm exec playwright install chromium
moon run vanilla-react-css:cssforge-build-local
moon run vanilla-react-css:dev
```

The Vite plugin generates the tokens from `cssforge.config.ts`, and `src/main.tsx` imports
them from `virtual:cssforge.css`. There is no pre-generation step to run.

## E2E Test

```bash
moon run vanilla-react-css:e2e
```

The Playwright suite has four specs. `tests/e2e.spec.ts` validates CSS Forge variables on
`:root` and computed styles on `[data-testid="token-card"]`. The
`tests/theme-alias-scoping.spec.ts` spec covers theme alias scoping: with the `Another`
theme class on the root element the probe resolves to the `:root.Another` palette color,
while a descendant-only class leaves `--primary` invalid at computed-value time on `:root`
and the probe uses its fallback. The `tests/oklch-fallback.spec.ts` spec reads the generated
stylesheet through the CSSOM and asserts the `@supports not (color: oklch(0% 0 0))` block
carries the sRGB fallback, stays inert in Chromium, which supports `oklch()`, and wins the
cascade once its gate is opened on the generated rule. The
`tests/hmr.spec.ts` spec edits `cssforge.config.ts` against the running dev server and
asserts the browser picks up the new token value without reloading the page.
