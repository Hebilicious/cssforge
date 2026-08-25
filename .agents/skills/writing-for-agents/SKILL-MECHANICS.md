# Skill mechanics

Read this reference when creating or changing a skill.

## Invocation

Use normal automatic discovery when the agent must recognize the task on its own or when another installed skill legitimately depends on it. Write a concise model-facing description that names the capability and distinct trigger branches.

Use explicit-only invocation when the skill is a named workflow the human deliberately starts. Set this in `agents/openai.yaml`:

```yaml
policy:
  allow_implicit_invocation: false
```

The description then serves the human-facing skill list rather than automatic routing. Do not make a skill explicit-only merely because its workflow later requires authorization; put the authorization check immediately before the sensitive action.

## Dependencies

Keep a skill self-contained unless another installed skill owns a genuinely shared discipline. A cross-skill reference must name an available skill and explain when to use it. When transplanting a skill between repositories, either bring the dependency too or inline the small behavior actually required.

Shared reference needed by several skills may live in a plain document when making it an automatically invoked skill would create noisy routing.

## Packaging

Every skill needs `SKILL.md` with valid `name` and `description` frontmatter. Add only resources the workflow actually uses:

- `references/` for substantial conditional guidance;
- `scripts/` for deterministic repeated operations;
- `assets/` for material copied into outputs;
- `agents/openai.yaml` for display metadata and invocation policy.

Link every retained reference from an instruction that says when to read it. Avoid README files, changelogs, copied manuals, and placeholder directories.

## Routers

If several explicit-only skills become hard to remember, create one explicit router that tells the human which workflow to invoke. A router cannot invoke an explicit-only skill automatically; it is an index, not hidden control flow.
