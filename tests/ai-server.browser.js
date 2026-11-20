// End-to-end test of the voice/chat assistant in shared-server mode:
// real server.js + PostgreSQL + a scripted Anthropic stand-in. Every write the plan performs goes
// through /api/data, so server-side permissions are exercised for real.
// Needs: TEST_DATABASE_URL (an empty database with db/schema.sql applied). Optional: TEST_SERVER_PORT.
const assert = require("node:assert");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const { chromium } = require("./support/browser");
const { startMockAnthropic } = require("./support/mock-anthropic");

const DB = process.env.TEST_DATABASE_URL;
if (!DB) { console.log("SKIP ai-server.browser.js: set TEST_DATABASE_URL to an empty database with db/schema.sql applied"); process.exit(0); }
const PORT = Number(process.env.TEST_SERVER_PORT || 5010);
const BASE = `http://127.0.0.1:${PORT}`;
const OWNER = crypto.randomBytes(32).toString("hex");
const seed = require("../seed/seed.json");
let n = 0, fails = 0;
const ok = (c, m) => { n++; console.log(c ? "PASS" : "FAIL", m); if (!c) fails++; };
let tid = 0;
const tu = (name, input) => ({ type: "tool_use", id: `toolu_${++tid}`, name, input });
const turn = (...content) => ({ content, stop_reason: content.some(b => b.type === "tool_use") ? "tool_use" : "end_turn" });
const say = text => ({ type: "text", text });

(async () => {
  const mock = await startMockAnthropic();
  const MOCK = `http://127.0.0.1:${mock.port}`;
  const script = turns => fetch(`${MOCK}/__script`, { method: "POST", body: JSON.stringify({ turns }) });
  const mockLog = async () => (await fetch(`${MOCK}/__log`)).json();
  const srv = spawn(process.execPath, [path.join(__dirname, "..", "server.js")], {
    env: { ...process.env, PORT: String(PORT), DATABASE_URL: DB, ANTHROPIC_API_KEY: "sk-test-not-real", ANTHROPIC_BASE_URL: MOCK, BOOTSTRAP_OWNER_TOKEN: OWNER, AI_MAX_REQUESTS_PER_10MIN: "500", REPLIT_DOMAINS: "" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let srvOut = ""; srv.stdout.on("data", d => { srvOut += d; }); srv.stderr.on("data", d => { srvOut += d; });
  for (let i = 0; i < 50 && !srvOut.includes("listening"); i++) await new Promise(r => setTimeout(r, 100));
  const browser = await chromium.launch();
  try {
    // ---- API boundary checks ----
    const st = await (await fetch(`${BASE}/api/ai/status`)).json();
    ok(st.enabled === true, "AI status reports enabled when the key is configured");
    const anon = await fetch(`${BASE}/api/ai/chat`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    ok(anon.status === 401, "chat relay refuses anonymous callers (" + anon.status + ")");
    const page0 = await fetch(`${BASE}/`);
    ok((page0.headers.get("permissions-policy") || "").includes("microphone=(self)"), "page allows the microphone for itself");
    ok(!(await page0.text()).includes("sk-test-not-real"), "API key never reaches the page");

    const ctx = await browser.newContext({ viewport: { width: 1366, height: 860 } });
    await ctx.addInitScript(() => {
      class FakeSR { start() { window.__sr = this; setTimeout(() => this.onresult && this.onresult({ results: [Object.assign([{ transcript: window.__voiceText || localStorage.getItem("voiceText") || "" }], { isFinal: true })] }), 150); } stop() { setTimeout(() => this.onend && this.onend(), 30); } abort() { this.stop(); } }
      window.SpeechRecognition = FakeSR;
    });
    const pg = await ctx.newPage();
    const errs = [];
    pg.on("pageerror", e => errs.push(e.message));
    await pg.route(/fonts\.(googleapis|gstatic)/, r => r.abort());
    // ---- owner setup with the demo snapshot ----
    await pg.goto(BASE + "/");
    await pg.evaluate(s => localStorage.setItem("npi-local-v1", JSON.stringify(s)), seed);
    await pg.reload();
    await pg.locator("#setupForm").waitFor();
    await pg.fill("#suOwnerToken", OWNER); await pg.fill("#suName", "م. عبدالله"); await pg.fill("#suUser", "admin");
    await pg.fill("#suPass", "Npi@2026x"); await pg.fill("#suPass2", "Npi@2026x");
    if (await pg.locator("#suImportLocal").count()) await pg.locator("#suImportLocal").check();
    await pg.locator("#setupForm button[type=submit]").click();
    try { await pg.locator(".dash-h h1").waitFor({ timeout: 15000 }); } catch (e) { console.log("SETUP ERR:", await pg.locator("#lgErr").innerText().catch(() => ""), srvOut.slice(-1500)); throw e; }
    ok(true, "owner setup imported the demo data on the shared server");
    const logout = async () => { await pg.evaluate(() => fetch("/api/auth/logout", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })); await pg.goto(BASE + "/"); await pg.reload(); await pg.locator("#loginForm").waitFor(); };
    const login = async (u, p = "Npi@2026") => { await logout(); await pg.fill("#lgUser", u); await pg.fill("#lgPass", p); await pg.locator("#loginForm button[type=submit]").click(); try { await pg.locator(".dash-h h1").waitFor({ timeout: 15000 }); } catch (e) { console.log("LOGIN ERR", u, await pg.locator("#lgErr").innerText().catch(() => ""), await pg.locator("body").innerText().then(t => t.slice(0, 300))); throw e; } await pg.waitForTimeout(300); };
    const data = () => pg.evaluate(() => fetch("/api/data").then(r => r.json()));
    const openAi = async () => { if (!(await pg.locator(".ai-panel").count())) await pg.click(".ai-fab"); await pg.waitForTimeout(150); };
    const ask = async text => { await openAi(); await pg.fill("#aiIn", text); await pg.click(".ai-in button[type=submit]"); await pg.locator(".ai-m.assistant .ai-b:not(.ai-stream), .ai-m.note .ai-b").last().waitFor(); for (let i = 0; i < 60 && await pg.locator(".ai-stream").count(); i++) await pg.waitForTimeout(150); };
    const approve = async () => { const plan = pg.locator(".ai-plan").last(); await plan.locator('[data-act="aiRunPlan"]').click(); for (let i = 0; i < 80 && await plan.locator("li.running, li.planned").count(); i++) await pg.waitForTimeout(150); return { done: await plan.locator("li.done").count(), errors: await plan.locator("li.error .ai-res").allInnerTexts() }; };

    // ---- 1) PGM by voice: client accepted & paid → contract review + tasks for GM and finance ----
    await login("pgm");
    let d = await data();
    const p3 = Object.values(d.projects).find(p => p.code === "NPI-2026-003");
    ok(p3 && p3.stage === "quote", "demo project 003 starts at the quote stage");
    await script([
      turn(say("أتحقق من المشروع."), tu("project_details", { project: "NPI-2026-003" })),
      turn(tu("workflow_action", { action: "client_accepted_quote", project: "NPI-2026-003", ref: "تحويل الدفعة المقدمة TRF-5521" }),
           tu("create_task", { title: "اعتماد عقد مشروع 003", assignee: "admin", type: "followup", priority: "high", due: "2026-11-18" }),
           tu("create_task", { title: "تسجيل الدفعة المقدمة وفتح مركز التكلفة", assignee: "finance", type: "collection", project: "NPI-2026-003" })),
      turn(say("جهّزت خطة من 3 خطوات: تسجيل موافقة العميل ورفع العقد للاعتماد، ومهمتين للمدير العام والمالية.")),
    ]);
    await openAi();
    await pg.evaluate(() => localStorage.setItem("voiceText", "عميل مثال للمشاريع الزراعية دفع المبلغ ونبدأ المشروع ونصدر العقد"));
    await pg.click('[data-act="aiMic"]');
    await pg.locator(".ai-rec").waitFor();
    ok(await pg.locator(".ai-rec").isVisible(), "voice recording bar shows while recording");
    await pg.waitForTimeout(400);
    ok((await pg.locator(".ai-rec-t").innerText()).includes("دفع المبلغ"), "live transcript appears while speaking");
    await pg.click('[data-act="aiMicStop"]');
    for (let i = 0; i < 80 && !(await pg.locator(".ai-plan").count()); i++) await pg.waitForTimeout(150);
    ok((await pg.locator(".ai-m.mine .ai-vtag").count()) === 1, "voice message is tagged as a recording");
    const bullets = await pg.locator(".ai-plan li").count();
    if (bullets !== 3) { const lg = await mockLog(); console.log("TOOL RESULTS:", JSON.stringify(lg.at(-1).payload.messages.at(-1).content).slice(0, 1500)); }
    ok(bullets === 3, "summary shows 3 bullet steps (" + bullets + ")");
    d = await data();
    ok(d.projects[p3.id].stage === "quote" && !Object.values(d.ftasks).some(t => t.title === "اعتماد عقد مشروع 003"), "nothing saved before approval");
    let log = await mockLog();
    const firstReq = log[log.length - 3].payload;
    ok(firstReq.system.includes("[من الخادم] الحساب المسجل فعلياً") && firstReq.messages[0].content.includes("[تسجيل صوتي مُفرّغ]"), "server stamps the real account; transcript sent as voice");
    ok(log.every(l => l.headers.key === "sk-test-not-real" && l.headers.version === "2023-06-01"), "relay sends key and version headers upstream");
    const tr = log[log.length - 2].payload.messages.at(-1).content.find(b => b.type === "tool_result");
    ok(tr && JSON.parse(tr.content).available_actions.includes("client_accepted_quote"), "project_details told the model what the user may do next");
    await pg.screenshot({ path: path.join(__dirname, "out", "ai-server-plan.png") }).catch(() => {});
    let r = await approve();
    ok(r.done === 3 && !r.errors.length, "PGM approved: 3 steps executed " + JSON.stringify(r.errors));
    d = await data();
    ok(d.projects[p3.id].stage === "contract_review", "project moved to contract review on the server");
    ok(Object.values(d.ftasks).some(t => t.title === "اعتماد عقد مشروع 003"), "follow-up task for GM stored");

    // ---- 2) GM approves the contract by chat ----
    await login("admin", "Npi@2026x");
    await script([turn(tu("workflow_action", { action: "approve_contract", project: "NPI-2026-003" })), turn(say("جاهز للاعتماد."))]);
    await ask("اعتمد عقد مشروع 003");
    r = await approve();
    d = await data();
    ok(r.done === 1 && d.projects[p3.id].stage === "setup", "GM plan approved the contract → setup");

    // ---- 3) Finance: advance received + cost centre; also a chained step that must fail cleanly ----
    await login("finance");
    await script([turn(tu("workflow_action", { action: "finance_setup", project: "NPI-2026-003", ref: "TRF-5521", advance_received: true }), tu("workflow_action", { action: "issue_claim", project: "NPI-2026-001", invoice_no: "INV-X" })), turn(say("خطة من خطوتين."))]);
    await ask("استلمنا الدفعة المقدمة لمشروع 003، وأصدر فاتورة لمشروع 001");
    r = await approve();
    d = await data();
    ok(d.projects[p3.id].setup?.clientRegistered && d.projects[p3.id].setup?.advanceReceived, "finance setup + advance recorded on the server");
    ok(r.done === 1 && r.errors.length === 1 && /مستحقة|متاح/.test(r.errors[0]), "impossible step reported, not executed: " + r.errors[0]);

    // ---- 4) Engineer cannot plan an approval; the model gets a permission error ----
    await login("eng1");
    await script([turn(tu("workflow_action", { action: "approve_contract", project: "NPI-2026-004" })), turn(say("هذا الإجراء ليس من صلاحياتك؛ يمكنني إنشاء مهمة للمدير العام."))]);
    await ask("اعتمد العقد");
    log = await mockLog();
    const engRes = log[log.length - 1].payload.messages.at(-1).content.find(b => b.type === "tool_result");
    ok(engRes?.is_error && engRes.content.includes("ليس من صلاحيات"), "engineer's forbidden step returned as a tool error");
    ok((await pg.locator(".ai-plan").count()) === 0, "no plan offered to the engineer");
    // forged write straight to the API is still refused by the server
    const forged = await pg.evaluate(id => fetch(`/api/data/projects/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stage: "closed" }) }).then(x => x.status), p3.id);
    ok(forged === 403, "server rejects a forged project write from the engineer (" + forged + ")");

    // ---- 5) Upstream busy → friendly message ----
    await script([{ status: 529 }]);
    await ask("أي شيء");
    ok((await pg.locator(".ai-m.note").last().innerText()).includes("مشغولة"), "busy upstream shown as a friendly message");
    ok(errs.length === 0, "no page errors " + JSON.stringify(errs));
    await ctx.close();
  } finally {
    await browser.close();
    srv.kill("SIGTERM");
    mock.server.close();
  }
  console.log("TOTAL", n, "FAILS", fails);
  if (fails) process.exitCode = 1;
})().catch(e => { console.error(e); process.exit(1); });
