# Tailwind + SolidStart

Node.js example that integrates CSS Forge tokens into a SolidStart app styled with
Tailwind.

## Scaffold Source

```bash
pnpm create solid@latest tailwind-solidstart -- --solidstart --ts --template with-tailwindcss
```

## Resolved Versions

- `@solidjs/start@1.2.1`
- `solid-js@1.9.11`
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
