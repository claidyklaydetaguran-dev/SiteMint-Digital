// UI integration checks against an explicitly isolated preview. Never production.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const root = 'http://127.0.0.1:8784/ai-receptionist/dashboard';
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const results = [];
  try {
    for (const width of [1440, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 960 } });
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      let unavailable = true, rejectSave = false, writes = 0;
      let profile = { name: 'Settings test business', industry: 'Construction', timezone: 'UTC', primaryContact: { name: 'Test owner', email: 'owner@example.test' }, defaultLocation: 'Test office' };
      await page.route('**/api/receptionist/account/profile', async route => {
        if (unavailable || (rejectSave && route.request().method() === 'PATCH')) return route.fulfill({ status: 503, json: { error: 'Test-only unavailable response' } });
        if (route.request().method() === 'PATCH') { writes++; profile = { ...profile, ...route.request().postDataJSON() }; }
        return route.fulfill({ json: { profile } });
      });
      await page.goto(root + '/account/settings');
      await page.getByRole('button', { name: 'Retry loading profile' }).waitFor();
      assert.equal(await page.locator('#settings-name').isEnabled(), false, 'Read failure must not permit blank overwrite');
      assert.equal(writes, 0);
      unavailable = false;
      await page.getByRole('button', { name: 'Retry loading profile' }).click();
      await page.waitForFunction(() => !document.querySelector('#settings-name').disabled);
      assert.equal(await page.locator('#settings-name').inputValue(), profile.name);
      await page.locator('#settings-name').fill('Updated settings business');
      const form = page.locator('form').filter({ has: page.locator('#settings-name') });
      await form.getByRole('button', { name: /save/i }).click();
      await page.getByText('Your business profile was updated.').waitFor();
      assert.equal(writes, 1);
      await page.reload();
      await page.waitForFunction(() => document.querySelector('#settings-name')?.value === 'Updated settings business');
      rejectSave = true;
      await page.locator('#settings-name').fill('Unsaved draft');
      await form.getByRole('button', { name: /save/i }).click();
      await form.getByRole('alert').waitFor();
      assert.equal(writes, 1, 'Rejected save must not persist');
      assert.equal(await page.locator('#settings-name').inputValue(), 'Unsaved draft');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      assert.deepEqual(errors, []);
      await page.screenshot({ path: `docs/design/qa-workspace/settings-actions-${width}.png`, fullPage: true });
      results.push({ width, readFailureProtected: true, retry: true, saveAndReload: true, rejectedSavePreservesDraft: true, errors });
      await page.close();
    }
    fs.writeFileSync('docs/design/qa-workspace/settings-actions.json', JSON.stringify(results, null, 2));
    console.log(JSON.stringify(results, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
