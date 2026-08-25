# Mocking

CSS Forge's core transformations are in-process and deterministic; exercise them directly.

Mock only real system boundaries such as filesystem access, process signals, file watching, time, or an external process. Prefer temporary directories and real local files when they remain fast and deterministic.

Do not mock internal processors merely to prove that `generateCSS` delegates to them. Assert the generated output through the public seam instead.

When a boundary must vary, inject the smallest capability the module needs rather than a generic object or fetch-like dispatcher. Restore global state and release watchers deterministically after every test.
