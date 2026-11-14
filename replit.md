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
- Uploaded documents and the AI assistant remain unavailable in this hosting
  mode without separate storage/API integrations.
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
- Apply `db/schema.sql` to development before publishing schema changes;
  Publish handles the development-to-production schema migration. Never add
  production DDL to the build command or server startup.
- The server listens on `0.0.0.0:5000`, matching the configured public port.
- Do not use an editor's single-file run command (`bash $file`) for publishing:
  it does not launch the application server.
- Publishing configuration changes take effect only after publishing again.

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
