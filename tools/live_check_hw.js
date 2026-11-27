const { chromium } = require('playwright');
// Live check of #8 assignments on the deployed app: TEA=<teacher code> S1=<TEST student> node tools/live_check_hw.js
// Codes only from env (never in files or logs). Teacher builds + publishes an assignment for S1 (real TRIG1 items), the
// student does it (ask on Q2, Check Your Work, Submit), fixes one typed item (wrong, then right), opens My history;
// the teacher sees it in the list, Go over (Show answer, tag → Ask resolved) and closes the assignment at the end.
// Screenshots hold question text: PROJECT/app/shots only (private), never the repo.
const URL = 'https://script.google.com/macros/s/AKfycbzoYJ8e0oE7iE9vM4P9cuHGk4j8jbepHcVXdUIHltdt2IadYDDW6ZjNH60Vy2PZPE5e/exec', OUT = (process.env.SHOTS || 'tests/.work/live8') + '/'; require('fs').mkdirSync(OUT, { recursive: true });
let P = 0, F = 0; const check = (c, m) => { c ? P++ : F++; console.log((c ? '  ✓ ' : '  ✗ FAIL ') + m); };
async function app(page) { for (let i = 0; i < 160; i++) { for (const f of page.frames()) { try { if (await f.$('#login-code')) return f; } catch (e) {} } await page.waitForTimeout(500); } throw new Error('no app'); }
const numOf = html => (String(html).replace(/<[^>]+>/g, ' ').match(/-?\d+(\.\d+)?/) || [''])[0];
(async () => {
  const b = await chromium.launch(), errs = [], W = { timeout: 60000 };
  const mk = async (code, vp) => { const p = await (await b.newContext({ viewport: vp || { width: 1366, height: 900 } })).newPage(); p.on('pageerror', e => errs.push(e.message)); await p.goto(URL, { timeout: 60000 }); const f = await app(p); await f.fill('#login-code', code); await f.click('#login-btn'); return [p, f]; };
  const S1 = process.env.S1, title = 'Live check #8 ' + new Date().toISOString().slice(11, 16);
  const [tp, t] = await mk(process.env.TEA); await t.waitForSelector('#t-refresh', W);
  await t.click('[data-tab="hw"]'); await t.waitForSelector('#hw-new', W); await t.click('#hw-new'); await t.waitForSelector('#hwb-to', W);
  let t0 = Date.now(); await t.selectOption('#hwb-to', 'st:' + S1); await t.waitForFunction(s => document.querySelector('#hwb-to') && document.querySelector('#hwb-to').value === 'st:' + s && /new\)/.test(document.querySelector('#hwb').textContent), S1, W);
  check(true, 'builder with fresh counts for the student (' + (Date.now() - t0) + ' ms)');
  await t.fill('#hwb-title', title);
  await t.check('[data-sub="TRIG.RT.SIDE_NUM"] [data-hwtick]'); await t.fill('[data-sub="TRIG.RT.SIDE_NUM"] .nin', '2');
  await t.check('[data-sub="TRIG.NR.AREA"] [data-hwtick]'); await t.fill('[data-sub="TRIG.NR.AREA"] .nin', '1');
  await tp.screenshot({ path: OUT + 'L8_01_builder.png', fullPage: true });
  t0 = Date.now(); await t.click('#hwb-pick'); await t.waitForSelector('#hwb-pub', W);
  check((await t.$$('#hwb-picked .cand')).length === 3, 'Pick: 3 questions (' + (Date.now() - t0) + ' ms)');
  await t.click('[data-swap="0:0"]'); await tp.screenshot({ path: OUT + 'L8_02_picked.png', fullPage: true });
  t0 = Date.now(); await t.click('#hwb-pub'); await t.waitForSelector('.okline', W);
  check(true, 'Publish (' + (Date.now() - t0) + ' ms)');
  const [sp, s] = await mk(S1, { width: 1180, height: 820 }); await s.waitForSelector('.hwcard', W);
  check(new RegExp(title.slice(0, 13)).test(await s.textContent('.hwcard')), 'student home: "Assigned by your teacher" card');
  await sp.screenshot({ path: OUT + 'L8_03_home.png' });
  t0 = Date.now(); await s.click('[data-hwstart]'); await s.waitForSelector('#set-card .stem', W);
  check(true, 'Start → the set (' + (Date.now() - t0) + ' ms)');
  const qs = await s.evaluate(() => H.set.questions.map(q => ({ qid: q.qid, type: q.type, letters: q.choices.map(c => c.label) })));
  const keys = {};
  for (const q of qs) { const g = await t.evaluate(id => API.goQuestion(S.teacher, id), q.qid); keys[q.qid] = q.type === 'mcq' ? g.answer.label : numOf(g.answer.html); }
  for (let i = 0; i < qs.length; i++) {
    const q = qs[i], v = i === 0 ? keys[q.qid] : (q.type === 'mcq' ? q.letters.find(l => l !== keys[q.qid]) : '1.11');
    if (q.type === 'mcq') await s.click(`#set-card .ch[data-l="${v}"]`); else await s.fill('#set-card .hwnum', String(v));
    if (i === 1) { await s.click('[data-ask="set"]'); await s.fill('[data-askbox="set"] textarea', 'Live check ask'); await s.click('[data-asksend="set"]'); await s.waitForSelector('[data-ask="set"].on', W); }
    if (i < qs.length - 1) await s.click(`[data-hwnav="${i + 1}"].btn`);
  }
  await s.waitForFunction(() => /Saved/.test(document.querySelector('#set-sync').textContent), null, W);
  check(true, 'autosave "Saved"'); await sp.screenshot({ path: OUT + 'L8_04_set.png' });
  await s.click(`[data-hwnav="${qs.length}"].qn`); await s.waitForSelector('.chkgrid', W); await sp.screenshot({ path: OUT + 'L8_05_check.png' });
  t0 = Date.now(); await s.click('#hw-submit'); await s.waitForSelector('.stats', W);
  check(new RegExp('1/' + qs.length).test(await s.textContent('.stats')), 'Submit → First Try 1/' + qs.length + ' (' + (Date.now() - t0) + ' ms)');
  await sp.screenshot({ path: OUT + 'L8_06_result.png', fullPage: true });
  await s.click('[data-hwfix]'); await s.waitForSelector('#fix-card .stem', W);
  const fixNum = await s.evaluate(() => { const i = H.fix.items.findIndex(o => !o.mcq && o.status === 'open'); if (i >= 0) hwFixGo(i); return i >= 0 ? H.fix.items[i].qid : ''; });
  if (fixNum) {
    await s.waitForFunction(q => H.keys[q], fixNum, W);
    await s.fill('#fix-card .hwnum', '2.22'); t0 = Date.now(); await s.click('#fix-check'); await s.waitForSelector('#fix-fb .fb.no', W);
    check(Date.now() - t0 < 600, 'Fix: ✗ at once (' + (Date.now() - t0) + ' ms)');
    await s.waitForFunction(() => /Saved/.test((document.querySelector('#fix-sync') || {}).textContent || ''), null, W);
    await s.fill('#fix-card .hwnum', String(keys[fixNum])); await s.click('#fix-check'); await s.waitForSelector('#fix-fb .fb.ok', W);
    await s.waitForFunction(() => /Best Score 2\//.test((document.querySelector('#fix-sync') || {}).textContent || ''), null, W);
    check(true, 'Fix right → Best Score 2/' + qs.length);
    await sp.screenshot({ path: OUT + 'L8_07_fix.png', fullPage: true });
  } else check(false, 'a typed item to fix');
  await s.click('#fix-back'); await s.waitForSelector('#scr-hw.on .stats', W); await s.click('#scr-hw.on [data-hw="history"]'); await s.waitForSelector('#hw-main table', W);
  check(new RegExp(title.slice(0, 13)).test(await s.textContent('#hw-main')), 'My history lists it'); await sp.screenshot({ path: OUT + 'L8_08_history.png' });
  await t.click('#t-refresh'); await t.waitForFunction(() => /Best 2\//.test((document.querySelector('.hwrow') || {}).textContent || ''), null, W);
  check(true, 'teacher list: First Try 1 · Best 2');
  await t.click('[data-hwgo]'); await t.waitForSelector('[data-gorow]', W);
  await tp.screenshot({ path: OUT + 'L8_09_goover.png', fullPage: true });
  const idx = await t.evaluate(q => TB.go.rows.findIndex(r => r.qid === q), qs[1].qid);
  await t.click(`[data-gorow="${idx}"]`); await t.waitForSelector('#go-card .stem', W); await t.waitForSelector('.gostud .msel', W);
  check(/Live check ask/.test(await t.textContent('#go-students')), 'Go over: the ask note on Q2');
  await t.click('#go-ans'); check(!(await t.$eval('#go-key', e => e.classList.contains('hidden'))), 'Show answer at once');
  await t.selectOption('.gostud .msel', 'Careless Calculation'); await t.waitForFunction(() => /Saved/.test(document.querySelector('.msaved').textContent), null, W);
  check(/Ask resolved/.test(await t.textContent('.msaved')), 'tag → Ask resolved'); await tp.screenshot({ path: OUT + 'L8_10_goover_q.png', fullPage: true });
  await t.click('#go-back'); await t.waitForSelector('#go-scope', W);
  await t.click('[data-tab="hw"]'); await t.waitForSelector('[data-hwact="close"]', W);
  await t.evaluate(ti => { const a = TB.list.current.find(x => x.title === ti); return a && API.hwSetStatus(S.teacher, a.assignment_id, 'close'); }, title);
  check(true, 'assignment closed (test student left clean)');
  check(errs.length === 0, 'no page errors ' + errs.join(' | '));
  await b.close(); console.log(`live #8: ${P} passed, ${F} failed`);
})().catch(e => { console.log('EXC', e.message); process.exit(1); });
