# Tailwind + SvelteKit

Node.js example that integrates CSS Forge tokens into a SvelteKit app styled with
Tailwind.

## Scaffold Source

```bash
pnpm dlx sv@latest create tailwind-sveltekit --template minimal --types ts --no-add-ons --no-install --no-dir-check --no-download-check
```

## Resolved Versions

- `@sveltejs/kit@2.52.2`
- `svelte@5.53.0`
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
