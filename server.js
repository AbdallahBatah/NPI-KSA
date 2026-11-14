const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { promisify } = require("node:util");
const { Pool } = require("pg");

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 5000);
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.PGSSLMODE === "require" ? { rejectUnauthorized: false } : undefined });
const scrypt = promisify(crypto.scrypt);
const COLLECTIONS = [
  "team", "items", "suppliers", "templates", "projects", "mreqs", "issues",
  "prs", "grns", "returns", "dlogs", "overruns", "claims", "moves", "costs",
  "spay", "meta", "clients", "audit", "ftasks",
];
const PROJECT_STAGES = ["lead", "study", "budget", "budget_review", "quote", "contract_review", "setup", "planning", "execution", "handover_review", "close_review", "closed"];
const DEFAULT_PERMS = {
  gm: ["view.dashboard", "view.pipeline", "view.clients", "projects.all", "view.stock", "view.purchasing", "view.finance", "view.settings", "see.money", "clients.manage", "items.manage", "suppliers.manage", "templates.manage", "tasks.assign", "data.import", "data.export", "admin.users", "admin.roles", "admin.matrix", "admin.org", "admin.audit", "admin.demo"],
  admin: ["view.dashboard", "view.pipeline", "view.clients", "projects.all", "view.stock", "view.purchasing", "view.finance", "view.settings", "see.money", "clients.manage", "items.manage", "suppliers.manage", "templates.manage", "tasks.assign", "data.import", "data.export", "admin.users", "admin.roles", "admin.matrix", "admin.org", "admin.audit", "admin.demo"],
  pgm: ["view.dashboard", "view.pipeline", "view.clients", "projects.all", "view.stock", "view.purchasing", "view.finance", "view.settings", "see.money", "clients.manage", "items.manage", "suppliers.manage", "templates.manage", "tasks.assign", "data.import", "data.export"],
  fin: ["view.dashboard", "view.pipeline", "view.clients", "projects.all", "view.stock", "view.purchasing", "view.finance", "view.settings", "see.money", "clients.manage", "items.manage", "suppliers.manage", "data.import", "data.export"],
  tech: ["view.pipeline", "view.clients", "projects.all", "view.stock", "view.purchasing", "see.money", "data.export"],
  eng: ["view.stock", "data.export"],
  store: ["view.stock", "view.purchasing", "items.manage", "data.import", "data.export"],
};
const ROLE_BASE = { gm: "gm", pgm: "pgm", fin: "fin", eng: "eng", tech: "tech", store: "store", admin: "admin" };
const SECRET_FIELDS = /^(passHash|password|passwordHash|passwordSalt|salt|session|token)$/i;
const MONEY_FIELDS = /^(cost|price|amount|total|vat|creditLimit|rate|finNote|payTerms|margin|profit|paid|payment|payments|invoice|financial|sale|expense|retained|advance|contractValue|subtotal|grandTotal)$/i;
const loginFailures = new Map();

function fail(status, message) {
  const error = new Error(message);
  error.status = status;
  throw error;
}
function send(res, status, data, headers = {}) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "same-origin",
    ...headers,
  });
  res.end(body);
}
function cookieMap(req) {
  return Object.fromEntries((req.headers.cookie || "").split(";").map(v => v.trim().split(/=(.*)/s).slice(0, 2)).filter(x => x[0]));
}
function sessionCookie(req, value, maxAge) {
  const forwardedProto = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim();
  const secure = req.socket.encrypted || forwardedProto === "https" || !!process.env.REPLIT_DOMAINS;
  return `npi_session=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
}
function checkOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return;
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  try {
    if (new URL(origin).host !== host) fail(403, "مصدر الطلب غير مسموح");
  } catch {
    fail(403, "مصدر الطلب غير مسموح");
  }
}
async function readBody(req, max = 50 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > max) fail(413, "حجم البيانات أكبر من المسموح");
    chunks.push(chunk);
  }
  if (!size) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    fail(400, "بيانات الطلب غير صالحة");
  }
}
const cleanId = id => typeof id === "string" && id.length > 0 && id.length <= 160 && !id.includes("/") && !id.includes("\0");
const usernameOK = u => /^[a-z0-9._-]{3,30}$/.test(String(u || ""));
function validatePassword(p) {
  if (typeof p !== "string" || p.length < 8 || !/[0-9]/.test(p) || !/[A-Za-z؀-ۿ]/.test(p)) fail(400, "كلمة المرور لا تحقق الشروط المطلوبة");
}
function cleanSecrets(value) {
  if (Array.isArray(value)) return value.map(cleanSecrets);
  if (!value || typeof value !== "object") return value;
  const out = {};
  for (const [key, val] of Object.entries(value)) if (!SECRET_FIELDS.test(key)) out[key] = cleanSecrets(val);
  return out;
}
function redactMoney(value) {
  if (Array.isArray(value)) return value.map(redactMoney);
  if (!value || typeof value !== "object") return value;
  const out = {};
  for (const [key, val] of Object.entries(value)) if (!MONEY_FIELDS.test(key)) out[key] = redactMoney(val);
  return out;
}
function preserveMoney(oldValue, newValue) {
  if (Array.isArray(oldValue) && Array.isArray(newValue)) {
    return newValue.map((next, i) => {
      const old = next?.id ? oldValue.find(x => x?.id === next.id) : oldValue[i];
      return preserveMoney(old, next);
    });
  }
  if (!oldValue || typeof oldValue !== "object" || Array.isArray(oldValue) || !newValue || typeof newValue !== "object" || Array.isArray(newValue)) return newValue;
  const out = { ...newValue };
  for (const [key, val] of Object.entries(oldValue)) {
    if (MONEY_FIELDS.test(key)) out[key] = val;
    else if (Object.hasOwn(out, key)) out[key] = preserveMoney(val, out[key]);
    else out[key] = val;
  }
  return out;
}
async function readUserBySession(req) {
  const token = cookieMap(req).npi_session;
  if (!token) return null;
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const { rows } = await pool.query(
    `SELECT u.id,u.username,u.display_name,u.role,u.active,u.must_change,u.last_login
       FROM npi_sessions s JOIN npi_users u ON u.id=s.user_id
      WHERE s.token_hash=$1 AND s.expires_at>now()`,
    [tokenHash],
  );
  const user = rows[0];
  if (user && !user.active) return null;
  return user || null;
}
async function permissionsFor(user) {
  const { rows } = await pool.query("SELECT data FROM npi_records WHERE collection='meta' AND id='roles'");
  const defs = rows[0]?.data?.defs || {};
  const info = defs[user.role] || {};
  const base = ROLE_BASE[user.role] || (info.base && ROLE_BASE[info.base] ? info.base : "eng");
  const perms = new Set(info.deleted ? [] : (info.perms || DEFAULT_PERMS[base] || []));
  if (base === "gm" || base === "admin") {
    perms.add("admin.users");
    perms.add("admin.roles");
  }
  return { base, perms };
}
async function ensureAnotherAdmin(exceptId) {
  const { rows } = await pool.query("SELECT id,role FROM npi_users WHERE active=true AND id<>$1", [exceptId || ""]);
  for (const candidate of rows) {
    if ((await permissionsFor(candidate)).perms.has("admin.users")) return;
  }
  fail(400, "يجب أن يبقى مستخدم نشط واحد على الأقل يملك صلاحية إدارة المستخدمين");
}
async function hasSetup() {
  const { rows } = await pool.query("SELECT EXISTS(SELECT 1 FROM npi_users) AS exists");
  return rows[0].exists;
}
function publicUser(user) {
  return { id: user.id, username: user.username, name: user.display_name, role: user.role, active: user.active, mustChange: user.must_change, lastLogin: user.last_login };
}
async function createPassword(password) {
  validatePassword(password);
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password, salt, 64);
  return { algo: "scrypt", salt: salt.toString("hex"), hash: hash.toString("hex") };
}
async function verifyPassword(user, password) {
  if (user.pw_algo === "legacy-sha256") {
    const digest = crypto.createHash("sha256").update(`${user.pw_salt || ""}:${password}`).digest("hex");
    const a = Buffer.from(digest, "hex"), b = Buffer.from(user.pw_hash || "", "hex");
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }
  if (user.pw_algo !== "scrypt") return false;
  const actual = await scrypt(password, Buffer.from(user.pw_salt, "hex"), 64);
  const expected = Buffer.from(user.pw_hash, "hex");
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}
async function startSession(req, res, userId) {
  const raw = crypto.randomBytes(32).toString("base64url");
  const digest = crypto.createHash("sha256").update(raw).digest("hex");
  await pool.query("INSERT INTO npi_sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '14 days')", [digest, userId]);
  send(res, 200, { ok: true }, { "Set-Cookie": sessionCookie(req, raw, 14 * 24 * 60 * 60) });
}
function collectionAllowedRead(col, user, perms) {
  if (col === "audit") return perms.has("admin.audit") && perms.has("see.money");
  if (col === "team") return true;
  if (col === "items") return perms.has("view.stock") || perms.has("view.purchasing") || perms.has("projects.all");
  if (col === "suppliers") return perms.has("view.purchasing");
  if (col === "templates") return perms.has("templates.manage") || perms.has("projects.all");
  if (["claims", "costs", "spay"].includes(col)) return perms.has("see.money") && perms.has("view.finance");
  if (["prs", "grns"].includes(col)) return perms.has("view.purchasing") || perms.has("see.money");
  if (col === "clients") return perms.has("view.clients") || perms.has("clients.manage") || perms.has("projects.all");
  if (col === "meta") return true;
  return true;
}
function canSeeProject(project, user, perms, base) {
  if (!project) return false;
  if (perms.has("projects.all")) return true;
  if (project.setup?.engineerId === user.id) return true;
  return base === "store" && PROJECT_STAGES.indexOf(project.stage) >= PROJECT_STAGES.indexOf("execution");
}
function recordProjectId(col, record, all) {
  if (record?.project) return record.project;
  if (col === "projects") return record?.id;
  if (col === "moves") {
    for (const value of [record?.from, record?.to]) if (typeof value === "string" && value.startsWith("P:")) return value.slice(2);
  }
  if (col === "issues" && record?.mreq) return all.mreqs?.[record.mreq]?.project;
  if (col === "grns" && record?.prId) return all.prs?.[record.prId]?.project;
  if (col === "prs" && record?.mreq) return all.mreqs?.[record.mreq]?.project;
  return null;
}
function recordProjectIds(col, record, all) {
  const ids = new Set();
  const direct = recordProjectId(col, record, all);
  if (direct) ids.add(direct);
  if (col === "moves") {
    for (const value of [record?.from, record?.to]) if (typeof value === "string" && value.startsWith("P:")) ids.add(value.slice(2));
  }
  return [...ids];
}
function visibleMeta(id, record, perms) {
  if (["company", "contractTpl", "roles", "matrix"].includes(id)) return cleanSecrets(record);
  if (id === "org" && (perms.has("admin.org") || perms.has("projects.all"))) return cleanSecrets(record);
  if (id === "demo" && perms.has("admin.demo")) return cleanSecrets(record);
  return null;
}
async function getVisibleData(user) {
  const { base, perms } = await permissionsFor(user);
  const { rows } = await pool.query("SELECT collection,id,data FROM npi_records");
  const all = Object.fromEntries(COLLECTIONS.map(c => [c, {}]));
  for (const row of rows) all[row.collection][row.id] = { ...row.data, id: row.id };
  const out = Object.fromEntries(COLLECTIONS.map(c => [c, {}]));
  const projectMap = all.projects || {};
  for (const col of COLLECTIONS) {
    if (!collectionAllowedRead(col, user, perms)) continue;
    for (const [id, record] of Object.entries(all[col])) {
      if (col === "projects" && !canSeeProject(record, user, perms, base)) continue;
      const projectIds = recordProjectIds(col, record, all);
      if (projectIds.some(projectId => !canSeeProject(projectMap[projectId], user, perms, base))) continue;
      if (col === "meta") {
        const filtered = visibleMeta(id, record, perms);
        if (filtered) out.meta[id] = { id, ...filtered };
        continue;
      }
      let value = cleanSecrets(record);
      if (col === "team" && !perms.has("admin.users")) {
        value = { id: record.id, name: record.name, username: record.username, role: record.role, active: record.active !== false, mustChange: !!record.mustChange };
      }
      if (!perms.has("see.money")) value = redactMoney(value);
      out[col][id] = value;
    }
  }
  return out;
}
function canWriteMeta(id, perms) {
  if (id === "roles") return perms.has("admin.roles");
  if (id === "matrix") return perms.has("admin.matrix");
  if (id === "org" || id === "company") return perms.has("admin.org");
  if (id === "contractTpl") return perms.has("templates.manage") || perms.has("admin.org");
  if (id === "demo") return perms.has("admin.demo");
  return false;
}
function canWriteCollection(col, record, user, perms, base, existing, all) {
  if (col === "team") return perms.has("admin.users");
  if (col === "meta") return canWriteMeta(record.id, perms);
  if (col === "audit") return false;
  const projectIds = new Set([...recordProjectIds(col, record, all), ...recordProjectIds(col, existing || {}, all)]);
  if ([...projectIds].some(projectId => !canSeeProject(all.projects?.[projectId], user, perms, base))) return false;
  if (col === "projects") {
    if (perms.has("projects.all")) return true;
    if (existing && existing.setup?.engineerId === user.id && record.setup?.engineerId === user.id) return true;
    return !existing && base === "gm";
  }
  if (col === "clients") return perms.has("clients.manage");
  if (col === "items") return perms.has("items.manage");
  if (col === "suppliers") return perms.has("suppliers.manage");
  if (col === "templates") return perms.has("templates.manage");
  if (col === "mreqs") {
    if (base === "eng") {
      if (!existing) return record.status === "pgm" && record.by === user.id;
      return existing.by === user.id && ["partial", "issued", "done"].includes(record.status)
        && (record.lines || []).every(line => Number(line.received || 0) <= Number(line.qty || 0));
    }
    if (base === "store") return !!existing && ["approved", "partial"].includes(existing.status) && ["partial", "issued"].includes(record.status);
    return base === "pgm" || base === "gm";
  }
  if (col === "issues") {
    if (base === "store") return !existing && record.status === "sent";
    if (base === "eng") return !!existing && existing.status === "sent" && record.status === "received" && record.receivedBy === user.id;
    return false;
  }
  if (col === "prs") return perms.has("view.purchasing");
  if (col === "grns") return perms.has("view.purchasing");
  if (col === "returns") {
    if (base === "eng") return !existing && record.status === "pending" && record.by === user.id;
    return base === "store" && !!existing && existing.status === "pending" && record.status === "received";
  }
  if (col === "dlogs") {
    if (base === "eng") return !existing && record.by === user.id;
    return base === "pgm" || base === "gm";
  }
  if (col === "overruns") {
    if (base === "eng") return !existing && record.status === "pgm" && record.by === user.id;
    return base === "pgm" || base === "gm";
  }
  if (col === "claims" || col === "costs" || col === "spay") return perms.has("see.money") && perms.has("view.finance");
  if (col === "moves") {
    if (!perms.has("view.stock")) return false;
    if (base === "eng") {
      if (!["issue", "transfer"].includes(record.kind) || projectIds.size !== 1) return false;
      const projectId = [...projectIds][0];
      if (record.to !== `P:${projectId}` || !["MAIN", `P:${projectId}`].includes(record.from)) return false;
      return Object.values(all.issues || {}).some(issue => issue.project === projectId && issue.status === "sent"
        && issue.code === record.ref && (issue.lines || []).some(line => line.itemId === record.itemId && Number(line.qty) === Number(record.qty)));
    }
    if (record.kind === "return" && base === "store") {
      return Object.values(all.returns || {}).some(ret => ret.project && `P:${ret.project}` === record.from
        && ret.code === record.ref && ret.status === "pending"
        && (ret.lines || []).some(line => line.itemId === record.itemId && Number(line.qty) === Number(record.qty)));
    }
    return ["store", "pgm", "fin", "gm", "admin"].includes(base)
      && ["issue", "transfer", "return", "grn", "site", "adj", "open"].includes(record.kind);
  }
  if (col === "ftasks") return perms.has("tasks.assign") || record.by === user.id || record.assignee === user.id;
  return false;
}
function canDeleteCollection(col, record, user, perms, base) {
  if (col === "team") return perms.has("admin.users") && record.id !== user.id;
  if (col === "dlogs") {
    const age = record.date ? Date.now() - new Date(`${record.date}T00:00:00Z`).getTime() : Infinity;
    return base === "eng" && record.by === user.id && age >= 0 && age <= 3 * 24 * 60 * 60 * 1000;
  }
  if (col === "ftasks") return perms.has("tasks.assign") || record.by === user.id || record.assignee === user.id;
  if (["items", "templates", "suppliers", "meta", "audit"].includes(col)) return false;
  return !!record.demo && perms.has("admin.demo");
}
async function appendAudit(user, action, collection, id, record) {
  if (collection === "audit") return;
  const date = new Date().toISOString().slice(0, 10);
  const entry = {
    t: new Date().toISOString(), u: user.id, n: user.display_name,
    a: action, c: collection, id,
    l: record?.code || record?.poNo || record?.invoiceNo || record?.name || record?.title || record?.label || id,
    f: [],
  };
  const auditId = `${date}_${user.id}`;
  await pool.query(
    `INSERT INTO npi_records(collection,id,data) VALUES('audit',$1,$2::jsonb)
     ON CONFLICT(collection,id) DO UPDATE SET
       data=jsonb_set(npi_records.data,'{e}',COALESCE(npi_records.data->'e','[]'::jsonb)||$3::jsonb,true),
       updated_at=now()`,
    [auditId, JSON.stringify({ id: auditId, d: date, u: user.id, e: [entry] }), JSON.stringify([entry])],
  );
}
async function currentRecordMap() {
  const { rows } = await pool.query("SELECT collection,id,data FROM npi_records");
  const all = Object.fromEntries(COLLECTIONS.map(c => [c, {}]));
  for (const row of rows) all[row.collection][row.id] = { ...row.data, id: row.id };
  return all;
}
async function persistUserRecord(id, input, user, isNew = false, req) {
  const username = String(input.username || "").trim().toLowerCase();
  if (!usernameOK(username)) fail(400, "اسم المستخدم غير صالح");
  if (id === user.id && input.role && input.role !== user.role) fail(403, "لا يمكنك تغيير دور حسابك");
  const password = input.password;
  const data = { ...input, id, username };
  delete data.password;
  delete data.passHash;
  delete data.salt;
  let auth = await pool.query("SELECT id,must_change FROM npi_users WHERE id=$1", [id]);
  if (isNew && !password) fail(400, "كلمة المرور المؤقتة مطلوبة");
  const pass = password ? await createPassword(password) : null;
  if (isNew) {
    if (!pass) fail(400, "كلمة المرور المؤقتة مطلوبة");
    await pool.query(
      "INSERT INTO npi_users(id,username,display_name,role,active,must_change,pw_algo,pw_salt,pw_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",
      [id, username, data.name || "", data.role || "eng", data.active !== false, password ? data.mustChange !== false : true, pass.algo, pass.salt, pass.hash],
    );
  } else if (auth.rows.length) {
    if (data.active === false || !await permissionsFor({ ...user, role: data.role || user.role }).then(x => x.perms.has("admin.users"))) await ensureAnotherAdmin(id);
    if (pass) {
      await pool.query(
        "UPDATE npi_users SET username=$1,display_name=$2,role=$3,active=$4,must_change=$5,pw_algo=$6,pw_salt=$7,pw_hash=$8 WHERE id=$9",
        [username, data.name || "", data.role || "eng", data.active !== false, data.mustChange !== false, pass.algo, pass.salt, pass.hash, id],
      );
    } else {
      await pool.query(
        "UPDATE npi_users SET username=$1,display_name=$2,role=$3,active=$4,must_change=$5 WHERE id=$6",
        [username, data.name || "", data.role || "eng", data.active !== false, data.mustChange === undefined ? auth.rows[0].must_change : data.mustChange === true, id],
      );
    }
  } else {
    fail(400, "لا يوجد حساب مرتبط بهذا المستخدم");
  }
  if (pass) {
    const currentToken = cookieMap(req).npi_session;
    const currentHash = currentToken ? crypto.createHash("sha256").update(currentToken).digest("hex") : "";
    await pool.query("DELETE FROM npi_sessions WHERE user_id=$1 AND ($2='' OR token_hash<>$2)", [id, id === user.id ? currentHash : ""]);
  }
  if (data.active === false) await pool.query("DELETE FROM npi_sessions WHERE user_id=$1", [id]);
  return cleanSecrets(data);
}
async function bootstrap(req, res, body) {
  checkOrigin(req);
  const name = String(body.name || "").trim();
  const username = String(body.username || "").trim().toLowerCase();
  validatePassword(body.password);
  if (!name || !usernameOK(username)) fail(400, "الاسم أو اسم المستخدم غير صالح");
  if (await hasSetup()) fail(409, "النظام مهيأ بالفعل");
  const imported = body.importData;
  if (imported != null && (typeof imported !== "object" || Array.isArray(imported))) fail(400, "ملف البيانات غير صالح");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(814209731)");
    const usersNow = await client.query("SELECT 1 FROM npi_users LIMIT 1");
    if (usersNow.rowCount) fail(409, "النظام مهيأ بالفعل");
    const data = imported || {};
    const members = Object.entries(data.team || {}).filter(([, m]) => m && typeof m === "object");
    let adminMember = members.find(([, m]) => String(m.username || "").toLowerCase() === username);
    const adminId = adminMember && cleanId(adminMember[1].id) ? adminMember[1].id : crypto.randomUUID();
    const preparedAdminPassword = await createPassword(body.password);
    for (const col of COLLECTIONS) {
      if (col === "team" || col === "audit" || !data[col] || typeof data[col] !== "object" || Array.isArray(data[col])) continue;
      const entries = Object.entries(data[col]);
      if (entries.length > 20000) fail(413, "عدد السجلات أكبر من المسموح");
      for (const [id, value] of entries) {
        if (!cleanId(id) || !value || typeof value !== "object" || Array.isArray(value)) continue;
        await client.query(
          "INSERT INTO npi_records(collection,id,data) VALUES($1,$2,$3::jsonb) ON CONFLICT(collection,id) DO NOTHING",
          [col, id, JSON.stringify(cleanSecrets({ ...value, id }))],
        );
      }
    }
    for (const [id0, member] of members) {
      const id = cleanId(member.id || id0) ? (member.id || id0) : crypto.randomUUID();
      const memberUsername = String(member.username || "").trim().toLowerCase();
      if (!usernameOK(memberUsername)) continue;
      const isAdmin = id === adminId || memberUsername === username;
      const authPassword = isAdmin ? preparedAdminPassword : null;
      const active = member.active !== false || isAdmin;
      if (isAdmin) {
        const profile = { ...cleanSecrets(member), id, name, username, role: "gm", active: true, mustChange: false };
        await client.query(
          "INSERT INTO npi_users(id,username,display_name,role,active,must_change,pw_algo,pw_salt,pw_hash) VALUES($1,$2,$3,'gm',true,false,$4,$5,$6) ON CONFLICT(id) DO UPDATE SET username=EXCLUDED.username,display_name=EXCLUDED.display_name,role='gm',active=true,must_change=false,pw_algo=EXCLUDED.pw_algo,pw_salt=EXCLUDED.pw_salt,pw_hash=EXCLUDED.pw_hash",
          [id, username, name, authPassword.algo, authPassword.salt, authPassword.hash],
        );
        await client.query("INSERT INTO npi_records(collection,id,data) VALUES('team',$1,$2::jsonb)", [id, JSON.stringify(profile)]);
      } else {
        const legacy = member.passHash && member.salt ? { algo: "legacy-sha256", salt: String(member.salt), hash: String(member.passHash) } : { algo: "disabled", salt: "", hash: "" };
        const safe = cleanSecrets({ ...member, id, active: active && legacy.algo !== "disabled" });
        await client.query(
          "INSERT INTO npi_users(id,username,display_name,role,active,must_change,pw_algo,pw_salt,pw_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(id) DO NOTHING",
          [id, memberUsername, member.name || "", member.role || "eng", active && legacy.algo !== "disabled", !!member.mustChange, legacy.algo, legacy.salt, legacy.hash],
        );
        await client.query("INSERT INTO npi_records(collection,id,data) VALUES('team',$1,$2::jsonb) ON CONFLICT(collection,id) DO NOTHING", [id, JSON.stringify(safe)]);
      }
    }
    if (!members.some(([, m]) => String(m.username || "").toLowerCase() === username)) {
      const profile = { id: adminId, name, username, role: "gm", active: true, mustChange: false, createdAt: new Date().toISOString() };
      await client.query(
        "INSERT INTO npi_users(id,username,display_name,role,active,must_change,pw_algo,pw_salt,pw_hash) VALUES($1,$2,$3,'gm',true,false,$4,$5,$6)",
        [adminId, username, name, preparedAdminPassword.algo, preparedAdminPassword.salt, preparedAdminPassword.hash],
      );
      await client.query("INSERT INTO npi_records(collection,id,data) VALUES('team',$1,$2::jsonb)", [adminId, JSON.stringify(profile)]);
    }
    if (data.audit && typeof data.audit === "object") {
      for (const [id, record] of Object.entries(data.audit)) {
        if (cleanId(id) && record && typeof record === "object") {
          await client.query("INSERT INTO npi_records(collection,id,data) VALUES('audit',$1,$2::jsonb) ON CONFLICT DO NOTHING", [id, JSON.stringify(cleanSecrets(record))]);
        }
      }
    }
    await client.query("COMMIT");
    await startSession(req, res, adminId);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
async function handleApi(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/session") {
    const user = await readUserBySession(req);
    return send(res, 200, { authenticated: !!user, setupRequired: !(await hasSetup()), user: user ? publicUser(user) : null });
  }
  if (req.method === "POST" && url.pathname === "/api/auth/setup") return bootstrap(req, res, await readBody(req));
  if (req.method === "POST" && url.pathname === "/api/auth/login") {
    checkOrigin(req);
    const body = await readBody(req, 64 * 1024);
    const username = String(body.username || "").trim().toLowerCase();
    const key = `${req.socket.remoteAddress || "unknown"}:${username}`;
    const now = Date.now();
    const state = loginFailures.get(key) || { count: 0, until: 0 };
    if (state.until > now) fail(429, "محاولات كثيرة. حاول بعد دقيقة.");
    const { rows } = await pool.query("SELECT * FROM npi_users WHERE username=$1", [username]);
    const user = rows[0];
    const valid = user && user.active && await verifyPassword(user, String(body.password || ""));
    if (!valid) {
      state.count++;
      if (state.count >= 5) { state.count = 0; state.until = now + 60_000; }
      loginFailures.set(key, state);
      fail(401, "اسم المستخدم أو كلمة المرور غير صحيحة");
    }
    loginFailures.delete(key);
    if (user.pw_algo === "legacy-sha256") {
      const upgraded = await createPassword(String(body.password));
      await pool.query("UPDATE npi_users SET pw_algo=$1,pw_salt=$2,pw_hash=$3 WHERE id=$4", [upgraded.algo, upgraded.salt, upgraded.hash, user.id]);
    }
    await pool.query("UPDATE npi_users SET last_login=now() WHERE id=$1", [user.id]);
    await pool.query("UPDATE npi_records SET data=jsonb_set(data,'{lastLogin}',to_jsonb(now()::text),true) WHERE collection='team' AND id=$1", [user.id]);
    return startSession(req, res, user.id);
  }
  if (req.method === "POST" && url.pathname === "/api/auth/logout") {
    checkOrigin(req);
    const token = cookieMap(req).npi_session;
    if (token) await pool.query("DELETE FROM npi_sessions WHERE token_hash=$1", [crypto.createHash("sha256").update(token).digest("hex")]);
    return send(res, 200, { ok: true }, { "Set-Cookie": sessionCookie(req, "", 0) });
  }
  const user = await readUserBySession(req);
  if (!user) fail(401, "يلزم تسجيل الدخول");
  if (user.must_change && !(req.method === "POST" && url.pathname === "/api/auth/password")) fail(403, "يجب تغيير كلمة المرور قبل استخدام النظام");
  if (req.method === "POST" && url.pathname === "/api/auth/password") {
    checkOrigin(req);
    const body = await readBody(req, 64 * 1024);
    const authResult = await pool.query("SELECT * FROM npi_users WHERE id=$1", [user.id]);
    const authUser = authResult.rows[0];
    if (!authUser.must_change && !await verifyPassword(authUser, String(body.currentPassword || ""))) fail(403, "كلمة المرور الحالية غير صحيحة");
    const pass = await createPassword(String(body.newPassword || body.password || ""));
    await pool.query("UPDATE npi_users SET pw_algo=$1,pw_salt=$2,pw_hash=$3,must_change=false WHERE id=$4", [pass.algo, pass.salt, pass.hash, user.id]);
    await pool.query("UPDATE npi_records SET data=data-'mustChange' || jsonb_build_object('mustChange',false) WHERE collection='team' AND id=$1", [user.id]);
    return send(res, 200, { ok: true });
  }
  if (req.method === "GET" && url.pathname === "/api/data") return send(res, 200, await getVisibleData(user));
  if (url.pathname.startsWith("/api/data/")) {
    checkOrigin(req);
    const parts = url.pathname.split("/").slice(3).map(decodeURIComponent);
    const [col, id] = parts;
    if (!COLLECTIONS.includes(col) || !cleanId(id) || parts.length !== 2) fail(404, "المسار غير موجود");
    const permsInfo = await permissionsFor(user);
    const all = await currentRecordMap();
    if (req.method === "PUT") {
      const raw = await readBody(req);
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) fail(400, "السجل غير صالح");
      const existing = all[col][id];
      const record = { ...raw, id };
      if (!canWriteCollection(col, record, user, permsInfo.perms, permsInfo.base, existing, all)) fail(403, "لا تملك صلاحية تعديل هذا السجل");
      if (col === "team") {
        if (existing && id === user.id && record.role !== user.role) fail(403, "لا يمكنك تغيير دور حسابك");
        const saved = await persistUserRecord(id, record, user, !existing, req);
        await pool.query(
          "INSERT INTO npi_records(collection,id,data) VALUES($1,$2,$3::jsonb) ON CONFLICT(collection,id) DO UPDATE SET data=EXCLUDED.data,updated_at=now()",
          [col, id, JSON.stringify(saved)],
        );
        await appendAudit(user, existing ? "update" : "create", col, id, saved);
        return send(res, 200, { ok: true, record: saved });
      }
      let safe = cleanSecrets(record);
      if (existing && !permsInfo.perms.has("see.money")) {
        if (col === "projects") {
          safe = cleanSecrets(existing);
          for (const key of ["stage", "plan", "log", "handover"]) if (Object.hasOwn(record, key)) safe[key] = cleanSecrets(record[key]);
        }
        safe = preserveMoney(existing, safe);
      }
      safe = cleanSecrets(safe);
      await pool.query(
        "INSERT INTO npi_records(collection,id,data) VALUES($1,$2,$3::jsonb) ON CONFLICT(collection,id) DO UPDATE SET data=EXCLUDED.data,updated_at=now()",
        [col, id, JSON.stringify(safe)],
      );
      await appendAudit(user, existing ? "update" : "create", col, id, safe);
      let response = safe;
      if (!permsInfo.perms.has("see.money")) response = redactMoney(response);
      return send(res, 200, { ok: true, record: response });
    }
    if (req.method === "DELETE") {
      const existing = all[col][id];
      if (!existing) return send(res, 200, { ok: true });
      if (!canDeleteCollection(col, existing, user, permsInfo.perms, permsInfo.base)) fail(403, "لا تملك صلاحية حذف هذا السجل");
      if (col === "team") {
        if (await pool.query("SELECT 1 FROM npi_users WHERE id=$1 AND active=true", [id]).then(r => r.rowCount)) await ensureAnotherAdmin(id);
        await pool.query("DELETE FROM npi_users WHERE id=$1", [id]);
      }
      await pool.query("DELETE FROM npi_records WHERE collection=$1 AND id=$2", [col, id]);
      await appendAudit(user, "delete", col, id, existing);
      return send(res, 200, { ok: true });
    }
  }
  fail(404, "المسار غير موجود");
}
function serveStatic(req, res, url) {
  const files = {
    "/": ["index.html", "text/html; charset=utf-8"],
    "/index.html": ["index.html", "text/html; charset=utf-8"],
    "/seed/seed.json": ["seed/seed.json", "application/json; charset=utf-8"],
  };
  if (url.pathname === "/favicon.ico") {
    res.writeHead(204); return res.end();
  }
  const item = files[url.pathname];
  if (!item) {
    res.writeHead(404, { "X-Content-Type-Options": "nosniff" }); return res.end("Not found");
  }
  const file = path.join(ROOT, item[0]);
  fs.readFile(file, (error, data) => {
    if (error) { res.writeHead(404); return res.end("Not found"); }
    res.writeHead(200, {
      "Content-Type": item[1], "Content-Length": data.length, "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff", "Referrer-Policy": "same-origin",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    });
    res.end(req.method === "HEAD" ? undefined : data);
  });
}
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    if (url.pathname.startsWith("/api/")) await handleApi(req, res, url);
    else if (req.method === "GET" || req.method === "HEAD") serveStatic(req, res, url);
    else send(res, 405, { error: "الطريقة غير مسموحة" });
  } catch (error) {
    if (error.code === "42P01") {
      console.error("[DATABASE_SCHEMA_MISSING] Required database tables are missing. Apply db/schema.sql to development and use the normal publish schema migration for production. Startup/build never create tables.");
      if (!res.headersSent) send(res, 503, { code: "DATABASE_SCHEMA_MISSING", error: "جداول قاعدة البيانات غير مكتملة. يرجى التواصل مع مسؤول النظام لتطبيق مخطط قاعدة البيانات." });
      else res.destroy();
      return;
    }
    if (!res.headersSent) send(res, error.status || 500, { error: error.status ? error.message : "حدث خطأ في الخادم" });
    else res.destroy();
    if (!error.status) console.error(error);
  }
});
server.listen(PORT, "0.0.0.0", () => console.log(`NPI application listening on 0.0.0.0:${PORT}`));
process.on("SIGTERM", () => server.close(() => pool.end().finally(() => process.exit(0))));
process.on("SIGINT", () => server.close(() => pool.end().finally(() => process.exit(0))));
