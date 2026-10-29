# Css Forge Library

This is a library for generating CSS variables from design tokens. The repository is a
Node.js + pnpm workspace using moon v2 and proto.

## Creating new features and modules

Follow the established module conventions in `packages/cssforge/src/modules` and add tests
following the pattern in `packages/cssforge/tests`.

## Dependencies

Ask permissions before adding new dependencies. Always prefer using features from the
standard library or writing code from first principles.

## Branches and pull requests

- Never work directly on `main`. Changes go in through a pull request that is merged with a
  squash merge. Read-only inspection may stay in the current checkout.
- Each issue or task gets its own branch and its own worktree in `.worktrees/<branch>`. Create
  it from `main` with `git fetch origin && git worktree add .worktrees/<branch> -b <branch>
  origin/main`, and do all the work in that worktree. Keep the main worktree as you found it.
- When you start a subagent, tell it which branch and worktree it uses: the parent's, or a new
  one that you name. The subagent does not choose.
- Run `git status` before editing and review the complete diff afterward. Preserve unrelated
  changes.
- Commit titles and pull request titles are semantic: `type(scope): subject`, for example
  `fix(colors): reject duplicate palette keys`. The types are `feat`, `fix`, `docs`, `style`,
  `refactor`, `perf`, `test`, `build`, `ci`, `chore` and `revert`. The scope is required. Add
  `!` after the scope for a breaking change. The pull request title becomes the commit on
  `main`.
- When the work is done and checked, commit it, push the branch and open a pull request against
  `main` with `gh pr create --base main --head <branch>`. Do not wait to be asked. A pull
  request that closes an issue says `Closes #<number>` in its body.
- When a change is too large for one pull request, use `gh stack` (see
  `.agents/skills/gh-stack`): one branch and one pull request for each layer, in one worktree.
  Use it when the work splits into layers that a reviewer can read one at a time.
- A human reviews each pull request. Report the pull request URL and stop there. Never merge a
  pull request that a human has not reviewed, and never merge one because the work looks
  finished or the checks are green. Merging needs an explicit instruction from the user for
  that specific pull request, and opening a pull request is not that instruction.
- An authorized pull request authorizes its release: merge the changesets release pull request
  the workflow opens for it once it is mergeable. That branch never gets a green CI gate, so
  waiting for one deadlocks the release.
- Each session owns its own branch. Do not push to, rebase or merge a branch that another
  session owns.
- The session that merges a branch makes CI pass on it. Rebase on `main`, fix what fails, and
  merge only when every required check is green. Never skip or weaken a check to make it pass.
- After the merge, remove the worktree with `git worktree remove .worktrees/<branch>`.

## Engineering workflow

- Define repository operations in `moon.yml` or `.moon/tasks/**/*.yml`, not `package.json`
  scripts. Run existing operations through their Moon targets; use pnpm directly only for
  dependency management.
- During implementation, run the narrowest relevant Moon targets.
- Any task that adds, changes, moves, deletes, runs, reviews, or diagnoses tests or test
  evidence uses `$testing`.
- Before handing off implementation, test, build, or tooling changes, use `$code-review`.
  Documentation and agent-instruction changes require it only when explicitly requested.

## Library architecture

- Keep token transformation, validation, normalization, and generation in framework-neutral
  TypeScript that runs without browser or framework globals.
- Keep one canonical implementation for each token rule, reference resolver, formatter, and
  output transformation. CLI code and framework examples should call the shared implementation
  instead of reproducing it.
- Treat newly introduced external configuration and file data as `unknown` at runtime and
  validate it before creating typed internal state.
- Write new core package, test, and tooling code in TypeScript. Avoid `any` and `@ts-ignore`;
  framework examples may retain configuration formats required by their ecosystems.

## Configuration settings

Every module takes a `settings` object beside its `value`.

- A grouped topic key holds settings that belong together, as `settings.color` does. A single
  concern may stay flat, as spacing does with `settings.pxToRem`.
- A setting is added to the exported type with the JSDoc the README renders, and read at
  runtime with the path it was written at. Unknown keys, wrong value shapes, and settings
  written on a level that does not read them are rejected: a JavaScript config is not
  protected by the types.
- A color's settings override the palette's per setting. A list setting such as `formats`
  merges per key and takes `false` to remove an entry.
- The README section for the module says whether a setting reaches the tokens or the CSS. A
  CLI flag is an adapter over the same resolution, not a second implementation.

## Updating the README.md

To update the README, run `moon run cssforge:readme-update` from the workspace root.
There is a special syntax in the README that generates codeblocks. For a comment like
this:

<comment>
<!-- md:generate defineConfig
export default defineConfig({
  spacing: {
    fluid: {
      base: {
        value: {
          minSize: 4,
          maxSize: 24,
          minWidth: 320,
          maxWidth: 1280,
          negativeSteps: [0],
          positiveSteps: [3],
          prefix: "hi",
        },
      },
    },
  },
});
-->
</comment>

It will generate a codeblock below. Therefore, these comments are the source of truth and
should never be deleted. But they should be updated if the source code changes.
