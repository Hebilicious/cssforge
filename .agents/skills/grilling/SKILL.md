---
name: grilling
description: Stress-test a plan, decision, or idea through a structured interview when the user asks to be grilled or wants assumptions challenged.
---

# Grilling

Interview the user until the plan's meaningful decisions and assumptions are explicit. Map the subject as a **design tree**: each decision branches into decisions that depend on it.

Work in rounds. The **frontier** is every open decision whose prerequisites are settled. Ask the whole frontier in one round, number each question, and give a recommended answer. A question that depends on another open answer belongs in a later round.

Format each question as:

```text
❓ Q1 — <short title>: <question and relevant choices>

➡️ Recommended: <answer and concise rationale>
```

After each response, update the design tree and compute the next frontier. Discover facts from the repository, tools, or primary sources instead of asking the user to retrieve them. Decisions and value judgments remain the user's.

Finish when every material branch is settled or explicitly deferred. Summarize the resulting decisions, unresolved risks, and next action. Do not implement the plan unless the user separately authorizes implementation.
