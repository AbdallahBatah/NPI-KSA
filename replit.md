# Running on Replit

- Keep the existing single-file HTML/CSS/JavaScript structure.
- Click Run to launch the `Start application` workflow (`npm run dev`).
- The command builds `index.html` from `src/npi-projects.html`, then runs
  `server.js` on `0.0.0.0:5000`. The server serves the app and the authenticated
  API backed by Replit PostgreSQL.
- Make UI changes in `src/npi-projects.html` and API changes in `server.js`,
  then restart Run to rebuild.
- `npm run build` rebuilds only; `npm start` serves the existing build.
- PostgreSQL schema is defined in `db/schema.sql` and is applied to the
  development database through the Replit database workflow. Do not add
  startup-time DDL or production migration scripts.
- The app uses the `DATABASE_URL` runtime variable. Do not request or set it.
- The Node server uses the built-in crypto module for password hashing and
  random, HttpOnly session cookies; `pg` is its only application dependency.
- On an uninitialized database, the Arabic first-run screen creates the general
  manager only with the owner secret `BOOTSTRAP_OWNER_TOKEN`. No demo data is
  automatically loaded. Without that secret, setup fails closed.

## Owner-only first setup

- The owner must generate a cryptographically random token (at least 32 bytes,
  represented as 64 hexadecimal characters) privately and store it as the
  `BOOTSTRAP_OWNER_TOKEN` secret in the environment running the app. Never put
  its value in source code, chat, URLs, or browser storage.
- The existing `NPI_SETUP_TOKEN` name remains supported when
  `BOOTSTRAP_OWNER_TOKEN` is absent. Configure only one; remove either name
  after setup. Missing/short secrets disable setup with HTTP 503. Never reuse
  `SESSION_SECRET` or database credentials. Existing sign-in does not depend
  on the setup secret; a reset database still requires owner authorization.
- Restart the server after setting the secret, open the setup page over HTTPS,
  and enter the same token in the masked owner-code field. This is separate
  from the new general manager's password.
- The token is sent only in a request header and is checked before accepting
  account details or a browser snapshot. Existing accounts always close setup;
  the transaction lock prevents concurrent requests creating two first admins.
- After successful setup, remove the bootstrap secret and restart the server.
  Keeping or changing the secret cannot reopen an initialized installation.
- `node --test tests/bootstrap-owner.test.js` checks the setup boundary with
  isolated database doubles; it does not modify company records.
  `node tests/bootstrap-owner.browser.js` checks the setup form at desktop and
  phone sizes with intercepted API responses and no company-data changes.

## Data and access

- On Replit (HTTP), authentication and data use the server and shared
  PostgreSQL database. Permissions are enforced by the server for reads and
  writes, including project assignment and financial-data redaction.
- `file://` still uses the original localStorage mode for offline preview and
  existing browser tests. That mode is not suitable for shared or secure use;
  a fresh local-only browser shows login and cannot create an account itself.
- First-run setup can import the current browser's `npi-local-v1` snapshot once.
  Import copies the records; the browser's original localStorage copy is left
  untouched. Local password hashes are upgraded to scrypt when those users
  first sign in.
- Preserve `npi-local-v1` until the shared records have been checked. Exports
  from other browsers should be reviewed and reconciled separately.
- Uploaded documents remain unavailable in this hosting mode without a separate
  storage integration.

## AI assistant (chat + voice)

- Enabled when the `ANTHROPIC_API_KEY` secret is set (restart after adding it).
  Optional: `AI_MODEL` (default `claude-sonnet-5-5`), `AI_MAX_REQUESTS_PER_10MIN`
  (default 120 per user, per server instance), `ANTHROPIC_BASE_URL` (tests only).
- `GET /api/ai/status` reports whether it is enabled. `POST /api/ai/chat` requires a
  signed-in session and same-origin request, validates the conversation shape
  (roles, block types, image types/sizes, tool definitions), stamps the real account
  into the system prompt and relays to the Anthropic Messages API. The key never
  reaches the browser.
- The relay performs no writes. The browser runs the model's tools: read tools use
  the user's already-filtered data; write tools only add steps to a plan. After the
  user approves the bullet summary, each step runs through the same UI actions as
  the buttons, so every write still goes through `/api/data` permission checks.
- Voice uses the browser's Web Speech API (`ar-SA`); the page's Permissions-Policy
  now allows `microphone=(self)`. No audio is uploaded to this server.
- `node tests/ai-server.browser.js` (with `TEST_DATABASE_URL` pointing at an empty
  database with `db/schema.sql` applied) runs the real server against a scripted
  Anthropic stand-in: voice → plan → approval → server-side writes, permission
  refusals, forged writes, and upstream errors.
- Demo seed note: the seed's `gm` username is shorter than the server's 3-character
  minimum, so it is not imported; the owner setup account becomes the GM.
- The optional demo seed is served at `/seed/seed.json`; see README.md for the
  manual import procedure. Do not use demo credentials for real company data.
- The web server deliberately serves only the app and optional demo seed, not
  repository files, configuration, or directory listings.

## Publishing

- Keep the existing Autoscale publishing target.
- Build command: `npm run build:publish`. This performs a clean install of
  production dependencies from the lockfile before building the HTML. Do not
  rely on the workspace's `node_modules` being included in a published image.
- Run command: `npm start`.
- Keep `node_modules/` ignored by Git, but not by `.replitignore`: publishing
  needs the production dependencies installed by the build.
- Apply `db/schema.sql` to development before publishing schema changes;
  Publish handles the development-to-production schema migration. Never add
  production DDL to the build command or server startup.
- The server listens on `0.0.0.0:5000`, matching the configured public port.
- Do not use an editor's single-file run command (`bash $file`) for publishing:
  it does not launch the application server.
- Publishing configuration changes take effect only after publishing again.

## Workflow permissions (server)

- `projects.create` (new): add leads, opportunities and projects and run lead
  negotiation. Default for GM, admin, projects manager and finance manager.
  Roles saved before this permission existed get it from their role default
  (role definitions now record the permission list they were saved with).
- New projects are authorised by `projects.create` and may only start at the
  `lead` or `study` stage. (Previously the "can see this project" check ran
  first and rejected every new project, so no one could add a lead/opportunity.)
- Roles that can see a project but not edit it (e.g. store) may only append to
  its activity log; any other change is still rejected.
- Users without `see.money` create receipts/stock movements without prices; the
  server fills them from the purchase order (or the item's reference cost) so
  supplier invoices and payments have the right values.
- `npm run test:server` runs the full cycle (`t7-server.browser.js`, 73 checks)
  and alternative paths (`t9-server.browser.js`, 45 checks) against the real
  server, logging in through the login screen for every hand-off. Each needs
  `TEST_DATABASE_URL` pointing at an empty database with `db/schema.sql`.

## Tests

Run `npm run test:release` before publishing. It requires Node/npm, Python 3,
and PostgreSQL tools (`initdb`, `pg_ctl`, `psql`) on PATH, as a non-root user.
It builds a disposable release with production-only dependencies and starts
`npm start` against its own temporary PostgreSQL cluster (private Unix socket,
no TCP listener). It ignores existing database credentials and secrets, checks
`/` and `/api/session`, verifies missing-table diagnostics, and removes the
temporary release/database afterward. It never applies DDL to development or
production. Missing schema is reported as HTTP 503 with
`DATABASE_SCHEMA_MISSING`; server logs point to the normal schema migration.
The release check also exercises login throttling across two server processes,
restart persistence, parallel guesses, expiration, cleanup and fail-closed behavior.

Login protection uses PostgreSQL, not process memory or forwarded IP headers.
Each account allows five attempts; the fifth starts a 60-second lockout.
Attempts are reserved atomically before password verification, so concurrent
guesses count toward the limit. A successful login clears its reservation only
if no later attempt has arrived. Partial failures expire after 60 seconds.
Unknown usernames share one separate bucket; storage is bounded to one row per
account plus one unknown bucket, with expired entries cleaned on login requests.

The repository's existing Playwright tests are under `tests/`. `npm test` runs
the imported test suite; its scripts may require adapting their original paths
and browser executable assumptions before they can run on Replit.

## Material sales to outside buyers (server rules)

- Collection `sales`; no schema change (records live in `npi_records`). New permissions:
  `sales.create` (default: store, GM, admin) and `sales.approve` (default: finance, GM, admin). Roles saved
  before this release receive them through the same "newer permission" fallback as `projects.create`.
- Read: holders of either permission, or `view.finance` + `see.money`. Users without `see.money` get the
  record with every amount removed, and any price they send on create is dropped.
- Create: `sales.create`, status `fin`, own user id, at least one line, no invoice fields.
- While `fin` / `rejected`: the preparer side may edit, resubmit or cancel; `sales.approve` + `see.money` may
  reject (reason required) or invoice. Invoicing requires unchanged buyer and quantities, a unique invoice
  number, SAR/JOD/USD with a rate, `local` (15%) or `export` (0%), a price on every line, totals that add up,
  and stock moves already written for every line.
- Stock moves of kind `sale` (`MAIN` → `SALE`) are accepted only from `sales.approve`, only for a sale still
  in `fin`, never above the requested quantity, and never above the main-store balance.
- After invoicing only one new payment at a time may be appended, never above the total; a paid invoice is closed.
- In server mode PDF and Excel files download straight from the browser (blob download).
- `node tests/t12-server.browser.js` (with `TEST_DATABASE_URL`) covers these rules against the real server.

