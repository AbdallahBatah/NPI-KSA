// Isolated setup-boundary tests. Never connect to, or reset, the company database.
const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const crypto = require("node:crypto");

const root = path.join(__dirname, "..");
const source = fs.readFileSync(path.join(root, "server.js"), "utf8");
const token = () => crypto.randomBytes(32).toString("hex");

function harness(secret = token(), initialized = false, secretName = "BOOTSTRAP_OWNER_TOKEN") {
  const state = { users: initialized ? [{ id: "existing", username: "existing" }] : [], records: [], sessions: [] };
  let lock = Promise.resolve();
  let failImport = false;
  const statements = [];
  async function query(sql, args = [], client) {
    statements.push(sql);
    if (sql === "BEGIN") return {};
    if (sql.includes("pg_advisory_xact_lock")) {
      const previous = lock;
      lock = new Promise(resolve => { client.unlock = resolve; });
      await previous;
      client.data = structuredClone(state);
      return {};
    }
    if (sql === "COMMIT") {
      Object.assign(state, client.data);
      client.unlock();
      client.unlock = null;
      return {};
    }
    if (sql === "ROLLBACK") {
      client.unlock?.();
      client.unlock = null;
      return {};
    }
    const data = client?.data || state;
    if (sql.includes("SELECT EXISTS(SELECT 1 FROM npi_users)")) return { rows: [{ exists: !!data.users.length }] };
    if (sql === "SELECT 1 FROM npi_users LIMIT 1") return { rowCount: data.users.length ? 1 : 0 };
    if (sql.startsWith("INSERT INTO npi_users")) {
      data.users.push({ id: args[0], username: args[1], name: args[2] });
      return {};
    }
    if (sql.startsWith("INSERT INTO npi_records")) {
      if (failImport) throw new Error("Simulated import failure");
      data.records.push(args.length === 3
        ? { collection: args[0], id: args[1], data: JSON.parse(args[2]) }
        : { collection: sql.includes("'audit'") ? "audit" : "team", id: args[0], data: JSON.parse(args[1]) });
      return {};
    }
    if (sql.startsWith("INSERT INTO npi_sessions")) { data.sessions.push(args[1]); return {}; }
    throw new Error(`Unhandled test query: ${sql}`);
  }
  const pool = {
    query: (sql, args) => query(sql, args),
    connect: async () => {
      const client = { release() {} };
      client.query = (sql, args) => query(sql, args, client);
      return client;
    },
  };
  const context = vm.createContext({
    require(name) {
      if (name === "pg") return { Pool: function () { return pool; } };
      if (name === "node:http") return { createServer: () => ({ listen() {} }) };
      return require(name);
    },
    __dirname: root, Buffer, URL, console,
    process: { env: secret == null ? {} : { [secretName]: secret }, on() {} },
  });
  vm.runInContext(source, context);
  async function request({ supplied, body = {}, route = "/api/auth/setup", method = "POST", origin } = {}) {
    let bodyRead = false;
    const req = {
      method, headers: { host: "npi.test", ...(supplied === undefined ? {} : { "x-npi-setup-token": supplied }), ...(origin ? { origin } : {}) },
      socket: {},
      async *[Symbol.asyncIterator]() { bodyRead = true; yield Buffer.from(JSON.stringify(body)); },
    };
    const result = {};
    const res = {
      writeHead(status, headers) { result.status = status; result.headers = headers; },
      end(value) { result.body = JSON.parse(value); },
    };
    try { await context.handleApi(req, res, new URL(route, "https://npi.test")); }
    catch (error) { result.status = error.status || 500; result.body = { error: error.status ? error.message : "server error" }; }
    result.bodyRead = bodyRead;
    return result;
  }
  return { request, state, secret, statements, failImport(value) { failImport = value; } };
}
const account = () => ({ name: "Owner", username: "owner", password: `P${token()}` });

test("unconfigured and weak owner secrets fail closed before reading the body", async () => {
  for (const secret of [null, "", "short", "x".repeat(513)]) {
    const app = harness(secret);
    const response = await app.request({ supplied: token(), body: account() });
    assert.equal(response.status, 503);
    assert.equal(response.bodyRead, false);
    assert.equal(app.state.users.length, 0);
    assert.equal(app.state.records.length, 0);
    assert.equal(app.state.sessions.length, 0);
  }
});

test("the existing owner secret name remains supported with header authentication", async () => {
  const app = harness(token(), false, "NPI_SETUP_TOKEN");
  assert.equal((await app.request({ supplied: app.secret, body: account() })).status, 200);
});

test("anonymous visitors cannot bootstrap using missing, wrong, or body-only tokens", async () => {
  const app = harness();
  for (const supplied of [undefined, "", "short", token(), "x".repeat(513)]) {
    const response = await app.request({ supplied, body: { ...account(), ownerToken: app.secret, importData: { projects: { p1: { name: "Private" } } } } });
    assert.equal(response.status, 403);
    assert.equal(response.bodyRead, false);
    assert.equal(response.headers?.["Set-Cookie"], undefined);
    assert.equal(JSON.stringify(response.body).includes(app.secret), false);
  }
  assert.equal(app.state.users.length, 0);
  assert.equal(app.state.records.length, 0);
  assert.equal(app.state.sessions.length, 0);
});

test("owner can initialize without importing and receives a session", async () => {
  const app = harness();
  const response = await app.request({ supplied: app.secret, body: account() });
  assert.equal(response.status, 200);
  assert.match(response.headers["Set-Cookie"], /HttpOnly; SameSite=Strict/);
  assert.equal(app.state.users.length, 1);
  assert.equal(app.state.sessions.length, 1);
  assert.equal(app.state.records.filter(r => r.collection === "projects").length, 0);
  assert.equal(JSON.stringify(response).includes(app.secret), false);
});

test("authorized optional snapshot import retains projects and existing admin identity", async () => {
  const app = harness();
  const importData = {
    team: { original: { id: "original", username: "owner", role: "gm", name: "Old owner" } },
    projects: { p1: { id: "p1", name: "Existing project", password: "discard" } },
  };
  const original = JSON.stringify(importData);
  const response = await app.request({ supplied: app.secret, body: { ...account(), importData } });
  assert.equal(response.status, 200);
  assert.equal(app.state.users[0].id, "original");
  assert.equal(app.state.records.find(r => r.id === "p1").data.name, "Existing project");
  assert.equal(app.state.records.find(r => r.id === "p1").data.password, undefined);
  assert.equal(JSON.stringify(importData), original);
});

test("setup stays disabled with existing users, even with the correct token", async () => {
  for (const freshSetup of [false, true]) {
    const app = harness(token(), !freshSetup);
    if (freshSetup) await app.request({ supplied: app.secret, body: account() });
    for (const supplied of [undefined, app.secret, token()]) {
      const response = await app.request({ supplied, body: account() });
      assert.equal(response.status, 409);
      assert.equal(response.bodyRead, false);
      assert.equal(response.headers?.["Set-Cookie"], undefined);
    }
    assert.equal(app.state.users.length, 1);
    const session = await app.request({ route: "/api/session", method: "GET" });
    assert.equal(session.body.setupRequired, false);
  }
});

test("concurrent authorized requests create exactly one first admin", async () => {
  const app = harness();
  const responses = await Promise.all([1, 2].map(() => app.request({ supplied: app.secret, body: account() })));
  assert.deepEqual(responses.map(r => r.status).sort(), [200, 409]);
  assert.equal(app.state.users.length, 1);
  assert.equal(app.state.sessions.length, 1);
});

test("invalid owner input and failed imports roll back without consuming setup", async () => {
  const app = harness();
  const invalid = await app.request({ supplied: app.secret, body: { ...account(), password: "weak" } });
  assert.equal(invalid.status, 400);
  app.failImport(true);
  const failed = await app.request({ supplied: app.secret, body: { ...account(), importData: { projects: { p1: { name: "Project" } } } } });
  assert.equal(failed.status, 500);
  assert.equal(app.state.users.length, 0);
  assert.equal(app.state.records.length, 0);
  assert.equal(app.state.sessions.length, 0);
  app.failImport(false);
  assert.equal((await app.request({ supplied: app.secret, body: account() })).status, 200);
});

test("cross-origin setup is rejected even with the owner token", async () => {
  const app = harness();
  assert.equal((await app.request({ supplied: app.secret, origin: "https://attacker.test", body: account() })).status, 403);
  assert.equal(app.state.users.length, 0);
});

test("ordinary account creation still requires a signed-in admin", async () => {
  const app = harness();
  assert.equal((await app.request({ method: "PUT", route: "/api/data/team/attacker", body: { role: "gm" } })).status, 401);
  assert.equal(app.state.users.length, 0);
});

test("setup form sends the token only in a header and preserves optional local import", () => {
  const html = fs.readFileSync(path.join(root, "src/npi-projects.html"), "utf8");
  assert.match(html, /id="suOwnerToken" type="password"/);
  assert.match(html, /'X-NPI-Setup-Token':ownerToken/);
  assert.match(html, /\$\('#suOwnerToken'\)\.value=''/);
  assert.match(html, /local&&\$\('#suImportLocal'\)\?\.checked\?local:null/);
  assert.doesNotMatch(html, /(?:localStorage|sessionStorage)\.setItem\([^;\n]*(?:ownerToken|suOwnerToken)/);
});
