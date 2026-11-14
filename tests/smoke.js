const assert = require('assert');
const { chromium, TEST_URL } = require('./support/browser');

async function main() {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));

    await page.goto(TEST_URL);
    await page.locator('#setupForm').waitFor();
    assert.equal(await page.locator('#loginForm').count(), 0, 'fresh browser profile should show initial setup');
    assert.equal(await page.evaluate(() => localStorage.getItem('npi-local-v1')), null, 'fresh profile should have no saved app data');

    const username = `smoke${Date.now().toString(36)}`;
    const password = 'SmokeCheck2026';
    await page.fill('#suName', 'Mobile Smoke Admin');
    await page.fill('#suUser', username);
    await page.fill('#suPass', password);
    await page.fill('#suPass2', password);
    await page.locator('#setupForm button[type="submit"]').click();
    await page.locator('.dash-h h1').waitFor();

    const afterSetup = await page.evaluate(() => ({
      state: JSON.parse(localStorage.getItem('npi-local-v1') || 'null'),
      session: localStorage.getItem('npi-sess'),
      overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
    }));
    assert(afterSetup.state && Object.values(afterSetup.state.team || {}).some(user => user.username === username),
      'new account should persist in app state');
    assert(afterSetup.session, 'new account should create a remembered session');
    assert.equal(afterSetup.overflow, false, 'setup/dashboard should fit a mobile viewport');
    console.log('PASS mobile setup creates a fresh account and loads the dashboard');

    await page.reload();
    await page.locator('.dash-h h1').waitFor();
    assert(await page.evaluate(name =>
      Object.values(JSON.parse(localStorage.getItem('npi-local-v1')).team).some(user => user.username === name),
    username), 'account data should persist after reload');
    console.log('PASS account and dashboard persist after reload');

    await page.goto(`${TEST_URL}#profile`);
    await page.locator('.ph [data-act="logout"]').click();
    await page.locator('#loginForm').waitFor();
    assert.equal(await page.evaluate(() => localStorage.getItem('npi-sess')), null, 'logout should remove the session');
    console.log('PASS logout returns to login and clears the session');

    await page.fill('#lgUser', username);
    await page.fill('#lgPass', password);
    await page.locator('#loginForm button[type="submit"]').click();
    await page.locator('.dash-h h1').waitFor();
    assert.equal(await page.evaluate(name =>
      Object.values(JSON.parse(localStorage.getItem('npi-local-v1')).team).some(user => user.username === name),
    username), true, 'created account should log in again with persisted data');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1),
      false, 'signed-in dashboard should fit a mobile viewport');
    assert.deepEqual(pageErrors, [], 'page should not raise JavaScript errors');
    console.log('PASS login restores the account on mobile without layout overflow');
  } finally {
    await browser.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
