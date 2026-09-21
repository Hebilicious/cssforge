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
moon run vanilla-react-css:cssforge-generate
moon run vanilla-react-css:dev
```

## E2E Test

```bash
moon run vanilla-react-css:e2e
```

The Playwright suite has two specs. `tests/e2e.spec.ts` validates CSS Forge variables on
`:root` and computed styles on `[data-testid="token-card"]`. The
`tests/theme-alias-scoping.spec.ts` spec covers theme alias scoping: with the `Another`
theme class on the root element the probe resolves to the `:root.Another` palette color,
while a descendant-only class leaves `--primary` invalid at computed-value time on `:root`
and the probe uses its fallback.
