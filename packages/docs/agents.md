---
title: Agent guide
description: A compact routing guide for coding agents using CSS Forge.
outline: [2, 3]
---

# Agent guide

Use this page as a routing index. Read the smallest page that answers the current task instead of loading the entire documentation set.

The compact machine-readable route index is available at [`/llms.txt`](/llms.txt).

## Choose the relevant page

- **Install or create a first config:** [Getting started](/guide/getting-started)
- **Understand references and config structure:** [Configuration](/guide/configuration)
- **Configure a token family:** [Colors](/tokens/colors), [Spacing](/tokens/spacing), [Typography](/tokens/typography), or [Primitives](/tokens/primitives)
- **Run the CLI or call the API:** [Using CSS Forge](/guide/usage)
- **Integrate with a framework:** [Examples](/guide/examples)

## Repository sources of truth

- [Public exports](https://github.com/Hebilicious/cssforge/blob/main/packages/cssforge/src/mod.ts)
- [Configuration types](https://github.com/Hebilicious/cssforge/blob/main/packages/cssforge/src/config.ts)
- [CLI implementation](https://github.com/Hebilicious/cssforge/blob/main/packages/cssforge/src/cli.ts)
- [Generated reference source](https://github.com/Hebilicious/cssforge/blob/main/README.md)
- [Example projects](https://github.com/Hebilicious/cssforge/tree/main/example)

## Agent workflow

1. Identify whether the task concerns installation, a token family, references, CLI behavior, or framework integration.
2. Read the matching focused page above.
3. Use the linked repository source when exact types or current runtime behavior matter.
4. Change the user’s config rather than generated CSS output.
5. Run the project’s existing CSS Forge generation command and inspect its declared output.

## Context hint

For agents that accept URL context, the complete generated reference remains available from the repository README:

```text
@https://raw.githubusercontent.com/Hebilicious/cssforge/refs/heads/main/README.md
```
