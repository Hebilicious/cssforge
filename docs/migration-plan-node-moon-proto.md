# Migration Plan: Deno -> Node + pnpm Workspace + moon v2 + proto (JSR retained)

## Summary

Refactor to a Node-first monorepo with `pnpm` workspaces + `moon v2` + `proto`, keep JSR publishing for `@hebilicious/cssforge`, move the publishable package to `packages/cssforge`, and keep Deno only where required for JSR publishing.

## Locked decisions

- Full repo migration.
- Keep Deno only for JSR publishing.
- Move library to `packages/cssforge`.
- Moon-first CI.
- Install moon/proto skills from `hyperb1iss/moonrepo-skill` via the skills CLI and
  commit installed files.
- pnpm-only examples/docs.
- Vitest for tests.
- Biome (latest) for formatting/linting.
- Do not run example tests on CI.

## Pinned versions

- Node `24.13.1`
- pnpm `10.30.0`
- moon `2.0.0`
- proto `0.55.2`
- Biome `2.4.2`
- Vitest `4.0.18`

## Repo structure

- Add `pnpm-workspace.yaml` with:
  - `packages/*`
  - `example/*`
- Move library from root to `packages/cssforge`.
- Keep examples under `example/*` as workspace packages.
- Root `package.json` becomes private orchestration package.

## Skills

- Install:
  - `npx skills add https://github.com/hyperb1iss/moonrepo-skill --skill moon`
  - `npx skills add https://github.com/hyperb1iss/moonrepo-skill --skill proto`
- Commit:
  - `.agents/skills/moon`
  - `.agents/skills/proto`

## Tooling

- Add `.prototools` with exact pins.
- Add moon v2 config:
  - `.moon/workspace.yml`
  - `.moon/toolchains.yml`
  - `.moon/tasks/*.yml`
  - `moon.yml` per project (package + examples)

## Tasks

- Standard moon targets:
  - `:format`, `:lint`, `:typecheck`, `:test`, `:build`
- Package targets:
  - `cssforge:jsr-dry-run`
  - `cssforge:jsr-publish`
- Example e2e tasks enabled locally, disabled in CI.

## Package/API expectations

- Preserve exports:
  - `@hebilicious/cssforge`
  - `@hebilicious/cssforge/cli`
- Keep config schema/API behavior unchanged.
- Change developer workflow from Deno tasks to moon+pnpm.

## Test migration

- Convert Deno tests to Vitest.
- Port snapshots and assertions with behavior parity.
- Keep example Playwright tests runnable locally via moon targets.

## CI/release

- CI runs moon targets only (`format`, `test`, `typecheck`).
- No example e2e in CI.
- Release keeps changesets flow and publishes to JSR from `packages/cssforge`.
- Deno setup allowed only in JSR publish step if required.

## Docs updates

- Update root README to pnpm+moon-first workflow.
- Remove Deno usage from normal contributor paths.
- Update example READMEs to pnpm-only.
- Update AGENTS/skills references to repo-local skills.

## Acceptance criteria

1. `pnpm install` produces one root `pnpm-lock.yaml`.
2. No `package-lock.json` in repo.
3. `moon run cssforge:test` passes Vitest suite.
4. CLI generate tasks work from workspace.
5. Example e2e runs locally; not run in CI.
6. `moon run cssforge:jsr-dry-run` passes.
7. JSR publish remains functional.
8. Skills installed via the CLI in `.agents/skills`.
