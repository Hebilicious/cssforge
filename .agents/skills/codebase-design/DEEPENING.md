# Deepening modules

Use this reference when consolidating shallow modules or moving a seam.

## Classify dependencies

1. **In-process** — pure computation or in-memory state. Test directly through the deepened module's public interface.
2. **Local-substitutable** — filesystem or another dependency with a realistic local stand-in. Use the stand-in without exposing it through the public interface.
3. **Remote but owned** — an internal service boundary. Define a port at the seam and supply production and in-memory adapters.
4. **External** — a third-party system. Inject the smallest owned port and use a test adapter at that boundary.

CSS Forge is predominantly in-process. Do not introduce ports or adapters around pure token transformation merely to make internal functions mockable.

## Seam discipline

- Keep internal seams private.
- Avoid a port with only one justified adapter.
- Put policy and transformation logic behind the module interface, not in each caller.
- Do not expose implementation structure to make tests convenient.

## Replace rather than layer tests

After deepening a module, test the retained behavior through the new interface. Delete superseded tests that only pin the old internal structure. Tests should survive internal refactoring and assert caller-visible output or errors.
