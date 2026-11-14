// Exercises the real setup UI with intercepted API responses, never company data.
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { chromium, TEST_URL } = require("./support/browser");
// Unlike the older offline-mode suite, this test must exercise server mode.
const setupURL = new URL(TEST_URL);
setupURL.searchParams.delete("e2e");

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const width of [1360, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      const errors = [];
      page.on("pageerror", e => errors.push(e.message));
      const ownerToken = crypto.randomBytes(32).toString("hex");
      const snapshot = { projects: { retained: { id: "retained", name: "Local project" } } };
      await page.addInitScript(data => {
        localStorage.setItem("npi-local-v1", JSON.stringify(data));
      }, snapshot);
      let initialized = false;
      let calls = 0;
      const requests = [];
      await page.route("**/api/**", async route => {
        const request = route.request();
        const pathname = new URL(request.url()).pathname;
        if (pathname === "/api/session") {
          return route.fulfill({ json: { authenticated: false, setupRequired: !initialized, user: null } });
        }
        if (pathname === "/api/auth/setup") {
          calls++;
          const body = request.postDataJSON();
          requests.push({
            validToken: request.headers()["x-npi-setup-token"] === ownerToken,
            tokenInBody: request.postData().includes(ownerToken),
            imported: body.importData,
          });
          initialized = calls === 2;
          return route.fulfill(initialized ? { json: { ok: true } } : { status: 403, json: { error: "رمز تهيئة المالك غير صحيح" } });
        }
        return route.fulfill({ status: 500, json: { error: "Unexpected test request" } });
      });
      await page.goto(setupURL.href);
      await page.locator("#setupForm").waitFor();
      assert.equal(await page.locator("#suOwnerToken").getAttribute("type"), "password");
      await page.fill("#suName", "Owner");
      await page.fill("#suUser", "owner");
      await page.fill("#suPass", "BrowserTest8!");
      await page.fill("#suPass2", "BrowserTest8!");
      await page.locator("#setupForm button[type=submit]").click();
      assert.equal(calls, 0, "empty owner code must not submit");
      assert.equal(await page.locator("#suImportLocal").isChecked(), true);
      await page.fill("#suOwnerToken", ownerToken);
      await page.locator("#setupForm button[type=submit]").click();
      await page.waitForFunction(() => document.querySelector("#lgErr")?.textContent.includes("غير صحيح"));
      assert.equal(await page.inputValue("#suOwnerToken"), "");
      assert.equal(requests[0].validToken, true);
      assert.equal(requests[0].tokenInBody, false);
      assert.deepEqual(requests[0].imported, snapshot);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
      await page.locator("#suImportLocal").uncheck();
      await page.fill("#suOwnerToken", ownerToken);
      await page.locator("#setupForm button[type=submit]").click();
      await page.locator("#loginForm").waitFor();
      assert.equal(requests[1].validToken, true);
      assert.equal(requests[1].imported, null);
      const stored = await page.evaluate(() => ({ local: { ...localStorage }, session: { ...sessionStorage } }));
      assert.deepEqual(JSON.parse(stored.local["npi-local-v1"]), snapshot);
      assert.equal(JSON.stringify(stored).includes(ownerToken), false);
      assert.deepEqual(errors, []);
      await page.close();
      console.log(`PASS owner setup UI at ${width}px: masked code, header-only transfer, optional import, no storage leaks`);
    }
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
