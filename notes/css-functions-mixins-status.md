# CSS custom functions (@function) and mixins (@mixin / @apply) — status

Checked 2026-09-24. Versions at check time: Chrome 154 stable, Edge 154 beta, Safari 27 current,
Firefox 156 current. Spec editor's draft dated 2026-09-08.

## Answer

| Question | Status |
| --- | --- |
| `@function` in browsers | Shipped in Chrome/Edge/Opera/Samsung 139+ (Aug 2025). Safari: Technology Preview 249+ only, **not** in Safari 27 stable. Firefox: not implemented. |
| `@mixin` / `@apply` in browsers | Not shipped anywhere. Chromium prototype in Canary behind `--enable-features=CSSMixins`; Edge team started implementation 2026-07-08. Chrome status: Proposed, no milestone. |
| Baseline (both) | No. `@function` is blocked once by Firefox, once by Safari stable. Mixins are blocked by every engine. |
| Lightning CSS | Not implemented. Tracking issue open, unassigned, no PR, no milestone. Not in 1.33.0 (2026-07-20). |
| PostCSS | `@mixin`/`@apply`: partial plugin shipped (`@csstools/postcss-mixins@1.0.0`, 2026-01-14), no arguments/`@result`/`@contents`. `@function`: no plugin in the official org; open feature request. |
| ETA | None published for baseline or for mixins. Latest concrete milestone is "Could ship in a future Chromium release". |

## Spec

CSS Custom Functions and Mixins Module Level 1, editors Miriam Suzanne and Tab Atkins. Status in the
draft header is `ED` / Work Status: Exploring. The TR snapshot (`www.w3.org/TR/css-mixins-1/`, 2026-05-15)
contains custom functions only; the mixin half (`@mixin`, `@contents`, `@apply`, `@private`) exists only
in the editor's draft and was still changing during 2026 (for example the mixin lookup question in
[csswg-drafts#12671](https://lists.w3.org/Archives/Public/public-css-archive/2026Aug/0114.html), August 2026).

## Browser reality

Verified with headless Chrome 149 locally:

```
@function --probe-fn() { result: 42px; }  → applied, computed 42px, CSSFunctionRule exists
@mixin --probe-mix() { @result { … } }    → @apply ignored, CSSMixinRule undefined
```

`@function`

- Chrome 139+, Chrome Android 139+, Edge 139+, Opera 123+, Samsung Internet 30+, Android Browser 152+.
- Safari: TP only. Caniuse lists Safari 3.1 through 27.2 as not supported, TP as supported. Safari 27.0
  release notes list fixes to "CSS custom functions", so an implementation exists in the tree and has
  been iterating; it is not exposed in stable. WebKit's standards position for `@function` was closed as
  `position: support` on 2026-09-16.
- Firefox: not implemented. Tracking bug [1950366](https://bugzilla.mozilla.org/show_bug.cgi?id=1950366)
  is NEW since 2025-02-25, no priority, no assignee. Mozilla's standards-position issue
  [#1148](https://github.com/mozilla/standards-positions/issues/1148) is still open and assigned to
  emilio, last activity 2025-12-31.
- Global usage: 71.02% (caniuse, August 2026 data).

`@mixin` / `@apply`

- Chrome status entry [5108022310469632](https://chromestatus.com/feature/5108022310469632) "CSS mixins",
  owners from Microsoft Edge, status **Proposed**, no desktop/Android milestone, no origin trial. Tracking
  bug [406935599](https://issues.chromium.org/issues/406935599).
- Canary accepts `@mixin`, `@macro`, `@apply` behind `--enable-features=CSSMixins`. Syntax differs from
  the current editor's draft (Canary uses `@result { }` blocks; the draft uses `result:` descriptors and
  `@contents`), so the prototype is not the shipping syntax.
- No signal from Firefox or WebKit; no BCD entry for `@mixin` yet.
- MDN flags `@function` as Limited availability / experimental; web-features has `function` and `mixin`
  entries with `"baseline": false` and no support data for `mixin`.

## Build tooling

Lightning CSS

- No `@function` or `@mixin` support. [Issue #788](https://github.com/parcel-bundler/lightningcss/issues/788)
  opened 2024-08-02, 16 upvotes, 4 comments, still open; last comment (2026-07-24) is a user asking for
  updates with no maintainer reply. No assignee, no milestone, no open PR, no commit mentioning mixins.
- Releases through [v1.33.0](https://github.com/parcel-bundler/lightningcss/releases/tag/v1.33.0)
  (2026-07-20) contain neither feature.
- What exists instead: the custom at-rule + visitor API, which is what the docs cite as the extension
  point for mixin-like at-rules. Community polyfills built on it cover simple functions only and fail
  silently (see the write-up in issue #788).
- Practical effect today: Lightning CSS passes unknown at-rules through rather than erroring, so
  authoring `@function`/`@mixin` and minifying with Lightning CSS ships them unchanged to browsers that
  cannot use them. There is no lowering step.

PostCSS

- `@mixin` / `@apply`: [`@csstools/postcss-mixins`](https://www.npmjs.com/package/@csstools/postcss-mixins)
  1.0.0, published 2026-01-14, and it is a dependency of `postcss-preset-env` 11.5.3 (2026-09-13).
  cssdb entry `mixins` is at stage 2. Documented as a partial implementation: no mixin arguments, no
  `@contents`, no `@result`, no layered `@mixin`, no mixin overrides. It inlines `@apply --foo` into the
  rule and can keep the original with `preserve: true`.
- `@function`: nothing official. [Issue #1666](https://github.com/csstools/postcss-plugins/issues/1666)
  (open, 6 upvotes, last activity 2026-05-15) requests a polyfill; a duplicate
  [#1752](https://github.com/csstools/postcss-plugins/issues/1752) was closed as duplicate 2025-12-30.
  No cssdb entry, no plugin package.
- `postcss-mixins` (12.1.2, 2025-07-25) is a different thing: Sass/Less-style mixins, not the `@mixin`
  spec syntax.

## ETA

- Mixins: none. Latest public movement is Chrome status changing owners/updated 2026-07-14 and the
  implementation being at the "prototype a solution" phase of the Blink launch process. No origin trial
  registered, which normally precedes a stable ship, so a stable mixin release is not close.
- `@function` baseline: two independent blockers, so no date. Firefox has no committed release, and
  Safari stable has not exposed its implementation. WebKit's support position suggests Safari stable is
  plausible within the Safari 27.x line, which would leave Firefox as the only blocker.

## Relevance to this repo

`packages/cssforge` emits CSS custom properties and generated values; consumers process output with
Lightning CSS (Vite) or PostCSS. Native `@function` is not a safe output target: it renders as dead CSS
in Firefox and stable Safari, and there is no lowering path in Lightning CSS. `@mixin` is further out
and its syntax is not settled. Practical options stay as they are: precompute in TypeScript at build
time, or let consumers opt into `postcss-preset-env` for the partial mixin plugin.
