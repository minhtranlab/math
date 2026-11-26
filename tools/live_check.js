// Live check of the deployed web app: STU=<test student code> TEA=<teacher code> node tools/live_check.js
// Codes come from env only (never in files or logs). Use a TEST- student row. Needs playwright (npm i -g playwright).
const { chromium } = require('playwright');
const URL = 'https://script.google.com/macros/s/AKfycbzoYJ8e0oE7iE9vM4P9cuHGk4j8jbepHcVXdUIHltdt2IadYDDW6ZjNH60Vy2PZPE5e/exec';
const OUT = (process.env.SHOTS || 'tests/.work/live') + '/'; require('fs').mkdirSync(OUT, { recursive: true });
let P = 0, F = 0; const check = (c, m) => { c ? P++ : F++; console.log((c ? '  ✓ ' : '  ✗ FAIL ') + m); };
async function appFrame(page) {
  for (let i = 0; i < 60; i++) { for (const f of page.frames()) { try { if (await f.$('#login-code')) return f; } catch (e) {} } await page.waitForTimeout(500); }
  throw new Error('app frame not found');
}
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1366, height: 900 } }); const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  let t0 = Date.now(); await page.goto(URL, { waitUntil: 'load', timeout: 60000 });
  let f = await appFrame(page); await page.waitForTimeout(1500);
  check(true, 'web app opens (' + (Date.now() - t0) + ' ms)');
  await page.screenshot({ path: OUT + 'L01_sign_in.png' });
  // light only
  check(await f.evaluate(() => getComputedStyle(document.body).backgroundColor) === 'rgb(255, 255, 255)', 'white background');
  await f.fill('#login-code', process.env.STU); t0 = Date.now(); await f.click('#login-btn');
  await f.waitForSelector('#scr-home.on [data-start]', { timeout: 60000 });
  check(true, 'student sign-in → home (' + (Date.now() - t0) + ' ms)');
  check(/3 sample questions/.test(await f.textContent('#home-list')), 'home shows 3 sample questions');
  await page.screenshot({ path: OUT + 'L02_home.png' });
  await f.click('[data-start="path"]'); await f.waitForSelector('.ch', { timeout: 60000 }); await page.waitForTimeout(2500);
  await page.screenshot({ path: OUT + 'L03_q1.png' });
  await f.click('.ch[data-l="B"]'); t0 = Date.now(); await f.click('#q-check'); await f.waitForSelector('.fb.no');
  check(Date.now() - t0 < 500, 'wrong → instant ✗ (' + (Date.now() - t0) + ' ms, before the server answers)');
  await f.waitForFunction(() => /Saved/.test(document.querySelector('#q-sync').textContent), null, { timeout: 60000 });
  check(true, 'server saved try 1 (' + (Date.now() - t0) + ' ms)');
  await f.click('.ch[data-l="A"]'); await f.click('#q-check'); await f.waitForSelector('.fb.ok');
  await f.waitForSelector('#q-next'); await f.waitForFunction(() => /Saved/.test(document.querySelector('#q-sync').textContent), null, { timeout: 60000 });
  await page.screenshot({ path: OUT + 'L04_q1_correct.png' });
  await f.click('#q-next'); await f.waitForSelector('#q-num', { timeout: 60000 }); await page.waitForTimeout(2500);
  await page.screenshot({ path: OUT + 'L05_q2_figure.png' });
  await f.fill('#q-num', '6.883'); await f.click('#q-check'); await f.waitForSelector('.fb.ok');
  check(true, '6.883 accepted for 3 s.f. (key 6.88)');
  await f.waitForFunction(() => /Saved/.test(document.querySelector('#q-sync').textContent), null, { timeout: 60000 });
  await f.click('#q-next'); await f.waitForSelector('#q-num', { timeout: 60000 }); await page.waitForTimeout(2000);
  await f.click('#q-hint'); await f.waitForSelector('.hint', { timeout: 60000 }); await page.waitForTimeout(1500);
  await f.fill('#q-num', '60.3'); await f.click('#q-check'); await f.waitForSelector('.fb.no');
  await f.waitForFunction(() => /Saved/.test(document.querySelector('#q-sync').textContent), null, { timeout: 60000 });
  await f.fill('#q-num', '30'); await f.click('#q-check'); await f.waitForSelector('.fb.ans');
  await f.waitForFunction(() => /Saved/.test(document.querySelector('#q-sync').textContent), null, { timeout: 60000 }); await page.waitForTimeout(1500);
  check(/29\.7°/.test(await f.textContent('#q-fb')), 'wrong twice → "Answer: 29.7°" + review list');
  await page.screenshot({ path: OUT + 'L06_q3_hint_wrong_twice.png' });
  await f.click('.btn[data-go="home"]'); await f.waitForSelector('[data-start="review"]', { timeout: 60000 });
  check(/1 to review/.test(await f.textContent('#home-list')), 'home: 1 to review');
  await page.screenshot({ path: OUT + 'L07_home_review.png' });
  await f.click('[data-act="logout"]');
  await f.fill('#login-code', process.env.TEA); t0 = Date.now(); await f.click('#login-btn');
  await f.waitForSelector('#t-refresh', { timeout: 60000 });
  check(true, 'teacher sign-in → overview (' + (Date.now() - t0) + ' ms)');
  const tt = await f.textContent('#t-main');
  check(/Claude check/.test(tt) && /Wrong twice/.test(tt) && /Find an angle/.test(tt), 'overview lists the test answers, wrong twice, hint use');
  const st = await f.textContent('.stamp'); await page.waitForTimeout(1200); t0 = Date.now(); await f.click('#t-refresh');
  await f.waitForFunction(s => document.querySelector('.stamp') && document.querySelector('.stamp').textContent !== s, st, { timeout: 60000 });
  check(true, 'Refresh works (' + (Date.now() - t0) + ' ms)');
  await page.screenshot({ path: OUT + 'L08_teacher.png', fullPage: true });
  check(errs.length === 0, 'no page errors (' + errs.length + ')' + (errs.length ? ': ' + errs.slice(0, 2).join(' | ') : ''));
  await b.close(); console.log(`live: ${P} passed, ${F} failed`); process.exit(F ? 1 : 0);
})().catch(e => { console.log('EXCEPTION', e.message); process.exit(1); });
