const { chromium } = require('playwright');
// Live check of "Practise with teacher" (#9 v2) on the deployed app: TEA=<teacher code> S1=<TEST student> node tools/live_check_teacher.js
// Codes only from env (never in files or logs). Assigns TRIG.RT to S1, checks the top card, Live + Refresh (no auto),
// Show answer, pen, More space, real Desmos + MathQuill + html2canvas Snapshot, Assign next (served once), then closes it.
const URL = 'https://script.google.com/macros/s/AKfycbzoYJ8e0oE7iE9vM4P9cuHGk4j8jbepHcVXdUIHltdt2IadYDDW6ZjNH60Vy2PZPE5e/exec', OUT = (process.env.SHOTS || 'tests/.work/live') + '/'; require('fs').mkdirSync(OUT, { recursive: true });
let P = 0, F = 0; const check = (c, m) => { c ? P++ : F++; console.log((c ? '  ✓ ' : '  ✗ FAIL ') + m); };
async function app(page) { for (let i = 0; i < 80; i++) { for (const f of page.frames()) { try { if (await f.$('#login-code')) return f; } catch (e) {} } await page.waitForTimeout(500); } throw new Error('no app'); }
async function answerSomething(f) { if (await f.$('#q-num')) { await f.fill('#q-num', '0.123'); } else { const c = await f.$$('.ch:not([disabled])'); await c[c.length - 1].click(); } }
(async () => {
  const b = await chromium.launch(), errs = [], W = { timeout: 40000 };
  const mk = async (code, vp) => { const p = await (await b.newContext({ viewport: vp || { width: 1366, height: 900 } })).newPage(); p.on('pageerror', e => errs.push(e.message + ' @ ' + String(e.stack).split('\n')[1])); await p.goto(URL, { timeout: 60000 }); const f = await app(p); await f.fill('#login-code', code); await f.click('#login-btn'); return [p, f]; };
  const S1 = process.env.S1;
  const [tp, t] = await mk(process.env.TEA); await t.waitForSelector('#t-refresh', W);
  await t.click('[data-tab="with"]'); await t.waitForSelector('[data-wform="' + S1 + '"]', W);
  await t.click('[data-wform="' + S1 + '"]'); await t.waitForSelector('#w-panel', W);
  await t.check('input[data-wskill="TRIG.RT"]'); await t.click('[data-wlv="E"]');
  await t.click('#w-cand'); await t.waitForSelector('#w-cands .cand, #w-cands .empty', W);
  await tp.screenshot({ path: OUT + 'L9v2_01_teacher_assign.png', fullPage: true });
  let t0 = Date.now(); await t.click('#w-start'); await t.waitForSelector('.okline', W);
  check(true, 'assigned TRIG.RT · Easy (' + (Date.now() - t0) + ' ms)');
  const [sp, s] = await mk(S1, { width: 1180, height: 820 }); await s.waitForSelector('#home-list .card', W);
  check(await s.$eval('#home-list', el => el.firstElementChild.classList.contains('tcard')), 'student home: "Practise with teacher" card first');
  await sp.screenshot({ path: OUT + 'L9v2_02_student_home.png' });
  await s.click('[data-start="teacher"]'); await s.waitForSelector('#q-check', W);
  const q1 = await s.evaluate(() => S.cur.q.qid);
  check(await s.evaluate(() => S.cur.max_tries) === 3, 'question ' + q1 + ' · 3 tries');
  await answerSomething(s); await s.waitForTimeout(1800);
  t0 = Date.now(); await t.click('.okline [data-wlive]'); await t.waitForSelector('#scr-tq.on #tq-state', W);
  const st1 = await t.textContent('#tq-state');
  check(await t.textContent('#tq-qid') === q1 && /Now (chosen|typed)/.test(st1), 'Live (' + (Date.now() - t0) + ' ms): same question, ' + st1.match(/Now (chosen|typed): \S+/)[0]);
  await tp.screenshot({ path: OUT + 'L9v2_03_teacher_live.png' });
  if (await s.$('#q-num')) await s.fill('#q-num', '0.456'); else { const c = await s.$$('.ch:not([disabled])'); await c[0].click(); }
  await s.waitForTimeout(2500);
  check((await t.textContent('#tq-state')) === st1 || /Now/.test(await t.textContent('#tq-state')) && !/0\.456/.test(await t.textContent('#tq-state')), 'no auto-refresh');
  t0 = Date.now(); await t.click('#tq-refresh'); await t.waitForFunction(old => document.querySelector('#tq-state').textContent !== old && !/Refreshing/.test(document.querySelector('#tq-refresh').textContent), st1, W);
  check(true, 'Refresh → the new choice (' + (Date.now() - t0) + ' ms): ' + (await t.textContent('#tq-state')).match(/Now (chosen|typed): \S+/)[0]);
  await t.click('#tq-ans'); check(!(await t.$eval('#tq-key', e => e.classList.contains('hidden'))), 'Show answer at once');
  await t.click('#scr-tq [data-tool="pen"]'); const bx = await (await t.$('#tq-work .pen-cv')).boundingBox();
  await tp.mouse.move(bx.x + 60, bx.y + 50); await tp.mouse.down(); await tp.mouse.move(bx.x + 260, bx.y + 110, { steps: 10 }); await tp.mouse.up();
  await t.click('[data-pt="off"]'); await t.click('#scr-tq [data-tool="space"]');
  check(await t.evaluate(() => PEN.strokes.length === 1 && !!$('#tq-work .blank')), 'pen stroke + More space');
  await t.click('#scr-tq [data-tool="calc"]'); await t.waitForSelector('#calc-graph .dcg-container, #calc-graph .dcg-wrapper, #calc-graph [class*="dcg"]', W);
  check(true, 'Calculator: real Desmos graphing loaded');
  await t.click('#scr-tq [data-tool="notes"]'); await t.waitForSelector('#notes-lines .mq-editable-field', W);
  await t.click('#notes-lines .mq-editable-field'); await tp.keyboard.type('sin x=0.5');
  check(/sin/.test(await t.evaluate(() => $$('#notes-lines .nl')[0]._mf.latex())) && await t.evaluate(() => typeof $ === 'function' && !!$('#tq-card')), 'Notes: MathQuill math line');
  await tp.waitForTimeout(800); await tp.screenshot({ path: OUT + 'L9v2_04_teacher_tools.png' });
  await t.click('[data-close="calc"]'); await t.click('[data-close="notes"]');
  t0 = Date.now(); await t.click('#tq-snap'); await t.waitForSelector('#snap:not(.hidden)', W);
  const sn = await t.evaluate(() => new Promise(r => { const i = $('#snap-img'); const f = () => r([i.naturalWidth, i.naturalHeight]); if (i.complete && i.naturalWidth) f(); else i.onload = f; }));
  check(sn[0] > 500 && sn[1] > 500, 'Snapshot PNG ' + sn.join('×') + ' (' + (Date.now() - t0) + ' ms)');
  await tp.screenshot({ path: OUT + 'L9v2_05_teacher_snapshot.png' }); await t.click('#snap-close');
  await t.click('#tq-next'); await t.waitForSelector('#nx-list .cand, #nx-list .empty', W);
  let want = '';
  for (const sub of await t.$$eval('#nx-sub option', o => o.map(x => x.value))) {
    for (const L of ['E', 'M', 'H']) {
      await t.selectOption('#nx-sub', sub); await t.click('[data-nxlv="' + L + '"]'); await tp.waitForTimeout(300);
      await t.waitForSelector('#nx-list .cand, #nx-list .empty', W);
      want = (await t.$$eval('[data-nxpick]', xs => xs.map(x => x.getAttribute('data-nxpick')))).filter(x => x !== q1)[0] || '';
      if (want) break;
    }
    if (want) break;
  }
  await tp.screenshot({ path: OUT + 'L9v2_06_teacher_assign_next.png' });
  await t.click('[data-nxpick="' + want + '"]'); await t.waitForFunction(q => new RegExp('Next: ' + q).test(document.querySelector('#tq-info').textContent), want, W);
  check(true, 'Assign next → ' + want);
  for (let i = 0; i < 3 && !(await s.$('#q-next')); i++) { await answerSomething(s); await s.click('#q-check'); await s.waitForTimeout(2500); }
  await s.waitForSelector('#q-next', W); const a1 = await s.evaluate(() => S.cur.attempt_id);
  await s.click('#q-next'); await s.waitForFunction(a => S.cur && S.cur.attempt_id !== a && document.querySelector('#q-check'), a1, W);
  const q2 = await s.evaluate(() => S.cur.q.qid);
  check(q2 === want, 'student next question = the assigned one (' + q2 + ')');
  await s.click('#scr-q [data-tool="space"]'); await s.click('#scr-q [data-tool="pen"]');
  await sp.screenshot({ path: OUT + 'L9v2_07_student_question.png' }); await s.click('[data-pt="off"]');
  await t.click('#tq-refresh'); await t.waitForFunction(q => document.querySelector('#tq-qid').textContent === q, q2, W);
  check(true, 'teacher Refresh → ' + q2);
  await tp.screenshot({ path: OUT + 'L9v2_08_teacher_live_next.png' });
  await t.click('#tq-close'); await t.waitForSelector('[data-wclose]', W); await t.click('[data-wclose]'); await t.waitForFunction(() => !document.querySelector('[data-wclose]'), null, W);
  check(true, 'assignment closed (the test student is left clean)');
  check(errs.length === 0, 'no page errors ' + errs.join(' | '));
  await b.close(); console.log(`live #9 v2: ${P} passed, ${F} failed`);
})().catch(e => { console.log('EXC', e.message); process.exit(1); });
