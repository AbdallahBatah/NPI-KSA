// No workspace packages or database credentials are used by this release check.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const net = require("node:net");
const crypto = require("node:crypto");
const { spawn, spawnSync } = require("node:child_process");
const { once } = require("node:events");

const ROOT = path.resolve(__dirname, "..");
const children = new Set();
let temporary;
let clusterStarted = false;
// Deliberate allowlist: never inherit DATABASE_URL, PG*, NODE_PATH, NODE_OPTIONS,
// npm configuration, or application secrets from development/production.
const env = Object.fromEntries(
  ["PATH", "SystemRoot", "LANG", "LC_ALL", "SSL_CERT_FILE", "SSL_CERT_DIR", "NODE_EXTRA_CA_CERTS"]
    .filter(key => process.env[key]).map(key => [key, process.env[key]]),
);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function kill(child, signal = "SIGTERM") {
  if (child.exitCode !== null || child.signalCode !== null) return;
  try { process.kill(-child.pid, signal); } catch (error) {
    if (error.code !== "ESRCH") throw error;
  }
}

function launch(command, args, cwd, extraEnv = {}) {
  const child = spawn(command, args, {
    cwd, env: { ...env, ...extraEnv }, detached: true, stdio: ["ignore", "pipe", "pipe"],
  });
  children.add(child);
  child.output = "";
  child.stdout.on("data", data => { child.output += data; });
  child.stderr.on("data", data => { child.output += data; });
  // Attach immediately, including for missing executable failures.
  child.finished = new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", code => {
      children.delete(child);
      resolve(code);
    });
  });
  child.finished.catch(() => {});
  return child;
}

async function run(command, args, cwd, extraEnv = {}, timeout = 30000) {
  const child = launch(command, args, cwd, extraEnv);
  const timer = setTimeout(() => kill(child, "SIGKILL"), timeout);
  try {
    const code = await child.finished;
    assert.equal(code, 0, `${command} ${args.join(" ")} failed:\n${child.output}`);
    return child.output;
  } finally {
    clearTimeout(timer);
  }
}

function cleanup() {
  for (const child of children) kill(child, "SIGKILL");
  if (clusterStarted) {
    const stopped = spawnSync("pg_ctl", ["-D", path.join(temporary, "pgdata"), "-m", "immediate", "-w", "stop"],
      { env, encoding: "utf8", timeout: 15000 });
    if (stopped.status !== 0) {
      console.error("Could not stop temporary PostgreSQL; retained:", temporary);
      process.exitCode = 1;
      return;
    }
    clusterStarted = false;
  }
  if (temporary) fs.rmSync(temporary, { recursive: true, force: true });
}

async function unusedPort() {
  const socket = net.createServer();
  socket.listen(0, "127.0.0.1");
  await once(socket, "listening");
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  return port;
}

async function request(base, route, headers = {}) {
  const response = await fetch(base + route, { headers, signal: AbortSignal.timeout(3000) });
  const text = await response.text();
  return { status: response.status, type: response.headers.get("content-type"), text };
}

async function main() {
  for (const command of ["npm", "python3", "initdb", "pg_ctl", "psql"]) {
    const found = spawnSync(command, ["--version"], { env, encoding: "utf8" });
    assert.equal(found.status, 0, `Release smoke check requires ${command} on PATH (PostgreSQL server/client tools are required).`);
  }
  assert.notEqual(process.getuid?.(), 0, "Run as a non-root user; initdb refuses root.");
  temporary = fs.mkdtempSync(path.join(os.tmpdir(), "npi-release-"));
  env.HOME = path.join(temporary, "home");
  fs.mkdirSync(env.HOME);
  const release = path.join(temporary, "app");
  fs.mkdirSync(release);
  // Explicit release inputs: never copy node_modules, built HTML, .env or Git.
  for (const name of ["package.json", "package-lock.json", "server.js", "src", "tools", "db", "seed"]) {
    fs.cpSync(path.join(ROOT, name), path.join(release, name), { recursive: true });
  }
  const deployment = fs.readFileSync(path.join(ROOT, ".replit"), "utf8").split("[deployment]")[1]?.split(/\n\[/)[0];
  assert.match(deployment || "", /build\s*=\s*\["npm",\s*"run",\s*"build:publish"\]/);
  assert.match(deployment, /run\s*=\s*\["npm",\s*"start"\]/);
  await run("npm", ["run", "build:publish"], release, { NODE_ENV: "production" }, 180000);
  assert.ok(fs.statSync(path.join(release, "index.html")).size > 0);
  await run("npm", ["ls", "--omit=dev", "--all"], release);
  await run(process.execPath, ["-e", `
    const assert = require("node:assert/strict");
    const path = require("node:path");
    const pkg = require("./package.json");
    // Include pg explicitly so accidentally moving it to devDependencies fails.
    for (const name of new Set(["pg", ...Object.keys(pkg.dependencies || {})])) {
      const resolved = require.resolve(name);
      assert.ok(resolved.startsWith(path.join(process.cwd(), "node_modules") + path.sep),
        name + " must resolve inside the disposable release, not a parent/global install");
      require(name);
    }
    for (const name of Object.keys(pkg.devDependencies || {})) {
      assert.throws(() => require.resolve(name), { code: "MODULE_NOT_FOUND" });
    }
  `], release);
  console.log("PASS clean publish build and production-only runtime dependency resolution");

  const socketDir = path.join(temporary, "socket");
  fs.mkdirSync(socketDir, { mode: 0o700 });
  const pgdata = path.join(temporary, "pgdata");
  await run("initdb", ["-D", pgdata, "-U", "release_smoke", "--auth=trust", "--no-locale", "--encoding=UTF8"], temporary);
  // No TCP listener. The private socket and 0700 directory isolate this cluster.
  await run("pg_ctl", ["-D", pgdata, "-l", path.join(temporary, "postgres.log"),
    "-o", `-F -k ${socketDir} -c listen_addresses=''`, "-w", "start"], temporary);
  clusterStarted = true;
  const sql = statement => run("psql", ["-X", "-v", "ON_ERROR_STOP=1", "-h", socketDir,
    "-U", "release_smoke", "-d", "postgres", "-c", statement], temporary);
  const databaseUrl = `postgresql://release_smoke@localhost/postgres?host=${encodeURIComponent(socketDir)}`;
  const port = await unusedPort();
  const app = launch("npm", ["start"], release, { NODE_ENV: "production", PORT: String(port), DATABASE_URL: databaseUrl });
  const base = `http://127.0.0.1:${port}`;
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    assert.equal(app.exitCode, null, `npm start exited early:\n${app.output}`);
    try {
      const page = await request(base, "/");
      assert.equal(page.status, 200);
      assert.match(page.type, /text\/html/);
      assert.equal(page.text, fs.readFileSync(path.join(release, "index.html"), "utf8"));
      ready = true;
      break;
    } catch {
      await sleep(100);
    }
  }
  assert.ok(ready, `npm start did not serve the built app:\n${app.output}`);
  console.log("PASS npm start serves GET / from the disposable release");

  async function missingSchema(route = "/api/session", headers = {}) {
    const result = await request(base, route, headers);
    assert.equal(result.status, 503, result.text);
    const body = JSON.parse(result.text);
    assert.equal(body.code, "DATABASE_SCHEMA_MISSING");
    assert.match(body.error, /جداول قاعدة البيانات/);
    assert.doesNotMatch(result.text, /SELECT|postgresql:|node_modules|stack/);
    // Logging crosses a pipe and may arrive just after the response.
    for (let i = 0; i < 50 && !app.output.includes("[DATABASE_SCHEMA_MISSING]"); i++) await sleep(20);
    assert.match(app.output, /\[DATABASE_SCHEMA_MISSING\].*db\/schema\.sql.*development.*publish/);
    app.output = "";
  }
  await missingSchema();
  const tableCount = await sql("SELECT count(*) FROM pg_tables WHERE schemaname='public'");
  assert.match(tableCount, /\b0\b/, "startup/build must not create tables");
  console.log("PASS empty database reports actionable missing-schema diagnostic without creating tables");

  // DDL is test-fixture setup only, never part of publish build or server startup.
  await run("psql", ["-X", "-v", "ON_ERROR_STOP=1", "-h", socketDir, "-U", "release_smoke",
    "-d", "postgres", "-f", path.join(release, "db/schema.sql")], temporary);
  const session = await request(base, "/api/session");
  assert.equal(session.status, 200, session.text);
  assert.match(session.type, /application\/json/);
  assert.deepEqual(JSON.parse(session.text), { authenticated: false, setupRequired: true, user: null });
  const headers = { Cookie: "npi_session=release-smoke-token" };
  assert.equal((await request(base, "/api/session", headers)).status, 200);
  console.log("PASS GET /api/session against the real test schema, with and without a cookie");

  await sql("ALTER TABLE npi_sessions RENAME TO hidden_sessions");
  await missingSchema("/api/session", headers);
  await sql("ALTER TABLE hidden_sessions RENAME TO npi_sessions");
  const tokenHash = crypto.createHash("sha256").update("release-smoke-token").digest("hex");
  await sql(`INSERT INTO npi_users(id,username,display_name,role,pw_algo,pw_salt,pw_hash)
    VALUES('smoke','smoke','Release smoke','gm','scrypt','','');
    INSERT INTO npi_sessions(token_hash,user_id,expires_at) VALUES('${tokenHash}','smoke',now()+interval '1 hour')`);
  assert.equal((await request(base, "/api/data", headers)).status, 200);
  await sql("ALTER TABLE npi_records RENAME TO hidden_records");
  await missingSchema("/api/data", headers);
  console.log("PASS missing sessions and records tables also report the schema diagnostic");
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    cleanup();
    process.exit(signal === "SIGINT" ? 130 : 143);
  });
}
main().catch(error => {
  console.error("FAIL release smoke check:", error.message);
  process.exitCode = 1;
}).finally(cleanup);
