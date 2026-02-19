# Tailwind + Next.js

Node.js example that integrates CSS Forge tokens into a Next.js app styled with Tailwind.

## Scaffold Source

```bash
pnpm create next-app@latest tailwind-nextjs --ts --eslint --tailwind --app --use-pnpm --skip-install --yes --disable-git
```

## Resolved Versions

- `next@16.1.6`
- `react@19.2.4`
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
