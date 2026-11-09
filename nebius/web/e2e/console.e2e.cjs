// Console end-to-end check (Playwright). Needs a running server and a verified superadmin admin@example.com / GoodPassw0rd!
// Usage: NEBIUS_URL=http://localhost:8090 SHOTS=/tmp/shots node web/e2e/console.e2e.cjs
const { chromium, devices } = require('playwright');
const BASE = process.env.NEBIUS_URL || "http://localhost:8090";
(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 860 } });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[console] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
  await page.goto(BASE + '/#/login');
  await page.fill('input[name=email]', 'admin@example.com');
  await page.fill('input[name=password]', 'GoodPassw0rd!');
  await page.click('button[type=submit]');
  await page.waitForSelector('text=Dashboard');
  await page.waitForTimeout(800);
  await page.screenshot({ path: '' + (process.env.SHOTS || "screenshots") + '/01-dashboard.png' });
  // create a project through the UI
  await page.goto(BASE + '/#/projects');
  await page.click('text=+ Create project');
  await page.fill('.modal input[name=name]', 'Nick 4.8 Training');
  await page.fill('.modal textarea[name=description]', 'Approx AI Nick 4.8 QLoRA fine-tuning');
  await page.click('.modal button.primary');
  await page.waitForSelector('h1:has-text("Nick 4.8 Training")');
  // files: folder + upload
  await page.goto(BASE + '/#/files');
  await page.click('text=+ Folder'); await page.fill('.modal input[name=name]', 'datasets'); await page.click('.modal button.primary');
  await page.waitForSelector('text=datasets');
  await page.setInputFiles('input[type=file]', { name: 'sample.jsonl', mimeType: 'application/json', buffer: Buffer.from('{"messages":[{"role":"user","content":"hi"}]}\n') });
  await page.waitForSelector('text=sample.jsonl');
  await page.waitForTimeout(500);
  await page.screenshot({ path: '' + (process.env.SHOTS || "screenshots") + '/02-files.png' });
  await page.click('td >> text=sample.jsonl'); await page.waitForSelector('.modal >> text=SHA-256');
  await page.click('.modal >> text=Verify integrity'); await page.waitForSelector('.modal >> text=verified');
  await page.keyboard.press('Escape');
  // compute: create instance
  await page.goto(BASE + '/#/compute?tab=providers');
  await page.waitForSelector('text=Free-only policy');
  await page.click('.card:has-text("Local Docker CPU sandbox") >> text=Run health check');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: '' + (process.env.SHOTS || "screenshots") + '/03-providers.png', fullPage: false });
  await page.goto(BASE + '/#/compute?tab=gpu'); await page.waitForSelector('text=NO FREE GPU AVAILABLE');
  await page.screenshot({ path: '' + (process.env.SHOTS || "screenshots") + '/04-gpu.png' });
  await page.goto(BASE + '/#/compute');
  await page.click('text=+ Create instance'); await page.fill('.modal input[name=name]', 'worker-1'); await page.click('.modal button.primary');
  await page.waitForSelector('td >> text=worker-1', { timeout: 60000 }); await page.waitForTimeout(500);
  await page.click('td >> text=worker-1'); await page.waitForSelector('h1:has-text("worker-1")');
  await page.screenshot({ path: '' + (process.env.SHOTS || "screenshots") + '/05-instance.png' });
  // training: import + preflight
  await page.goto(BASE + '/#/training');
  await page.click('text=Import Approx-Ai pipeline');
  await page.waitForSelector('text=Imported pipeline (read-only)', { timeout: 120000 });
  await page.click('text=Run preflight');
  await page.waitForSelector('text=Preflight —', { timeout: 60000 });
  await page.screenshot({ path: '' + (process.env.SHOTS || "screenshots") + '/06-training.png', fullPage: true });
  // notebook
  await page.goto(BASE + '/#/notebooks');
  await page.click('text=+ New notebook'); await page.fill('.modal input[name=name]', 'explore'); await page.click('.modal button.primary');
  await page.waitForSelector('text=explore.ipynb');
  await page.click('.cell >> text=▶ Run');
  await page.waitForSelector('.outputs pre.out', { timeout: 90000 });
  await page.screenshot({ path: '' + (process.env.SHOTS || "screenshots") + '/07-notebook.png' });
  // terminal
  await page.goto(BASE + '/#/terminal');
  await page.click('text=Open terminal session');
  await page.waitForSelector('.term-input:not([disabled])', { timeout: 60000 });
  await page.fill('.term-input', 'id; uname -a'); await page.press('.term-input', 'Enter');
  await page.waitForSelector('pre.terminal >> text=uid=1000', { timeout: 30000 });
  await page.screenshot({ path: '' + (process.env.SHOTS || "screenshots") + '/08-terminal.png' });
  for (const r of ['jobs', 'monitoring', 'logs', 'api', 'iam', 'notifications', 'settings', 'admin', 'help', 'search?q=nick']) {
    await page.goto(BASE + '/#/' + r); await page.waitForTimeout(900);
    const err = await page.$('.error-state'); if (err) errors.push(`[view ${r}] ${await err.innerText()}`);
  }
  await page.goto(BASE + '/#/monitoring'); await page.waitForTimeout(1200);
  await page.screenshot({ path: '' + (process.env.SHOTS || "screenshots") + '/09-monitoring.png' });
  // phone layout
  const m = await browser.newContext({ ...devices['Pixel 7'] });
  const mp = await m.newPage();
  mp.on('pageerror', (e) => errors.push(`[mobile pageerror] ${e.message}`));
  await mp.goto(BASE + '/#/login');
  await mp.fill('input[name=email]', 'admin@example.com'); await mp.fill('input[name=password]', 'GoodPassw0rd!'); await mp.click('button[type=submit]');
  await mp.waitForSelector('.bottom-nav'); await mp.waitForTimeout(800);
  const overflow = await mp.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (overflow > 0) errors.push(`[mobile] horizontal overflow ${overflow}px`);
  await mp.screenshot({ path: '' + (process.env.SHOTS || "screenshots") + '/10-mobile-dashboard.png' });
  await mp.click('.menu-btn'); await mp.waitForTimeout(300);
  await mp.screenshot({ path: '' + (process.env.SHOTS || "screenshots") + '/11-mobile-drawer.png' });
  await mp.click('.scrim', { position: { x: 350, y: 400 } });
  await mp.click('.bottom-nav >> text=Projects'); await mp.waitForTimeout(800);
  await mp.screenshot({ path: '' + (process.env.SHOTS || "screenshots") + '/12-mobile-projects.png' });
  console.log(JSON.stringify({ errors }, null, 1));
  await browser.close();
})().catch((e) => { console.error('E2E FAILED', e); process.exit(1); });
