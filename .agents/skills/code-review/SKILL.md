---
name: code-review
description: Review implementation changes independently against repository standards and the user's requested behavior, reporting only concrete diff-supported findings.
---

# Code review

Review the complete branch and worktree change set on two independent axes:

- **Standards:** does a changed hunk violate an applicable documented repository rule or introduce concrete maintainability friction?
- **Spec:** does the change fail the user's requested behavior or introduce a regression?

Run the axes as parallel read-only agents when delegation is available. Otherwise perform them sequentially and keep their findings separate.

## Review posture

Review evidence, not possibilities. A clean review is valid.

- Apply only standards relevant to the changed material.
- Report a finding only when a specific changed hunk has a concrete consequence.
- Do not invent requirements, seek a quota of findings, or report unrelated pre-existing work as a defect in the change.
- Formatting, lint, and type errors belong to their tool output; do not manufacture parallel prose findings for them.
- Review documentation and agent instructions as documentation unless they execute as repository tooling.

Classify findings:

- **Blocker:** an unmet requested behavior, regression, or violation of an applicable documented requirement.
- **Smell:** nonblocking maintainability friction introduced or materially worsened by the change.
- **Follow-up:** valid adjacent or pre-existing work outside the request.

## Establish the review frame

1. Pin the comparison base. For ordinary work, use the merge base with the user-named target branch, defaulting to `main`.
2. Inspect commits, `git diff <base>`, staged changes, and untracked files from `git ls-files --others --exclude-standard`.
3. Record the smallest **frozen contract** that faithfully reflects the user's request. Include its source, acceptance boundary, and material exclusions.
4. Identify only the repository standards that govern the changed material, starting with `AGENTS.md` and more specific nested instructions.
5. Stop and report an invalid comparison base or genuinely empty change set.

When tests or Moon task ownership change, `$testing` is an applicable standard.

## Standards review

Check the complete change set against the applicable standards. Use these heuristics to notice concrete design friction, not as a checklist that must produce findings:

- unclear names;
- duplicated rules;
- one change scattered across many modules;
- a module changing for unrelated reasons;
- repeated dispatch over the same variants;
- primitives that permit invalid domain states;
- long navigation chains through object structure;
- pass-through abstractions with no policy;
- extension points with no current requirement;
- tests coupled to implementation rather than public behavior.

Report the smallest actionable issue, the relevant hunk, the violated rule or demonstrated consequence, and the narrowest useful correction.

## Spec review

Compare the complete change set with the verbatim user request and frozen contract. Look for:

- missing or incorrectly implemented requested behavior;
- altered public outputs, types, errors, or CLI behavior not authorized by the request;
- regressions in adjacent behavior caused by the changed code;
- tests that fail to exercise the promised behavior.

Do not expand the contract based on opportunities discovered in the repository.

## Delegated review brief

Give each reviewer:

- `Mode: read-only review; do not edit or commit.`
- the absolute worktree path and branch;
- the comparison base and commands for tracked and untracked changes;
- the relevant user request verbatim;
- the frozen contract, its source, boundary, and exclusions;
- the applicable standards for that axis;
- `A clean review is valid. Report only concrete findings supported by the diff.`

Ask one reviewer for Standards and one for Spec. Preserve their classifications when aggregating; do not upgrade a finding merely because both axes mention it.

## Output

List findings first, ordered by severity, with precise file and line references. Then present separate `Standards` and `Spec` summaries and totals by classification. If there are no findings, say so and note any verification gap that prevented a complete review.
