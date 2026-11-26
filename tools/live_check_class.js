const { chromium } = require('playwright');
// Live check of Class mode on the deployed app: TEA=<teacher code> S1=<TEST student> S2=<TEST student 2> node tools/live_check_class.js
// Codes only from env (never in files or logs). Ends any open session first. Needs playwright.
const URL = 'https://script.google.com/macros/s/AKfycbzoYJ8e0oE7iE9vM4P9cuHGk4j8jbepHcVXdUIHltdt2IadYDDW6ZjNH60Vy2PZPE5e/exec', OUT = (process.env.SHOTS || 'tests/.work/live') + '/'; require('fs').mkdirSync(OUT, { recursive: true });
let P = 0, F = 0; const check = (c, m) => { c ? P++ : F++; console.log((c ? '  ✓ ' : '  ✗ FAIL ') + m); };
async function app(page) { for (let i = 0; i < 80; i++) { for (const f of page.frames()) { try { if (await f.$('#login-code')) return f; } catch (e) {} } await page.waitForTimeout(500); } throw new Error('no app'); }
(async () => {
  const b = await chromium.launch(), errs = [];
  const mk = async (code) => { const p = await (await b.newContext({ viewport: { width: 1366, height: 900 } })).newPage(); p.on('pageerror', e => errs.push(e.message)); await p.goto(URL, { timeout: 60000 }); const f = await app(p); await f.fill('#login-code', code); await f.click('#login-btn'); return [p, f]; };
  const W = { timeout: 30000 };
  const [tp, t] = await mk(process.env.TEA); await t.waitForSelector('#t-refresh', W);
  await t.click('[data-tab="class"]'); await t.waitForSelector('#cl-start, #cl-end', W);
  if (await t.$('#cl-end')) { await t.click('#cl-end'); await t.waitForSelector('#cl-back', W); await t.click('#cl-back'); await t.waitForSelector('#cl-start', W); }
  await t.click('[data-pick="' + process.env.S1 + '"]'); await t.click('[data-pick="' + process.env.S2 + '"]'); await t.fill('#cl-title', 'Live check #9');
  let t0 = Date.now(); await t.click('#cl-start'); await t.waitForSelector('#cl-live table', W);
  check(true, 'session started (' + (Date.now() - t0) + ' ms)');
  const [ap, a] = await mk(process.env.S1), [bp, bb] = await mk(process.env.S2);
  await a.waitForSelector('[data-join]', W); await bb.waitForSelector('[data-join]', W);
  check(true, 'both students see "Join class"');
  await a.click('[data-join]'); await bb.click('[data-join]');
  await t.selectOption('#cl-sub', 'TRIG.RT.LABEL'); await t.selectOption('#cl-diff', 'E'); await t.click('#cl-add'); await t.waitForSelector('#cl-queue .qrow', W);
  await t.selectOption('#cl-sub', 'TRIG.RT.SIDE_NUM'); await t.click('#cl-add'); await t.waitForFunction(() => document.querySelectorAll('#cl-queue .qrow:not(.pushed)').length === 2, null, W);
  t0 = Date.now(); await t.click('[data-push="*"]');
  await bb.waitForSelector('.ch', W);
  check(true, 'push to all → both students have the question (' + (Date.now() - t0) + ' ms incl. their poll)');
  await a.click('.ch[data-l="B"]');
  t0 = Date.now(); await t.waitForFunction(() => /\bB\b/.test((document.querySelector('#cl-live .typed') || {}).textContent || ''), null, W);
  check(true, 'teacher sees the choice "B" live (' + (Date.now() - t0) + ' ms)');
  await a.click('#q-check'); await a.waitForSelector('.fb.no', W);
  await t.click('[data-ctl="pause"][data-to="' + process.env.S2 + '"]'); await bb.waitForSelector('#q-pause:not(.hidden)', W);
  check(true, 'pause → student 2 covered');
  await bp.screenshot({ path: OUT + 'L9_02_student_paused.png' });
  await t.fill('#cl-text', 'Opposite = the side across from the angle'); await t.selectOption('#cl-to', process.env.S1); await t.click('#cl-send');
  await a.waitForSelector('.msg', W); check(true, 'message reaches student 1');
  await ap.screenshot({ path: OUT + 'L9_03_student_message.png' });
  await tp.waitForTimeout(3500); await tp.screenshot({ path: OUT + 'L9_01_teacher_live.png' });
  await t.click('[data-ctl="continue"][data-to="' + process.env.S2 + '"]'); await bb.waitForSelector('#q-pause.hidden', { state: 'attached', timeout: 30000 });
  await bb.click('.ch[data-l="A"]'); await bb.click('#q-check'); await bb.waitForSelector('.fb.ok', W);
  await t.click('[data-ctl="reveal"][data-to="' + process.env.S1 + '"]'); await a.waitForSelector('.fb.ans', W);
  check(true, 'Show answer now → student 1 sees the answer');
  await t.click('[data-push="' + process.env.S1 + '"]'); await a.waitForSelector('#q-num', W);
  check(true, 'push to one → student 1 has the next question');
  await t.click('#cl-live [data-open]'); await t.waitForSelector('#scr-tq.on .stem', W); await t.click('#tq-ans'); await tp.waitForTimeout(1500);
  await tp.screenshot({ path: OUT + 'L9_04_open_on_my_screen.png' });
  await t.click('#tq-close'); await t.waitForSelector('#cl-end', W); await t.click('#cl-end'); await t.waitForSelector('.tbar:has-text("Class session")', W);
  check(/Live check #9/.test(await t.textContent('#t-main')), 'End class → session result');
  await tp.screenshot({ path: OUT + 'L9_05_teacher_result.png' });
  await a.waitForSelector('#q-card .eyebrow:has-text("Class session")', W); await ap.screenshot({ path: OUT + 'L9_06_student_result.png' });
  check(true, 'student result view');
  check(errs.length === 0, 'no page errors ' + errs.join(' | '));
  await b.close(); console.log(`live #9: ${P} passed, ${F} failed`);
})().catch(e => { console.log('EXC', e.message); process.exit(1); });
