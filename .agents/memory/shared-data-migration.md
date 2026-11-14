---
name: Shared data hosting and migration
description: User-confirmed hosting and initial migration behavior for company data.
---

**Rule:** Use Replit-hosted PostgreSQL for shared company data. The first setup imports the current browser's local snapshot only when the user selects it, and must leave the browser's local copy intact.

**Why:** The user explicitly chose Replit hosting and asked to migrate this browser's data first without losing the original local data.

**How to apply:** Keep any future migration from additional browser copies separate and explicit; do not silently overwrite the shared records.
