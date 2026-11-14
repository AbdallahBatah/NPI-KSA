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
- On a fresh browser, the Arabic first-run screen creates the general manager
  account. No demo data is automatically loaded.

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

The repository's existing Playwright tests are under `tests/`. `npm test` runs
the imported test suite; its scripts may require adapting their original paths
and browser executable assumptions before they can run on Replit.
