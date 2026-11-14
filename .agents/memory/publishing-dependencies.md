---
name: Publishing dependency exclusions
description: Distinguish Git exclusions from publishing exclusions when diagnosing missing runtime packages.
---

Keep runtime dependencies excluded from Git without excluding them from the published application.

**Why:** A clean production-only install and isolated release test passed, yet the published server repeatedly failed to resolve its PostgreSQL driver. The publishing ignore list excluded the installed dependency directory.

**How to apply:** When dependency resolution passes locally but fails in a published image, inspect publishing exclusions as well as dependency declarations and build commands. An isolated install alone does not verify image packaging. Keep a release check for incompatible publishing exclusions.
