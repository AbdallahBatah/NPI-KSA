const fs = require('fs');
const { execFileSync } = require('child_process');
const { chromium: playwrightChromium } = require('playwright');

function findChromium() {
  const configured = process.env.CHROMIUM_PATH || process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  if (configured) {
    if (!fs.existsSync(configured)) {
      throw new Error(`Configured Chromium executable does not exist: ${configured}`);
    }
    return configured;
  }

  try {
    return execFileSync('which', ['chromium'], { encoding: 'utf8' }).trim();
  } catch {
    return playwrightChromium.executablePath();
  }
}

const executablePath = findChromium();
const chromium = {
  launch: (options = {}) => playwrightChromium.launch({
    ...options,
    executablePath,
    args: [...(options.args || []), '--no-sandbox', '--disable-dev-shm-usage'],
  }),
};

const baseUrl = (process.env.TEST_BASE_URL ||
  (process.env.REPLIT_DEV_DOMAIN
    ? `https://${process.env.REPLIT_DEV_DOMAIN}`
    : 'http://127.0.0.1:5000')).replace(/\/+$/, '');

module.exports = { chromium, TEST_URL: `${baseUrl}/?e2e=1` };
