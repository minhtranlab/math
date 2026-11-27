// #9 v2 "Practise with teacher" in the browser: teacher + one student window.
// Assign (sub-skills, level, begin, first question) → the card is at the TOP of the student's home → student chooses →
// teacher Live shows the same question + what is chosen + tries → NO auto-refresh → Refresh shows the new choice →
// Show answer (instant) → pen + More space + Snapshot + Calculator + Notes → Assign next (one question, then the app picks)
// → Close. Also: no E/M/H ladder on the question screen; student tools. Screenshots → SHOTS (T9_*).
const { setup, sleep, shot, login, check, summary } = require('./h');
const KEY = { 'FX-001': 'B', 'FX-005': 'A', 'FX-006': 'C', 'FX-007': 'A' };
async function draw(pg, sel, x0, y0, x1, y1) {
  const bx = await (await pg.$(sel)).boundingBox();
  await pg.mouse.move(bx.x + x0, bx.y + y0); await pg.mouse.down(); await pg.mouse.move(bx.x + x1, bx.y + y1, { steps: 10 }); await pg.mouse.up();
}
(async () => {
  const E = await setup();
  try {
    const tp = (await E.newPage()).page, sp = (await E.newPage()).page;
    console.log('teacher: assign');
    await login(tp, E.url, 'TEACH-FX-9'); await tp.waitForSelector('#t-refresh');
    await tp.click('[data-tab="with"]'); await tp.waitForSelector('[data-wform="FX-T03"]');
    check(!(await tp.$('[data-wlive="FX-T03"]')), 'nothing assigned yet: no Live button');
    await tp.click('[data-wform="FX-T03"]'); await tp.waitForSelector('#w-panel');
    await tp.check('input[data-wsub="TRIG.RT.LABEL"]'); await tp.check('input[data-wsub="TRIG.RT.ANGLE"]');
    check((await tp.$$eval('#w-begin option', o => o.map(x => x.value))).join() === 'TRIG.RT.LABEL,TRIG.RT.ANGLE', 'Begin at: the ticked sub-skills');
    await tp.click('[data-wlv="E"]'); await tp.selectOption('#w-begin', 'TRIG.RT.LABEL');
    await tp.click('#w-cand'); await tp.waitForSelector('[data-wpick="FX-001"]');
    await shot(tp, 'T9_01_teacher_assign');
    await tp.click('[data-wpick="FX-001"]'); check(/First: FX-001/.test(await tp.textContent('#w-qid')), 'first question chosen: FX-001');
    await tp.click('#w-start'); await tp.waitForSelector('.okline');
    const ts = E.st.gas.table('Teacher_Sessions');
    check(ts.length === 1 && ts[0].student_code === 'FX-T03' && ts[0].begin_qid === 'FX-001' && ts[0].status === 'open', 'Sheet: one open Teacher_Sessions row (begin FX-001)');
    check(/Right triangle|LABEL|Label/i.test(await tp.textContent('#t-main tbody')), 'table shows the assignment');
    await shot(tp, 'T9_02_teacher_assigned');

    console.log('student: card at the top → question');
    await login(sp, E.url, 'FX-T03'); await sp.waitForSelector('#home-list .card');
    check(await sp.$eval('#home-list', el => el.firstElementChild.classList.contains('tcard')), 'home: "Practise with teacher" card is the FIRST card');
    await shot(sp, 'T9_03_student_home_card');
    await sp.click('[data-start="teacher"]'); await sp.waitForSelector('.ch');
    check(await sp.evaluate(() => S.cur.q.qid) === 'FX-001' && !(await sp.$eval('#q-ts', e => e.classList.contains('hidden'))), 'first question = FX-001; "Practise with teacher" bar shown');
    check((await sp.$$('#scr-q .tools .tool')).length === 4, 'student tools: Pen · Calculator · Notes · More space');
    await sp.click('.ch[data-l="A"]'); await sp.click('#q-check'); await sp.waitForSelector('.fb.no');
    check(/2 tries left/.test(await sp.textContent('#q-fb')), '3 tries: wrong → "2 tries left"');
    await sp.waitForFunction(() => /Saved/.test(document.querySelector('#q-sync').textContent));
    check(!(await sp.$('#scr-q .lad')), 'no E1–E3/M1–M3/H1–H3 ladder on the question screen');
    await sp.click('.ch[data-l="C"]'); await sleep(1200);

    console.log('teacher: Live');
    await tp.click('[data-wlive="FX-T03"]'); await tp.waitForSelector('#scr-tq.on #tq-state');
    check(/FX-001/.test(await tp.textContent('#tq-qid')) && await tp.$eval('#tq-card .ch[data-tl="A"]', e => e.classList.contains('tried')), 'Live: the same question FX-001, A marked as tried');
    check(await tp.$eval('#tq-card .ch[data-tl="C"]', e => e.classList.contains('sel')) && /Now chosen: C/.test(await tp.textContent('#tq-state')) && /Tries 1 of 3/.test(await tp.textContent('#tq-state')), 'Live: "Now chosen: C", "Tries 1 of 3"');
    await shot(tp, 'T9_04_teacher_live');
    const nLive = E.st.rpcLog.filter(r => r.fn === 'tsLive').length;
    await sp.click('.ch[data-l="B"]'); await sleep(2500);
    check(/Now chosen: C/.test(await tp.textContent('#tq-state')) && E.st.rpcLog.filter(r => r.fn === 'tsLive').length === nLive, 'no auto-refresh: still C, no new Live read');
    await tp.click('#tq-refresh'); await tp.waitForFunction(() => /Now chosen: B/.test(document.querySelector('#tq-state').textContent));
    check(true, 'Refresh → "Now chosen: B"');
    await tp.click('#tq-ans'); check(/B/.test(await tp.textContent('#tq-key')) && !(await tp.$eval('#tq-key', e => e.classList.contains('hidden'))), 'Show answer: the key (B) at once');
    // pen + More space
    await tp.click('#scr-tq [data-tool="pen"]'); check(!(await tp.$eval('#pen-bar', e => e.hidden)), 'Pen → pen bar');
    await draw(tp, '#tq-work .pen-cv', 80, 60, 260, 120);
    const h0 = await tp.$eval('#tq-work', e => e.scrollHeight);
    await tp.click('#scr-tq [data-tool="space"]');
    const h1 = await tp.$eval('#tq-work', e => e.scrollHeight), cvh = await tp.$eval('#tq-work .pen-cv', e => e.clientHeight);
    check(h1 > h0 + 300 && cvh >= h1 - 2, 'More space: blank area added below, the pen covers it (' + h0 + ' → ' + h1 + ')');
    await tp.evaluate(() => $('#tq-work .blank').scrollIntoView({ block: 'center' }));
    const bb = await (await tp.$('#tq-work .blank')).boundingBox(); await tp.mouse.move(bb.x + 80, bb.y + 80); await tp.mouse.down(); await tp.mouse.move(bb.x + 300, bb.y + 160, { steps: 10 }); await tp.mouse.up();
    await tp.evaluate(() => window.scrollTo(0, 0));
    check(await tp.evaluate(() => PEN.strokes.length) === 2, 'pen: 2 strokes (on the question + in the space)');
    await tp.click('[data-pc="red"]'); await draw(tp, '#tq-work .pen-cv', 300, 70, 420, 70);
    await tp.click('[data-pt="off"]');
    await tp.click('#tq-refresh'); await sleep(800);
    check(await tp.evaluate(() => PEN.strokes.length) === 3 && !!(await tp.$('#tq-work .blank')), 'Refresh on the same question keeps the ink and the space');
    // calculator + notes
    await tp.click('#scr-tq [data-tool="calc"]'); await tp.waitForSelector('#calc-graph .desmos-stub');
    check(await tp.evaluate(() => /apiKey=dcb31709b452b1cf9dc26972add0fda6/.test(window.DESMOS_URL)), 'Calculator: Desmos panel (demo key from Settings default)');
    await tp.click('#calc-s'); await tp.waitForSelector('#calc-sci .desmos-stub'); await tp.click('#calc-g');
    await tp.click('#scr-tq [data-tool="notes"]'); await tp.waitForSelector('#notes-lines .mq-editable-field', { timeout: 10000 });
    await tp.click('#notes-lines .mq-editable-field'); await tp.keyboard.type('x^2'); await tp.keyboard.press('ArrowRight'); await tp.keyboard.type('+1');
    const tex = await tp.evaluate(() => $$('#notes-lines .nl')[0]._mf.latex());
    check(/x\^2\+1|x\^{2}\+1/.test(tex) && await tp.evaluate(() => typeof $ === 'function' && $('#tq-card') !== null && window.jQuery === undefined), 'Notes: math line (MathQuill) → "' + tex + '"; the page $ still works');
    await tp.click('#notes-text'); await tp.keyboard.type('opposite / hypotenuse');
    await shot(tp, 'T9_05_teacher_tools');
    await tp.click('[data-close="calc"]'); await tp.click('[data-close="notes"]');
    // snapshot
    await tp.click('#tq-snap'); await tp.waitForSelector('#snap:not(.hidden)', { timeout: 15000 });
    const snap = await tp.evaluate(() => new Promise(r => { const i = $('#snap-img'); const f = () => r({ w: i.naturalWidth, h: i.naturalHeight, src: i.src.slice(0, 22), dl: $('#snap-dl').download }); if (i.complete && i.naturalWidth) f(); else i.onload = f; }));
    check(snap.src === 'data:image/png;base64,' && snap.w > 600 && snap.h > 900 && /^question_\d+\.png$/.test(snap.dl), 'Snapshot: one PNG of question + ink + blank area (' + snap.w + '×' + snap.h + '), Download ' + snap.dl);
    await shot(tp, 'T9_06_teacher_snapshot');
    await tp.click('#snap-close');
    // assign next
    await tp.click('#tq-next'); await tp.waitForSelector('#nx-list .cands, #nx-list .empty');
    check(!!(await tp.$('#nx-sub optgroup[label="Another sub-skill"] option[value="TRIG.RT.SIDE_NUM"]')), 'Assign next: another sub-skill can be chosen too (SIDE_NUM listed)');
    await tp.click('[data-nxlv="H"]'); await tp.waitForSelector('[data-nxpick="FX-006"]');
    await shot(tp, 'T9_07_teacher_assign_next');
    await tp.click('[data-nxpick="FX-006"]'); await tp.waitForFunction(() => /Next: FX-006/.test(document.querySelector('#tq-info').textContent));
    check(E.st.gas.table('Teacher_Sessions')[0].next_qid === 'FX-006', 'Assign next → stored (FX-006), shown "Next: FX-006"');

    console.log('student: the assigned next question, then the app picks');
    await sp.click('.ch[data-l="B"]'); await sp.click('#q-check'); await sp.waitForSelector('.fb.ok');
    await sp.waitForSelector('#q-next'); await sp.click('#q-next');
    await sp.waitForFunction(() => S.cur && S.cur.q.qid === 'FX-006');
    check(E.st.gas.table('Teacher_Sessions')[0].next_qid === '', 'student gets FX-006; Assign next is used up');
    await sp.click('#scr-q [data-tool="space"]'); await sp.click('#scr-q [data-tool="pen"]');
    await draw(sp, '#q-work .pen-cv', 60, 50, 220, 90);
    check(!!(await sp.$('#q-work .blank')) && await sp.evaluate(() => PEN.strokes.length) === 1, 'student: More space + pen work on the question screen');
    await sp.click('[data-pt="off"]');
    await shot(sp, 'T9_08_student_question_tools');
    E.st.latency = 1500;                                              // the save is slow: the student presses Next before it comes back
    await sp.click('.ch[data-l="C"]'); await sp.click('#q-check'); await sp.waitForSelector('.fb.ok'); await sp.click('#q-next');
    await sleep(2200); E.st.latency = 0;
    await sp.waitForFunction(() => S.cur && S.cur.q.qid !== 'FX-006');
    check(await sp.evaluate(() => !$('#q-work .blank') && PEN.strokes.length === 0), 'new question: space + ink cleared');
    check(E.errors.length === 0, 'Next before the save came back: no page error, the late reply is ignored');
    const at = E.st.gas.table('Attempts').filter(a => a.kind === 'teacher');
    check(at.length === 3 && at.every(a => a.session_id === ts[0].session_id), 'Sheet: 3 attempts kind "teacher" with the session id');
    await tp.click('#tq-refresh'); await tp.waitForFunction(q => document.querySelector('#tq-qid').textContent !== 'FX-006' && document.querySelector('#tq-qid').textContent !== 'FX-001', null);
    check(!(await tp.$('#tq-work .blank')), 'teacher Refresh after a new question: the new question, fresh space');
    check(!E.st.rpcLog.some(r => !/^(ts|teacher)/.test(r.fn) && /"key"|accepted|mistake_type/.test(r.res)), 'no key / mistake type in any student payload (' + E.st.rpcLog.length + ' calls)');

    console.log('teacher: close');
    await tp.click('#tq-close'); await tp.waitForSelector('[data-wclose]');
    await tp.click('[data-wclose]'); await tp.waitForFunction(() => !document.querySelector('[data-wclose]'));
    await sp.click('#scr-q .who [data-go="home"]'); await sp.waitForSelector('#home-list .card');
    check(!(await sp.$('.tcard')), 'closed → the card leaves the student home');
    await sp.setViewportSize({ width: 820, height: 1180 });
    check(E.errors.length === 0, 'no page errors (' + E.errors.length + ')');
  } catch (e) { console.log('  ✗ FAIL: exception ' + e.stack); check(false, 'no exception'); }
  await E.close();
  process.exit(summary() ? 1 : 0);
})();
