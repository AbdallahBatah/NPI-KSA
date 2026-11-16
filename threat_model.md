# Threat Model

## Project Overview

NPI-KSA is a solar EPC project-management system (Arabic, RTL). Production is a
single Node.js HTTP server (`server.js`, no framework) serving a single-file
front end (`index.html`, built from `src/npi-projects.html`) and a JSON API
backed by Replit PostgreSQL (`pg`). Deployed as an Autoscale target at
`https://npi-ksa.replit.app` (public visibility). Password hashing and session
tokens use the Node `crypto` module (scrypt). A `file://` localStorage mode
exists for offline preview only.

## Assets

- **User credentials & sessions** -- scrypt password hashes (`npi_users`),
  session tokens (`npi_sessions`, stored as SHA-256 hashes). Compromise enables
  impersonation and full data access.
- **Business & financial data** -- projects, purchasing, stock, claims, costs,
  payments stored in `npi_records`. Money fields are access-controlled and
  redacted for users without `see.money`.
- **Administrative control** -- the General Manager / admin role holds every
  permission (user management, roles, org settings, exports).

## Trust Boundaries

- **Browser to API** -- all `/api/*` requests; the client is untrusted.
  Enforcement is server-side via session cookie + per-record authorization.
- **API to PostgreSQL** -- all queries are parameterized; collection and id are
  validated (`cleanId`, `COLLECTIONS` allow-list).
- **Public vs authenticated** -- only `/api/session`, `/api/auth/setup`, and
  `/api/auth/login` are pre-auth. Everything else requires a valid session via
  `readUserBySession`.
- **Role boundary** -- permissions derive from `permissionsFor` + `DEFAULT_PERMS`
  and per-collection read/write/delete checks (`collectionAllowedRead`,
  `canWriteCollection`, `canDeleteCollection`, `canSeeProject`).

## Scan Anchors

- Production entry point: `server.js` (`handleApi`, `serveStatic`). `tools/serve.py`
  is a dev-only preview server (static allow-list; SAST path-traversal flag is a
  false positive and it is not the production server).
- Highest-risk areas: `bootstrap()` (unauthenticated setup), `/api/auth/login`
  (throttling), `/api/data/:col/:id` write/delete path (authorization), and the
  `canWriteCollection` business-logic rules.
- Pre-auth surface: `/api/auth/setup`, `/api/auth/login`, `/api/session`.
- All SQL is parameterized; no command execution, no filesystem access from user
  input, no outbound/SSRF surface. No secrets embedded in `index.html`.

## Threat Categories

### Spoofing / Authentication
First-admin setup (`/api/auth/setup`) is unauthenticated and grants full admin to
the first caller while `npi_users` is empty -- a takeover risk on fresh/reset
deployments (see new vulnerability). Login throttling is in-memory and per
process, so it is weak under Autoscale and non-durable across restarts.

### Elevation of Privilege
Authorization is enforced server-side per record and per project scope; no IDOR
was found in the data API. `admin.roles`/`admin.users` are only auto-granted to
gm/admin base roles. Self role-change is blocked.

### Information Disclosure
Secrets are stripped (`cleanSecrets`) and money fields redacted for users without
`see.money`. The static server exposes only `index.html` and the optional seed.

### Denial of Service
`loginFailures` map grows unbounded and request bodies allow up to 50MB; these are
the main DoS considerations.

### AI assistant relay (`/api/ai/chat`)
Authenticated, same-origin only, per-user request cap (in-memory per instance), body
limit 12MB with validated message/tool/image shapes. The relay never writes data and
holds the only copy of `ANTHROPIC_API_KEY`. Model output can only propose plan steps
in the browser; execution requires the user's approval and every resulting write is
authorized by `/api/data` like any manual action. Prompt-injection from records or
images can at most propose steps the same user could take manually and must approve.
Residual risks: cost abuse by a signed-in user (bounded by the per-user cap, which is
per process under Autoscale) and data sent to the AI provider is the user's visible data.

