---
name: codebase-design
description: Design or improve module interfaces, find deepening opportunities, place seams, and make code more testable or easier to navigate.
---

# Codebase design

Design **deep modules**: substantial behavior behind a small interface, placed at a clean seam and testable through that interface. Optimize for leverage for callers and locality for maintainers.

## Vocabulary

- **Module** — anything with an interface and implementation: a function, class, package, or larger slice.
- **Interface** — everything callers must know: types, invariants, ordering constraints, error modes, configuration, and relevant performance characteristics.
- **Implementation** — behavior hidden inside a module.
- **Depth** — the leverage callers receive per unit of interface they must learn. Deep modules hide complexity; shallow modules expose it.
- **Seam** — a place where behavior can vary without editing the caller.
- **Adapter** — a concrete implementation that satisfies an interface at a seam.
- **Leverage** — capability gained by callers from learning the interface once.
- **Locality** — related knowledge, change, bugs, and verification concentrated in one place.

Use this vocabulary consistently when it makes a design decision clearer. Do not force terminology into ordinary prose where it adds no precision.

## Principles

- Reduce methods and parameters while hiding meaningful complexity.
- Judge depth at the interface, not by implementation size.
- Apply the deletion test: if deleting a module makes complexity disappear, it may be unnecessary; if the complexity spreads into callers, the module is earning its place.
- Treat the interface as the primary test surface. Callers and tests should cross the same seam.
- Introduce a variable seam only when variation is real. One adapter is usually hypothetical; two adapters demonstrate a seam.
- Keep internal seams private unless callers genuinely need them.
- Prefer inputs and returned results over hidden dependency construction and opaque side effects.

When deepening an existing cluster, read [DEEPENING.md](DEEPENING.md). When the interface choice is consequential or unclear, read [DESIGN-IT-TWICE.md](DESIGN-IT-TWICE.md).
