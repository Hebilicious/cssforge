---
"@hebilicious/cssforge": patch
---

Fix CLI output paths on Windows: resolve each output file's parent directory with the platform-aware `dirname` instead of a forward-slash-only expression, so Windows paths create the containing directory rather than a directory at the output file path.
