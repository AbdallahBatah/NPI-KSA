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
    await page.locator('#loginForm').waitFor();
    assert.equal(await page.locator('#setupForm').count(), 0, 'fresh browser profile must not expose account setup');
    assert.match(await page.locator('.alert[role="status"]').innerText(), /إنشاء الحسابات متاح لمسؤول النظام فقط/,
      'fresh profile should direct the user to the administrator');
    assert.equal(await page.evaluate(() => localStorage.getItem('npi-local-v1')), null, 'fresh profile should have no saved app data');

    const seed = require('../seed/seed.json');
    await page.evaluate(data => localStorage.setItem('npi-local-v1', JSON.stringify(data)), seed);
    await page.reload();
    await page.locator('#loginForm').waitFor();
    assert.equal(await page.locator('.alert[role="status"]').count(), 0,
      'account notice should disappear when accounts exist');
    console.log('PASS fresh mobile profile has login only and no public account setup');

    await page.fill('#lgUser', 'gm');
    await page.fill('#lgPass', 'Npi@2026');
    await page.locator('#loginForm button[type="submit"]').click();
    await page.locator('.dash-h h1').waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1),
      false, 'dashboard should fit a mobile viewport');
    console.log('PASS administrator login loads the dashboard on mobile');

    await page.goto(`${TEST_URL}#profile`);
    await page.locator('.ph [data-act="logout"]').click();
    await page.locator('#loginForm').waitFor();
    assert.equal(await page.evaluate(() => localStorage.getItem('npi-sess')), null, 'logout should remove the session');
    console.log('PASS logout returns to login and clears the session');

    await page.fill('#lgUser', 'gm');
    await page.fill('#lgPass', 'Npi@2026');
    await page.locator('#loginForm button[type="submit"]').click();
    await page.locator('.dash-h h1').waitFor();
    assert.equal(await page.evaluate(() => Object.values(JSON.parse(localStorage.getItem('npi-local-v1')).team)
      .some(user => user.username === 'gm')), true, 'the admin account should remain available');
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
