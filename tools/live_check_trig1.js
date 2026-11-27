const { chromium } = require('playwright');
// Live check of a real batch on the deployed app (#13): TEA=<teacher code> S1=<TEST student> node tools/live_check_trig1.js [qid …]
// Codes only from env (never in files or logs). The teacher assigns the 8 TRIG1 sub-skills (Easy) to S1, then sends each
// item with Assign next; the student opens it: figure inside the card (laptop + iPad widths), MathJax done, no source text,
// Check right · 3 tries → answer in Practise with teacher · 2 tries → answer in Practice · Hint keeps its line breaks.
// Screenshots hold question text: they go to PROJECT/app/shots only (private), never the repo.
const URL = 'https://script.google.com/macros/s/AKfycbzoYJ8e0oE7iE9vM4P9cuHGk4j8jbepHcVXdUIHltdt2IadYDDW6ZjNH60Vy2PZPE5e/exec', OUT = (process.env.SHOTS || 'tests/.work/live13') + '/'; require('fs').mkdirSync(OUT, { recursive: true });
const SUBS = { SN: 'TRIG.RT.SIDE_NUM', SD: 'TRIG.RT.SIDE_DEN', RA: 'TRIG.RT.ANGLE', AR: 'TRIG.NR.AREA', SS: 'TRIG.NR.SINE_SIDE', SA: 'TRIG.NR.SINE_ANGLE', CS: 'TRIG.NR.COS_SIDE', CA: 'TRIG.NR.COS_ANGLE' };
const ITEMS = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(SUBS).flatMap(k => ['E', 'M', 'H'].map(L => `TRIG1-${k}-${L}01`)).concat(['TRIG1-CS-H01']).filter((x, i, a) => a.indexOf(x) === i);
const WRONG3 = (process.env.WRONG || 'TRIG1-SN-M01,TRIG1-CA-E01').split(',');                  // two items: 3 wrong tries → the answer (one typed, one MCQ-or-typed past-paper)
let P = 0, F = 0; const check = (c, m) => { c ? P++ : F++; console.log((c ? '  ✓ ' : '  ✗ FAIL ') + m); };
async function app(page) { for (let i = 0; i < 160; i++) { for (const f of page.frames()) { try { if (await f.$('#login-code')) return f; } catch (e) {} } await page.waitForTimeout(500); } throw new Error('no app'); }
(async () => {
  const b = await chromium.launch(), errs = [], W = { timeout: 45000 };
  const mk = async (code, vp) => { const p = await (await b.newContext({ viewport: vp })).newPage(); p.on('pageerror', e => errs.push(e.message)); await p.goto(URL, { timeout: 60000 }); const f = await app(p); await f.fill('#login-code', code); await f.click('#login-btn'); return [p, f]; };
  const [tp, t] = await mk(process.env.TEA, { width: 1366, height: 900 }); await t.waitForSelector('#t-refresh', W);
  const S1 = process.env.S1;
  const h = await t.evaluate(([s1, subs]) => API.tsStart(S.teacher, s1, subs, 'E', '', ''), [S1, Object.values(SUBS)]);
  const sid = h.students.find(s => s.code === S1).open.session_id;
  check(!!sid, 'assigned the 8 TRIG1 sub-skills (Easy) to the TEST student');
  const views = [['laptop', { width: 1366, height: 860 }], ['ipad', { width: 820, height: 1180 }]];
  const [sp, s] = await mk(S1, views[0][1]); await s.waitForSelector('#home-list .card', W);
  let n = 0;
  for (const qid of ITEMS) {
    await t.evaluate(([s1, q]) => API.tsAssignNext(S.teacher, s1, q), [S1, qid]);
    await s.evaluate(sid => { S.scope = { teacher: sid }; openQuestion(null); }, sid);
    await s.waitForFunction(q => window.S && S.cur && S.cur.q.qid === q && document.querySelector('#q-check'), qid, W);
    await s.waitForFunction(() => !/\\\(|\\\[/.test(document.querySelector('#q-card').innerText), null, { timeout: 20000 }).catch(() => {});
    const res = [];
    for (const [dev, vp] of views) {
      await sp.setViewportSize(vp); await sp.waitForTimeout(400);
      const m = await s.evaluate(() => { const c = $('#q-card').getBoundingClientRect(), svg = [...$$('#q-stem svg')].find(x => !x.closest('mjx-container')); if (!svg) return { fig: 0 }; const r = svg.getBoundingClientRect(); return { fig: 1, w: Math.round(r.width), card: Math.round(c.width), inside: r.left >= c.left - 0.5 && r.right <= c.right + 0.5 }; });
      res.push(dev + (m.fig ? ' ' + m.w + '/' + m.card + (m.inside ? '' : ' OUTSIDE') : ' no figure'));
      if (m.fig && !m.inside) F++;
      await sp.screenshot({ path: OUT + `L13_${dev}_${qid}.png`, fullPage: true });
    }
    await sp.setViewportSize(views[0][1]);
    const txt = await s.textContent('#q-card'), raw = /\\\(|\\\[/.test(txt), src = /0580|Cambridge|UCLES|Paper \d|Haese|past paper/i.test(txt);
    const spec = await s.evaluate(() => S.spec), mcq = spec.t === 'mcq';
    if (WRONG3.includes(qid)) {
      for (let i = 0; i < 3; i++) {
        if (mcq) { const c = await s.$$eval('.ch:not([disabled])', (xs, k) => xs.map(x => x.getAttribute('data-l')).filter(l => l !== k), spec.k[0]); await s.click(`.ch[data-l="${c[0]}"]`); } else await s.fill('#q-num', '1.11');
        await s.click('#q-check'); await s.waitForTimeout(400);
        if (i < 2) { const fb = await s.textContent('#q-fb'); check(new RegExp((2 - i) + ' tr(y|ies) left').test(fb), qid + ' wrong ' + (i + 1) + ' → "' + (2 - i) + ' ' + (i === 1 ? 'try' : 'tries') + ' left"'); }
      }
      await s.waitForSelector('.fb.ans', W); check(/Answer:/.test(await s.textContent('#q-fb')), qid + ' 3rd wrong → the answer is shown');
      await sp.screenshot({ path: OUT + `L13_3tries_${qid}.png`, fullPage: true });
    } else {
      if (mcq) await s.click(`.ch[data-l="${spec.k[0]}"]`); else await s.fill('#q-num', String(spec.k[0]));
      await s.click('#q-check'); await s.waitForSelector('.fb.ok', W);
    }
    await s.waitForFunction(() => /Saved/.test((document.querySelector('#q-sync') || {}).textContent || ''), null, W).catch(() => {});
    check(!raw && !src, qid + ' · ' + res.join(' · ') + (raw ? ' · RAW TeX' : '') + (src ? ' · SOURCE TEXT' : '') + (mcq ? ' · MCQ' : ''));
    n++;
  }
  // Practice without the teacher: 2 tries, Hint keeps its line breaks
  await s.evaluate(() => { S.scope = { subskill: 'TRIG.NR.AREA' }; openQuestion(null); }); await s.waitForSelector('#q-check', W);
  check(await s.evaluate(() => S.cur.max_tries) === 2 && /^TRIG1-/.test(await s.evaluate(() => S.cur.q.qid)), 'Practice: a TRIG1 item, 2 tries');
  await s.click('#q-hint'); await s.waitForSelector('.hint', W);
  const br = await s.evaluate(() => $('.hint').querySelectorAll('br').length + $('.hint').querySelectorAll('p').length - 1);
  check(br >= 2, 'Hint keeps its line breaks (' + br + ' breaks)');
  const sp2 = await s.evaluate(() => S.spec), mcq2 = sp2.t === 'mcq';
  for (let i = 0; i < 2; i++) { if (mcq2) { const c = await s.$$eval('.ch:not([disabled])', (xs, k) => xs.map(x => x.getAttribute('data-l')).filter(l => l !== k), sp2.k[0]); await s.click(`.ch[data-l="${c[0]}"]`); } else await s.fill('#q-num', '1.11'); await s.click('#q-check'); await s.waitForTimeout(400); }
  await s.waitForSelector('.fb.ans', W); check(/Answer:/.test(await s.textContent('#q-fb')), 'Practice: 2nd wrong → the answer is shown + review list');
  await sp.screenshot({ path: OUT + 'L13_practice_2tries_hint.png', fullPage: true });
  await t.evaluate(sid => API.tsClose(S.teacher, sid), sid);
  check(errs.length === 0, 'no page errors ' + errs.join(' | '));
  await b.close(); console.log(`live #13 TRIG1: ${n} items · ${P} passed, ${F} failed`);
})().catch(e => { console.log('EXC', e.message); process.exit(1); });
