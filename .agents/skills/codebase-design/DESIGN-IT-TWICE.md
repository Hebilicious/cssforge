# Design it twice

Use this process when a public or widely used interface is consequential and the first plausible design should not be accepted without comparison.

## Frame the problem

State:

- the caller-visible behavior and constraints;
- compatibility requirements;
- dependencies and their categories from [DEEPENING.md](DEEPENING.md);
- which complexity belongs behind the seam;
- a small usage sketch that illustrates the problem without prescribing the solution.

## Explore alternatives

When parallel agents are available and authorized, ask at least three agents for meaningfully different interfaces:

1. Minimize the interface and maximize leverage.
2. Maximize extension points justified by current requirements.
3. Optimize the common caller path.

Each proposal should include its complete caller contract, a usage example, hidden implementation responsibilities, dependency strategy, and trade-offs. If parallel agents are unavailable, develop the alternatives sequentially.

## Compare

Compare proposals by depth, locality, compatibility, seam placement, error clarity, and testability. Recommend one design or a deliberate hybrid. Do not introduce flexibility without a current caller or compatibility requirement.
