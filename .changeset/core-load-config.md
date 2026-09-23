---
"@hebilicious/cssforge": minor
---

Add `loadConfig`, the loader the CLI and the bundler plugin share. It returns the config together with
the absolute paths of every local module the config loaded, and it re-evaluates the whole graph on each
call.

`cssforge --watch` now watches those files instead of only the config path, so editing a token module
the config imports regenerates the output. Previously a second load also kept the values it cached for
imported token modules.
