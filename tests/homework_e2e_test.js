// #8 in the browser (made-up FX1): teacher builds an assignment (tick, n, E/M/H, Pick, Swap, Publish) → student home card →
// the set (free navigation, autosave, reload = same answers, Ask teacher, Check Your Work, Submit) → result (First Try,
// Best Score, by sub-skill, mistakes) → Fix wrong answers (instant ✓/✗, tries left, no key) → My history → Open →
// teacher Assignments list, Go over (priority, Show answer, tries, Mistake select → Ask resolved) → Asked inbox; Practice
// Ask teacher. Screenshots → SHOTS (T8_*).
const { setup, sleep, shot, login, check, summary } = require('./h');
const KEY = { 'FX-001': 'B', 'FX-005': 'A', 'FX-006': 'C', 'FX-007': 'A', 'FX-002': '5.00', 'FX-003': '36.9' };
(async () => {
  const E = await setup();
  try {
    const tp = (await E.newPage()).page, sp = (await E.newPage()).page;
    console.log('teacher: build + publish');
    await login(tp, E.url, 'TEACH-FX-9'); await tp.waitForSelector('#t-refresh');
    await tp.click('[data-tab="hw"]'); await tp.waitForSelector('#hw-new');
    await tp.click('#hw-new'); await tp.waitForSelector('#hwb');
    await tp.fill('#hwb-title', 'Labels homework');
    await tp.selectOption('#hwb-to', 'st:FX-T01'); await tp.waitForFunction(() => document.querySelector('#hwb-to') && document.querySelector('#hwb-to').value === 'st:FX-T01' && /new/.test(document.querySelector('#hwb').textContent));
    await tp.fill('#hwb-title', 'Labels homework');
    await tp.check('[data-sub="TRIG.RT.LABEL"] [data-hwtick]'); await tp.fill('[data-sub="TRIG.RT.LABEL"] .nin', '3');
    await tp.check('[data-sub="TRIG.RT.SIDE_NUM"] [data-hwtick]'); await tp.fill('[data-sub="TRIG.RT.SIDE_NUM"] .nin', '1');
    check(/E 2 \(2 new\)/.test(await tp.textContent('[data-sub="TRIG.RT.LABEL"]')), 'builder: LABEL "E 2 (2 new) · M 1 · H 1"');
    await shot(tp, 'T8_01_builder');
    await tp.click('#hwb-pick'); await tp.waitForSelector('#hwb-pub');
    check((await tp.$$('#hwb-picked .cand')).length === 4 && /new for all/.test(await tp.textContent('#hwb-picked')), 'Pick: 4 questions, "new for all"');
    const before = await tp.$$eval('#hwb-picked .cand b', xs => xs.map(x => x.textContent));
    await tp.click('[data-swap="0:0"]');
    const after = await tp.$$eval('#hwb-picked .cand b', xs => xs.map(x => x.textContent));
    check(before[0] !== after[0] && new Set(after).size === 4, 'Swap: the first item replaced by another (' + before[0] + ' → ' + after[0] + ')');
    await shot(tp, 'T8_02_picked');
    await tp.click('#hwb-pub'); await tp.waitForSelector('.okline');
    check(E.st.gas.table('Assignments').length === 1 && /Labels homework/.test(await tp.textContent('#t-main')), 'Publish → listed under Current');
    const qids = E.st.gas.table('Assignments')[0].qids.split(',');

    console.log('student: the set');
    await login(sp, E.url, 'FX-T01'); await sp.waitForSelector('.hwcard');
    check(/Assigned by your teacher/.test(await sp.textContent('.hwcard')) && /4 questions/.test(await sp.textContent('.hwcard')), 'home: "Assigned by your teacher · Labels homework · 4 questions"');
    await shot(sp, 'T8_03_home_card');
    await sp.click('[data-hwstart]'); await sp.waitForSelector('#set-card .stem');
    check((await sp.$$('#set-nav .qn')).length === 5 && /Question 1 of 4/.test(await sp.textContent('#set-pos')) && !(await sp.$('#q-hint')), 'set: 4 numbers + Check, "Question 1 of 4", no Hint');
    const order = await sp.evaluate(() => H.set.questions.map(q => q.qid));
    const wrongOf = q => q === 'FX-002' ? '9' : q === 'FX-001' ? 'A' : q === 'FX-005' ? 'B' : 'B';
    for (let i = 0; i < order.length; i++) {
      const q = order[i], v = i === 0 ? KEY[q] : wrongOf(q);
      if (await sp.$('#set-card .hwnum')) await sp.fill('#set-card .hwnum', v); else await sp.click(`#set-card .ch[data-l="${v}"]`);
      if (i === 1) { await sp.click('[data-ask="set"]'); await sp.fill('[data-askbox="set"] textarea', 'Why not this side?'); await sp.click('[data-asksend="set"]'); await sp.waitForSelector('[data-ask="set"].on'); }
      if (i < order.length - 1) await sp.click(`[data-hwnav="${i + 1}"].btn`);
    }
    check(await sp.$eval('#set-nav', n => n.querySelectorAll('.qn.asked').length === 1), 'Ask teacher: "?" on the question number');
    await sp.waitForFunction(() => /Saved/.test(document.querySelector('#set-sync').textContent), null, { timeout: 8000 });
    await shot(sp, 'T8_04_set_question');
    const saved = JSON.parse(E.st.gas.table('Sets')[0].state_json || '{}');
    check(Object.keys(saved.ans || {}).length === 4, 'autosave: 4 answers in the Sheet before Submit');
    await sp.reload(); await sp.waitForSelector('.hwcard');
    check(/4\/4 answered/.test(await sp.textContent('.hwcard')) && /Continue/.test(await sp.textContent('.hwcard')), 'reload → home card "Continue · 4/4 answered"');
    await sp.click('[data-hwstart]'); await sp.waitForSelector('#set-card .stem');
    check(await sp.evaluate(() => Object.keys(H.ans).length) === 4, 'Continue: the 4 answers are back');
    await sp.click(`[data-hwnav="${order.length}"].qn`); await sp.waitForSelector('.chkgrid');
    check(/Check Your Work/.test(await sp.textContent('#set-card')) && (await sp.$$('.chkgrid .qn.done')).length === 4, 'Check Your Work: 4 answered');
    await shot(sp, 'T8_05_check_your_work');
    await sp.click('#hw-submit'); await sp.waitForSelector('.stats');
    check(/1\/4/.test(await sp.textContent('.stats')) && /Fix wrong answers \(3\)/.test(await sp.textContent('#hw-main')), 'result: First Try 1/4 · Best 1/4 · "Fix wrong answers (3)"');
    check(!/Answer:/.test(await sp.textContent('#hw-main')), 'result: no correct answer shown');
    await shot(sp, 'T8_06_result');

    console.log('student: fix');
    await sp.click('[data-hwfix]'); await sp.waitForSelector('#fix-check');
    await sp.evaluate(() => { const i = H.fix.items.findIndex(o => o.qid === 'FX-002'); if (i >= 0) hwFixGo(i); });
    const fq = await sp.evaluate(() => hwFixItem().qid);
    await sp.waitForFunction(q => H.keys[q], fq);
    if (await sp.$('#fix-card .hwnum')) await sp.fill('#fix-card .hwnum', '7'); else { const ls = await sp.$$eval('#fix-card .ch:not([disabled])', (xs, k) => xs.map(x => x.getAttribute('data-l')).filter(l => l !== k), KEY[fq]); await sp.click(`#fix-card .ch[data-l="${ls[0]}"]`); }
    const t0 = Date.now(); await sp.click('#fix-check'); await sp.waitForSelector('#fix-fb .fb.no'); const inst = Date.now() - t0;
    check(inst < 400, 'fix: ✗ shown at once (' + inst + ' ms, before the server answers)');
    await sp.waitForFunction(() => /Saved/.test((document.querySelector('#fix-sync') || {}).textContent || ''));
    if (await sp.$('#fix-card .hwnum')) await sp.fill('#fix-card .hwnum', String(KEY[fq])); else await sp.click(`#fix-card .ch[data-l="${KEY[fq]}"]`);
    await sp.click('#fix-check'); await sp.waitForSelector('#fix-fb .fb.ok');
    await sp.waitForFunction(() => /Best Score 2\/4/.test((document.querySelector('#fix-sync') || {}).textContent || ''));
    check(true, 'fix right → "✓ Fixed" · Best Score 2/4');
    check(!E.st.rpcLog.some(r => /^hw/.test(r.fn) && /"key"|"answer":\{|mistake_auto|accepted/.test(r.res)), 'no key in any assignment payload (' + E.st.rpcLog.filter(r => /^hw/.test(r.fn)).length + ' calls)');
    await shot(sp, 'T8_07_fix');
    await sp.click('#fix-back'); await sp.waitForSelector('#scr-hw.on .stats');
    check(/2\/4/.test(await sp.textContent('.stats')), 'Result again: Best Score 2/4');
    await sp.click('#scr-hw.on [data-hw="history"]'); await sp.waitForSelector('#hw-main table');
    check(/Labels homework/.test(await sp.textContent('#hw-main')) && /2\/4/.test(await sp.textContent('#hw-main')), 'My history: Labels homework · Best 2/4');
    await sp.click('[data-hwopen]'); await sp.waitForSelector('#fix-card .fb');
    check(/Your answer/.test(await sp.textContent('#fix-card')) && !(await sp.$('#fix-check')), 'Open: read-only (their answer, no Check)');
    await shot(sp, 'T8_08_open_review');

    console.log('practice ask');
    await sp.click('#scr-fix [data-go="home"].link'); await sp.waitForSelector('#home-list .card');
    await sp.evaluate(() => { S.scope = { subskill: 'TRIG.RT.LABEL' }; openQuestion(null); }); await sp.waitForSelector('#q-check');
    await sp.click('[data-ask="q"]'); await sp.fill('[data-askbox="q"] textarea', 'help'); await sp.click('[data-asksend="q"]'); await sp.waitForSelector('[data-ask="q"].on');
    check(E.st.gas.table('Asks').length === 2, 'Practice: Ask teacher saved (2 asks in all)');

    console.log('teacher: list, go over, tag, inbox');
    await tp.click('#t-refresh'); await tp.waitForFunction(() => /Best/.test((document.querySelector('.hwrow') || {}).textContent || ''));
    check(/First Try 1\/4 · Best 2\/4/.test(await tp.textContent('.hwrow')), 'Assignments: Tess · First Try 1/4 · Best 2/4');
    await tp.click('[data-hwgo]'); await tp.waitForSelector('[data-gorow]');
    const nRows = (await tp.$$('#t-main tbody tr')).length;
    check(nRows === 4 && /wrong/.test(await tp.textContent('#t-main tbody tr')), 'Go over: 4 questions, wrong first');
    await shot(tp, 'T8_09_goover_list');
    const askedQ = order[1], idx = await tp.evaluate(q => TB.go.rows.findIndex(r => r.qid === q), askedQ);
    await tp.click(`[data-gorow="${idx}"]`); await tp.waitForSelector('#go-card .stem'); await tp.waitForSelector('.gostud .msel');
    check(/Why not this side\?/.test(await tp.textContent('#go-students')), 'question panel: the ask note');
    const t1 = Date.now(); await tp.click('#go-ans'); const sa = Date.now() - t1;
    check(!(await tp.$eval('#go-key', e => e.classList.contains('hidden'))) && sa < 300 && E.st.rpcLog.slice(-1)[0].fn !== 'teacherKey', 'Show answer: instant (' + sa + ' ms, no server call)');
    check((await tp.$$eval('.msel optgroup', xs => xs.map(x => x.label))).join() === 'Mistake types,This sub-skill', 'Mistake select: "Mistake types" + "This sub-skill" groups');
    await tp.selectOption('.gostud .msel', 'Misread A Detail'); await tp.waitForFunction(() => /Saved/.test(document.querySelector('.msaved').textContent));
    check(/Ask resolved/.test(await tp.textContent('.msaved')) && E.st.gas.table('Asks').find(a => a.qid === askedQ).status === 'resolved', 'tag → saved + the Ask resolved');
    await tp.click('#scr-go [data-tool="pen"]'); const cv = await (await tp.$('#go-work .pen-cv')).boundingBox();
    await tp.mouse.move(cv.x + 50, cv.y + 40); await tp.mouse.down(); await tp.mouse.move(cv.x + 220, cv.y + 90, { steps: 8 }); await tp.mouse.up(); await tp.click('[data-pt="off"]');
    await shot(tp, 'T8_10_goover_question');
    await tp.click('#go-back'); await tp.waitForSelector('#go-scope');
    await tp.click('[data-tab="asked"]'); await tp.waitForSelector('[data-askopen]');
    check((await tp.$$('#t-main tbody tr')).length === 1 && /help/.test(await tp.textContent('#t-main tbody')) && /Asked \(1\)/.test(await tp.textContent('[data-tab="asked"]')), 'Asked inbox: the practice ask (1)');
    await shot(tp, 'T8_11_asked');
    await tp.click('[data-askopen="0"]'); await tp.waitForSelector('#scr-go.on #go-card .stem');
    check(/help/.test(await tp.textContent('#go-students')), 'Asked → Open: the question with that student');
    await tp.click('#go-back'); await tp.waitForSelector('[data-askres]');
    await tp.click('[data-askres]'); await tp.waitForFunction(() => !document.querySelector('[data-askres]'));
    check(/No open questions/.test(await tp.textContent('#t-main')), 'Resolve → inbox empty');
    check(E.errors.length === 0, 'no page errors (' + E.errors.length + ')');
  } catch (e) { console.log('  ✗ FAIL: exception ' + e.stack); check(false, 'no exception'); }
  await E.close();
  process.exit(summary() ? 1 : 0);
})();
