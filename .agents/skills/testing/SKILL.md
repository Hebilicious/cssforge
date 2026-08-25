---
name: testing
description: Design, review, run, or revise CSS Forge tests and verification evidence at the cheapest public seam that proves each behavior.
---

# Testing

A **promise** is one independently stated public behavior, invariant, integration contract, generated-output requirement, or reproduced regression. Retain one clear proof at the cheapest public **test seam** that observes the promise completely.

## CSS Forge seams

- **Library:** exercise exported TypeScript functions and assert caller-visible return values or errors. This is the default for token transformation behavior.
- **CLI:** execute the packaged or source CLI with a minimal config and inspect declared output files, stdout, stderr, and exit status.
- **Example integration:** generate artifacts in an example project and verify that its real build or browser-visible result consumes them correctly.
- **Publication:** build or dry-run the package when the promise concerns exports, declarations, or published contents.

Choose one seam based on the risk; these are not a coverage matrix. Test through public exports rather than importing internal helpers. A processor intentionally exported from `src/mod.ts` is a public seam.

## Evidence rules

- Name the caller-visible behavior in the test.
- Use small inputs with expected values derived independently from the implementation.
- Assert semantic output, errors, ordering, and formatting that form part of the contract.
- Do not assert source text, internal call counts, private data structures, or incidental metadata.
- Use snapshots only when the complete serialized artifact is the promise. Pair large snapshots with focused assertions for behavior whose failure should be immediately legible.
- A disposable **probe** may help discover a seam or expectation. Mark it clearly and remove it before handoff.
- Avoid duplicating the same promise at several layers unless each layer owns a distinct integration risk.

## Work modes

- **Review:** identify each promise, its owning seam, and redundant or implementation-coupled evidence. Do not edit or run tests unless requested.
- **Change:** establish the promise and seam before authoring. For changed behavior, demonstrate the focused test failing for the intended reason, then make the identical selection pass. Remove superseded evidence and probes.
- **Run or diagnose:** inspect Moon configuration and run the narrowest owning target or focused runner selection. Report the exact selection and result.

Read [references/execution.md](references/execution.md) before authoring tests, changing Moon test tasks, or choosing between package and example-project verification.
