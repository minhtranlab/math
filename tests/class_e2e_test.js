// #9 Class mode in the browser: teacher + TWO student windows. Start a session → queue → push to all → live "Now" column
// shows what each student chose → pause one (cover + server refuses) → message → reveal → push to one → Open on my screen
// (answer + pen) → End class → the session result (teacher + student). Screenshots → SHOTS.
const { setup, sleep, shot, login, check, summary } = require('./h');
const KEY = { 'FX-001': 'B', 'FX-005': 'A', 'FX-006': 'C', 'FX-007': 'A' };
(async () => {
  const E = await setup();
  try {
    const tp = (await E.newPage()).page, a = (await E.newPage()).page, b = (await E.newPage()).page;
    await login(tp, E.url, 'TEACH-FX-9'); await tp.waitForSelector('#t-refresh');
    await tp.click('[data-tab="class"]'); await tp.waitForSelector('#cl-start');
    await tp.click('[data-pick="FX-T01"]'); await tp.click('[data-pick="FX-T03"]'); await tp.fill('#cl-title', 'Trig group');
    await shot(tp, 'C01_teacher_start');
    await tp.click('#cl-start'); await tp.waitForSelector('#cl-live table');
    check((await tp.$$('#cl-live tbody tr')).length === 2 && /Waiting/.test(await tp.textContent('#cl-live')), 'session started: 2 students waiting');
    for (const [pg, code] of [[a, 'FX-T01'], [b, 'FX-T03']]) { await login(pg, E.url, code); await pg.waitForSelector('[data-join]'); }
    check(/Join class/.test(await a.textContent('#home-list')), 'student home: "Join class" card');
    await shot(a, 'C02_student_join');
    await a.click('[data-join]'); await b.click('[data-join]');
    await a.waitForSelector('.wait'); check(/Waiting for your teacher/.test(await a.textContent('#q-card')), 'joined: "Waiting for your teacher…"');
    await tp.selectOption('#cl-sub', 'TRIG.RT.LABEL'); await tp.selectOption('#cl-diff', 'E'); await tp.click('#cl-add'); await tp.waitForSelector('#cl-queue .qrow');
    await tp.click('#cl-add'); await tp.waitForFunction(() => document.querySelectorAll('#cl-queue .qrow:not(.pushed)').length === 2);
    check(true, 'queue: 2 LABEL E items added');
    await tp.click('[data-push="*"]');
    await a.waitForSelector('.ch', { timeout: 10000 }); await b.waitForSelector('.ch', { timeout: 10000 });
    const qa = await a.evaluate(() => S.cur.q.qid), qb = await b.evaluate(() => S.cur.q.qid);
    check(qa === qb, 'push to all: both students see the same question (' + qa + ')');
    await a.click(`.ch[data-l="${KEY[qa] === 'A' ? 'B' : 'A'}"]`);
    await tp.waitForFunction(() => /\b[AB]\b/.test((document.querySelector('#cl-live .typed') || {}).textContent || ''), null, { timeout: 10000 });
    check(true, 'teacher "Now" column shows what FX-T01 chose, before Check');
    await a.click('#q-check'); await a.waitForSelector('.fb.no'); check(/2 try left/.test(await a.textContent('#q-fb')), 'class: 3 tries → "2 try left"');
    await tp.click('[data-ctl="pause"][data-to="FX-T03"]');
    await b.waitForSelector('#q-pause:not(.hidden)', { timeout: 10000 });
    check(/going over this question/.test(await b.textContent('#q-pause')), 'Pause → student screen covered: "Your teacher is going over this question"');
    await shot(b, 'C03_student_paused');
    await tp.fill('#cl-text', 'Which side touches angle A?'); await tp.selectOption('#cl-to', 'FX-T01'); await tp.click('#cl-send');
    await a.waitForSelector('.msg', { timeout: 10000 }); check(/touches angle A/.test(await a.textContent('#q-cls-msgs')), 'message appears on the student screen');
    await shot(a, 'C04_student_message');
    await sleep(1200); await shot(tp, 'C05_teacher_live');
    await tp.click('[data-ctl="continue"][data-to="FX-T03"]'); await b.waitForSelector('#q-pause.hidden', { state: 'attached', timeout: 10000 });
    await b.click(`.ch[data-l="${KEY[qb]}"]`); await b.click('#q-check'); await b.waitForSelector('.fb.ok');
    await b.waitForSelector('#q-wait'); check(/next question/.test(await b.textContent('#q-actions')), 'right → "Wait for your teacher\'s next question" (no Next button)');
    await tp.click('[data-ctl="reveal"][data-to="FX-T01"]');
    await a.waitForSelector('.fb.ans', { timeout: 10000 }); check(/Answer:/.test(await a.textContent('#q-fb')), 'Show answer now → the answer on FX-T01\'s screen');
    await shot(a, 'C06_student_revealed');
    await tp.click('[data-push="FX-T01"]');
    await a.waitForFunction(q => window.S && S.cur && S.cur.q.qid !== q, qa, { timeout: 10000 });
    check(await b.evaluate(q => S.cur.q.qid === q, qb), 'push to one: only FX-T01 got a new question');
    await tp.click('#cl-live [data-open]'); await tp.waitForSelector('#scr-tq.on .stem');
    await tp.click('#tq-ans'); check(!(await tp.$eval('#tq-answer', e => e.classList.contains('hidden'))), 'Open on my screen → Show answer');
    await tp.click('#tq-pen'); const cv = await tp.$('.pen-cv'), bx = await cv.boundingBox();
    await tp.mouse.move(bx.x + 60, bx.y + 40); await tp.mouse.down(); await tp.mouse.move(bx.x + 200, bx.y + 90, { steps: 8 }); await tp.mouse.up();
    check(await tp.evaluate(() => PEN.strokes.length === 1), 'pen draws on the question (1 stroke)');
    await tp.click('#tq-notes'); await tp.fill('#tq-text', 'sin = opp / hyp');
    await shot(tp, 'C07_teacher_open_on_screen');
    await tp.click('#tq-close'); await tp.waitForSelector('#cl-end');
    await tp.click('#cl-end'); await tp.waitForSelector('.tbar:has-text("Class session")');
    const res = await tp.textContent('#t-main');
    check(/Class session · Trig group/.test(res) && (await tp.$$('#t-main table')).length === 2, 'End class → "Class session · Trig group": students + questions tables');
    await shot(tp, 'C08_teacher_summary');
    await a.waitForSelector('#q-card .eyebrow:has-text("Class session")', { timeout: 10000 });
    check(/Class session/.test(await a.textContent('#q-card')), 'student sees the same result view with the "Class session" header');
    await shot(a, 'C09_student_summary');
    const att = E.st.gas.table('Attempts').filter(x => x.kind === 'class');
    check(att.length === 3 && att.filter(x => x.status === 'skipped').length === 1, 'Sheet: 3 class attempts, the unanswered one skipped');
    check(E.errors.length === 0, 'no page errors (' + E.errors.length + ')');
  } catch (e) { console.log('  ✗ FAIL: exception ' + e.stack); check(false, 'no exception'); }
  await E.close();
  process.exit(summary() ? 1 : 0);
})();
