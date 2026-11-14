const assert = require("node:assert/strict");
const crypto = require("node:crypto");

// Uses only the disposable release database supplied by release-smoke.js.
module.exports = async function loginProtection({ sql, base, startInstance, stopInstance }) {
  const password = "Test-password-4829";
  const hash = crypto.scryptSync(password, "test-salt", 64).toString("hex");
  await sql(`INSERT INTO npi_users(id,username,display_name,role,pw_algo,pw_salt,pw_hash,active)
    VALUES ('limit-a','limit.a','Limiter A','eng','scrypt','746573742d73616c74','${hash}',true),
           ('limit-b','limit.b','Limiter B','eng','scrypt','746573742d73616c74','${hash}',true),
           ('limit-off','limit.off','Inactive','eng','scrypt','746573742d73616c74','${hash}',false)`);
  const check = expression => sql(`DO $$ BEGIN
    IF NOT (${expression}) THEN RAISE EXCEPTION 'Login protection assertion failed'; END IF;
    END $$`);
  async function login(username, pass = "wrong-password", target = base, headers = {}) {
    const response = await fetch(target + "/api/auth/login", {
      method: "POST", headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ username, password: pass }), signal: AbortSignal.timeout(10000),
    });
    return { status: response.status, cookie: response.headers.get("set-cookie"), body: await response.json() };
  }
  let other = await startInstance();
  try {
    for (let i = 0; i < 5; i++) {
      assert.equal((await login(i % 2 ? " LIMIT.A " : "limit.a", undefined,
        i % 2 ? other.base : base, { "X-Forwarded-For": `192.0.2.${i}` })).status, 401);
    }
    await check(`SELECT attempts=5 AND expires_at > now()+interval '55 seconds'
      AND expires_at <= now()+interval '60 seconds' FROM npi_login_limits WHERE bucket='user:limit-a'`);
    // Even the right password cannot bypass a lock; blocked requests do not write.
    const before = await sql("SELECT attempt_token,expires_at FROM npi_login_limits WHERE bucket='user:limit-a'");
    assert.equal((await login("limit.a", password, other.base)).status, 429);
    assert.equal(await sql("SELECT attempt_token,expires_at FROM npi_login_limits WHERE bucket='user:limit-a'"), before);
    await stopInstance(other);
    other = await startInstance();
    assert.equal((await login("limit.a", password, other.base)).status, 429);
    assert.equal((await login("limit.b", password, other.base)).status, 200);
    console.log("PASS lockout spans instances, normalization, forwarded IP changes and process restarts");

    await sql("UPDATE npi_login_limits SET expires_at=now()-interval '1 second' WHERE bucket='user:limit-a'");
    const success = await login("limit.a", password);
    assert.equal(success.status, 200);
    assert.match(success.cookie, /npi_session=.*HttpOnly/);
    await check("SELECT count(*)=0 FROM npi_login_limits WHERE bucket='user:limit-a'");
    for (let i = 0; i < 4; i++) assert.equal((await login("limit.a")).status, 401);
    assert.equal((await login("limit.a", password)).status, 200);
    await check("SELECT count(*)=0 FROM npi_login_limits WHERE bucket='user:limit-a'");
    console.log("PASS expired locks recover and successful sign-in clears earlier failures");

    const parallel = await Promise.all(Array.from({ length: 24 }, (_, i) =>
      login("limit.a", undefined, i % 2 ? base : other.base)));
    assert.equal(parallel.filter(result => result.status === 401).length, 5);
    assert.equal(parallel.filter(result => result.status === 429).length, 19);
    await check("SELECT attempts=5 FROM npi_login_limits WHERE bucket='user:limit-a'");
    console.log("PASS concurrent guesses across two processes cannot race past the five-attempt limit");

    const unknown = await Promise.all(Array.from({ length: 80 }, (_, i) =>
      login(`unknown.${i}`, undefined, i % 2 ? base : other.base)));
    assert.equal(unknown.filter(result => result.status === 401).length, 5);
    assert.equal(unknown.filter(result => result.status === 429).length, 75);
    await check("SELECT count(*)=1 FROM npi_login_limits WHERE user_id IS NULL");
    assert.equal((await login("limit.b", password)).status, 200);
    for (let i = 0; i < 5; i++) assert.equal((await login("limit.off", password)).status, 401);
    assert.equal((await login("limit.off", password)).status, 429);
    await check("SELECT count(*) <= (SELECT count(*)+1 FROM npi_users) FROM npi_login_limits");
    console.log("PASS varied nonexistent usernames share one bucket and inactive accounts are also throttled");

    await sql("UPDATE npi_login_limits SET expires_at=now()-interval '1 second'");
    assert.equal((await login("limit.b")).status, 401);
    await check("SELECT count(*)=1 FROM npi_login_limits");
    await sql("DELETE FROM npi_users WHERE id='limit-b'");
    await check("SELECT count(*)=0 FROM npi_login_limits");
    console.log("PASS stale entries are evicted and account deletion removes associated throttle state");

    await sql("ALTER TABLE npi_login_limits RENAME TO hidden_login_limits");
    const unavailable = await login("limit.a", password);
    assert.equal(unavailable.status, 503);
    assert.equal(unavailable.body.code, "DATABASE_SCHEMA_MISSING");
    assert.equal(unavailable.cookie, null);
    await sql("ALTER TABLE hidden_login_limits RENAME TO npi_login_limits");
    console.log("PASS unavailable throttle storage fails closed without creating a session");
  } finally {
    await stopInstance(other);
  }
};
