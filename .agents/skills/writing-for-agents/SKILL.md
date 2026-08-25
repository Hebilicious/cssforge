---
name: writing-for-agents
description: Create or revise skills, AGENTS.md, CLAUDE.md, and other instructions consumed by coding agents so they remain discoverable, scoped, and maintainable.
---

# Writing for agents

Write instructions that make the agent take a reliable process without constraining unrelated work. Treat every always-loaded instruction as context cost and every manually invoked document as human indexing cost.

When editing a skill, also read [SKILL-MECHANICS.md](SKILL-MECHANICS.md).

## Context pointers

A pointer names out-of-context material and states when to read it. Skill descriptions and lines in `AGENTS.md` are pointers.

- Front-load the capability or trigger.
- Cover each genuinely distinct branch once; remove synonym lists that repeat one branch.
- State both what the target contains and the condition that makes it relevant.
- Keep always-loaded pointers short, precise, and discriminating.

Weak pointers hide important rules. Improve the trigger before inlining an entire reference.

## Information hierarchy

Place information at the highest useful level, not the highest possible level:

1. **In-file steps:** the ordered actions every invocation needs.
2. **In-file reference:** compact rules consulted throughout the workflow.
3. **Disclosed reference:** substantial or branch-specific material linked with a clear reading condition.

Inline what every branch needs. Move mode-specific procedures, large examples, and detailed schemas into references. Keep a concept's definition, rules, and caveats together instead of scattering them across files.

## Steps and completion criteria

Each meaningful step needs a checkable completion condition. Prefer exhaustive criteria such as “every changed public export accounted for” over vague requests such as “review the API.” Strong criteria drive the necessary investigation without prescribing every command.

Split a workflow only when the split reduces real confusion, prevents later steps from rushing an uncertain earlier decision, or allows branch-specific material to stay unloaded.

## Write from sources of truth

The repository is already documentation:

- configuration files declare tool versions and task shape;
- package manifests declare dependencies and scripts;
- types and public exports declare interfaces;
- command help and official docs declare current tool syntax.

Do not cache cheap lookups in agent instructions. Record non-obvious conventions, reasons, invariants, authorization boundaries, and failure modes that the environment cannot reveal. A copied tool manual becomes stale sediment.

## Prune aggressively

For every instruction, ask whether it changes behavior compared with the agent's normal capabilities.

Remove:

- generic advice the agent already follows;
- duplicated meanings;
- examples that add no decision-relevant distinction;
- project terminology copied from another repository;
- references to unavailable skills, tools, paths, or workflows;
- absolute rules unsupported by a concrete correctness or safety risk;
- stale details discoverable from the current environment.

Prefer positive target behavior. Keep prohibitions for real guardrails and pair them with the action the agent should take instead.

## Validate

After editing instructions:

1. Verify every pointer resolves.
2. Search for renamed paths, unavailable skills, foreign project terminology, and unsupported commands.
3. Check that descriptions route narrowly enough.
4. Validate skill frontmatter and metadata with the available skill validator.
5. Review the diff as instructions, not merely as Markdown formatting.
