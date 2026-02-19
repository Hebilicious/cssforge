# Solid + Vanilla CSS (Vite)

Node.js example that integrates CSS Forge tokens into a Solid app using vanilla CSS.

## Scaffold Source

```bash
pnpm create vite@latest vanilla-solid-css -- --template solid-ts --no-interactive
```

## Resolved Versions

- `solid-js@1.9.11`
- `vite@7.3.1`
- `@playwright/test@1.58.2`

## Run Locally

```bash
pnpm install
pnpm exec playwright install chromium
pnpm run cssforge:build-local
pnpm run cssforge:generate
pnpm run dev
```

## E2E Test

```bash
pnpm run test:e2e
```

The Playwright test validates CSS Forge variables on `:root` and computed styles on
`[data-testid="token-card"]`.
