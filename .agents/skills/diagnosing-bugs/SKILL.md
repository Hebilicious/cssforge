---
name: diagnosing-bugs
description: Diagnose hard bugs, incorrect generated output, flaky behavior, and performance regressions by building a tight reproduction loop before forming conclusions.
---

# Diagnosing bugs

Build a tight feedback loop for the reported symptom, minimize it, test competing hypotheses, and identify the root cause with evidence. If the user asked only for diagnosis, stop after explaining the cause and a scoped fix; do not implement it.

Redact secrets and sensitive paths from commands, output, fixtures, and captured artifacts before sharing them.

## 1. Build a red-capable loop

Create the narrowest command that exercises the real failing path and asserts the user's exact symptom. Prefer, in order:

1. a focused Vitest test through the affected public export;
2. a CSS Forge CLI invocation using a minimal configuration fixture;
3. a differential run comparing known-good and failing inputs or revisions;
4. a small disposable harness;
5. a seeded property or fuzz loop for input-dependent failures;
6. `git bisect run` when the regression interval is known.

Use the repository's Moon tasks where they own execution. Inspect the relevant `moon.yml` instead of relying on remembered commands.

The loop is ready when one command has been run and is:

- red-capable for the exact symptom;
- deterministic, or has a measured high reproduction rate for a flaky bug;
- fast enough to run repeatedly;
- unattended.

If no such loop can be built, report what was attempted and request the smallest missing artifact or environment access. Do not substitute speculation for reproduction.

## 2. Reproduce and minimize

Run the loop until the original symptom is observed. Shrink the config, token data, output mode, and call path one element at a time while preserving the failure. Every remaining element should be load-bearing.

Keep disposable fixtures and output under `.artifacts/` unless a regression test is intentionally retained.

## 3. Test hypotheses

Generate three to five ranked, falsifiable hypotheses. For each, state the observation or controlled change that would distinguish it from the others. Show the list to the user, then continue unless their input is required.

Instrument only the locations that discriminate between hypotheses. Change one variable at a time. Prefer debugger inspection or targeted logs over broad logging. Prefix temporary diagnostics with a unique marker so they can be found and removed.

For performance regressions, establish a repeatable baseline under the same input and environment, then profile or bisect. Do not infer performance from code shape alone.

## 4. Establish the cause

A root cause is established only when the evidence explains:

- why the minimized case fails;
- why nearby passing cases do not;
- where the incorrect state, value, or control flow first appears;
- why the proposed change addresses that point rather than masking the symptom.

## 5. Fix and retain evidence when authorized

If implementation is in scope, use `$tdd` to turn the minimized reproduction into a failing regression test at the correct public seam, apply the smallest fix, and rerun both the retained test and original reproduction.

Before completion, remove temporary diagnostics and disposable probes. Report the reproduction command, root cause, changed behavior, and verification result.
