# Running on Replit

- Keep the existing single-file HTML/CSS/JavaScript structure.
- Click Run to launch the `Start application` workflow (`npm run dev`).
- The command builds `index.html` from `src/npi-projects.html`, then runs the
  Python standard-library web server on `0.0.0.0:5000`.
- Make application changes in `src/npi-projects.html`, then restart Run to rebuild.
- `npm run build` rebuilds only; `npm start` serves the existing build.
- There are no application runtime package dependencies or required secrets.
- A fresh browser shows login only. There is no public first-run account
  creation; an administrator with user-management permission must create users.
- In this original browser-local mode, accounts exist only in the browser's
  local data. A fresh browser profile has no account to log into.

## Publishing

- Keep the existing Autoscale publishing target.
- Build command: `npm run build`.
- Run command: `npm start`.
- The server listens on `0.0.0.0:5000`, matching the configured public port.
- Do not use an editor's single-file run command (`bash $file`) for publishing:
  it does not launch the application server.
- Publishing configuration changes take effect only after publishing again.

## Existing limitations

- This is the app's original local-preview mode. Data and account credentials
  stay in the current browser's localStorage, not a shared server database.
  Clearing browser storage deletes this local data. Use the app's export
  features for backups.
- Permissions and login checks are client-side only. This setup is not a secure
  multi-user production system.
- The AI assistant, hosted file uploads, and shared database use Claude-specific
  hosting APIs and are unavailable here without separate integration work.
- The optional demo seed is served at `/seed/seed.json`; see README.md for the
  manual import procedure. Do not use demo credentials for real company data.
- The web server deliberately serves only the app and optional demo seed, not
  repository files, configuration, or directory listings.

## Tests

The repository's existing Playwright tests are under `tests/`. `npm test` runs
the imported test suite; its scripts may require adapting their original paths
and browser executable assumptions before they can run on Replit.
