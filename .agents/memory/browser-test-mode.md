---
name: Browser test mode
description: How browser tests use internal test helpers without exposing them during normal app use.
---

Internal helpers used by browser tests should be enabled only when both an explicit end-to-end query flag is present and the browser reports WebDriver automation. Replit tests run against the hosted HTTPS preview, so they cannot depend on `file://` protocol checks.

**Why:** The browser suite needs document, export, AI-mock, and write-freeze hooks that were previously available only on local file pages; normal application behavior should remain unchanged.

**How to apply:** Keep the test URL, browser support helper, and app-side test-mode condition in sync. Do not enable test hooks for ordinary browsers or unflagged routes.
