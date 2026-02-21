# Tailwind + Nuxt

Node.js example that integrates CSS Forge tokens into a Nuxt app styled with Tailwind.

## Scaffold Source

```bash
pnpm dlx nuxi@latest init tailwind-nuxt --template minimal --packageManager pnpm --no-install --gitInit false --modules "" --force
```

## Resolved Versions

- `nuxt@4.3.1`
- `vue@3.5.28`
- `tailwindcss@4.2.0`
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
