// Browser (Chromium) on the real page + server code (mock Sheet, made-up FX1). #4 + #7 flow:
// sample question with 2 tries → teacher ticks a path (Assign path) → student practises the path: Easy ×3 → "Level up: Medium"
// → per-sub-skill Practise, Hint, wrong twice → answer + review → My skills ladder → teacher Status grid → cell → Set Solid
// → Overview Refresh. Screenshots → SHOTS.
const { setup, sleep, shot, login, check, summary } = require('./h');
const KEY = { 'FX-001': 'B', 'FX-005': 'A', 'FX-006': 'C', 'FX-007': 'A' };
(async () => {
  const E = await setup();
  try {
    const { page } = await E.newPage();
    console.log('student: sample');
    await login(page, E.url, 'FX-TXX');
    await page.waitForSelector('#login-err:not(:empty)'); check(/not found/i.test(await page.textContent('#login-err')), 'wrong code → message');
    await shot(page, '01_sign_in');
    await page.fill('#login-code', 'fx-t01'); await page.click('#login-btn');
    await page.waitForSelector('#scr-home.on [data-start="path"]');
    check(/Hi Tess!/.test(await page.textContent('#home-hello')) && /6 sample questions/.test(await page.textContent('#home-list')), 'home: Hi Tess! · 6 sample questions');
    await page.click('[data-start="path"]'); await page.waitForSelector('.ch');
    await page.click('.ch[data-l="A"]'); await page.click('#q-check');
    await page.waitForSelector('.fb.no'); check(/1 try left/.test(await page.textContent('#q-fb')), 'wrong → "Not quite — 1 try left" at once');
    await page.waitForFunction(() => /Saved/.test(document.querySelector('#q-sync').textContent));
    await shot(page, '02_q_wrong_once');
    await page.click('.ch[data-l="B"]'); await page.click('#q-check'); await page.waitForSelector('.fb.ok');
    await page.waitForFunction(() => /Saved/.test(document.querySelector('#q-sync').textContent));
    check(!(await page.$('#q-prog')), 'sample question: no progress line (not on a path yet)');

    console.log('teacher: Assign path');
    const tp = (await E.newPage()).page;
    await login(tp, E.url, 'TEACH-FX-9'); await tp.waitForSelector('#t-refresh');
    await tp.click('[data-tab="path"]'); await tp.waitForSelector('#t-tree');
    await tp.click('.pill:has-text("Tess Test")');
    await tp.check('input[data-skill="TRIG.RT"]');
    check(await tp.$$eval('input[data-of="TRIG.RT"]', xs => xs.every(x => x.checked)) && /10\/10/.test(await tp.textContent('[data-cnt="TRIG.RT"]')), 'tick the skill → all 10 sub-skills ticked');
    await tp.click('#t-save'); await tp.waitForFunction(() => /Saved/.test(document.querySelector('#t-saved').textContent));
    check(/Saved · 10 sub-skills/.test(await tp.textContent('#t-saved')), 'Save path → "Saved · 10 sub-skills"');
    await shot(tp, '03_teacher_assign_path');
    check(E.st.gas.table('Paths').filter(r => r.student_code === 'FX-T01').length === 1, 'Paths: one skill row');

    console.log('student: path practice');
    await page.click('[data-go="home"].btn'); await page.waitForSelector('#scr-home.on .row');
    check(/My path · 0 of 10 solid/.test(await page.textContent('#home-list')) && /Label hypotenuse/.test(await page.textContent('.card h3')), 'home: "My path · 0 of 10 solid", next = Label hypotenuse…');
    await shot(page, '04_home_path');
    await page.click('.card [data-start="path"]');
    for (let i = 0; i < 3; i++) {
      await page.waitForSelector('.ch'); await sleep(150);
      const qid = await page.evaluate(() => S.cur.q.qid);
      check(qid === 'FX-007' || qid === 'FX-001', `path Q${i + 1}: Easy item ${qid}`);
      await page.click(`.ch[data-l="${KEY[qid]}"]`); await page.click('#q-check');
      await page.waitForSelector('#q-prog');
      if (i < 2) { check(new RegExp('Easy · ' + (i + 1) + ' of 3').test(await page.textContent('#q-prog')), `progress line "Easy · ${i + 1} of 3"`); await page.click('#q-next'); }
    }
    check(/Level up: Medium/.test(await page.textContent('#q-prog')), '3rd right → "Level up: Medium"');
    await sleep(300); await shot(page, '05_level_up');
    await page.click('[data-go="home"].btn'); await page.waitForSelector('[data-start="sub"][data-id="TRIG.RT.SIDE_NUM"]');
    check(/Medium · 0\/3/.test(await page.textContent('#home-list')), 'home chip: Medium · 0/3');
    await page.click('[data-start="sub"][data-id="TRIG.RT.SIDE_NUM"]'); await page.waitForSelector('#q-num');
    await page.click('#q-hint'); await page.waitForSelector('.hint');
    await page.fill('#q-num', '8.66'); await page.press('#q-num', 'Enter'); await page.waitForSelector('.fb.no');
    await page.waitForFunction(() => /Saved/.test(document.querySelector('#q-sync').textContent));
    await page.fill('#q-num', '9'); await page.click('#q-check'); await page.waitForSelector('.fb.ans');
    await page.waitForSelector('#q-prog');
    check(/Answer: 5\.00 cm/.test(await page.textContent('#q-fb')) && /Easy · 0 of 3/.test(await page.textContent('#q-prog')), 'wrong twice → "Answer: 5.00 cm" + review; Easy · 0 of 3');
    await sleep(300); await shot(page, '06_wrong_twice_hint');
    await page.click('[data-go="home"].btn'); await page.waitForSelector('[data-go="skills"]');
    await page.click('.card [data-go="skills"]'); await page.waitForSelector('.lad');
    const lad = await page.$$eval('.row.ms', rs => rs.map(r => r.querySelectorAll('b.f').length));
    check(lad[0] === 3 && /of 10 solid/.test(await page.textContent('#ms-list')), 'My skills: LABEL ladder 3 blocks (Medium), "0 of 10 solid"');
    check(/\+3 this week/.test(await page.textContent('.tbar')), 'My skills: "+3 this week"');
    await shot(page, '07_my_skills');
    const tr = E.st.gas.table('Tries'), at = E.st.gas.table('Attempts');
    check(tr.every(t => t.client_said === t.correct) && tr.every(t => t.time_answer_sec !== ''), 'every instant ✓/✗ = server; every try has time to the final answer (' + tr.length + ')');
    check(!E.st.rpcLog.some(r => r.fn !== 'teacherCell' && /"key"|accepted|mistake_type/.test(r.res)), 'no key / mistake type in any student payload (' + E.st.rpcLog.length + ' calls)');

    console.log('teacher: Status grid');
    await tp.click('[data-tab="grid"]'); await tp.waitForSelector('table.grid');
    check(/M 0\/3/.test(await tp.textContent('table.grid')) && /Not started/.test(await tp.textContent('table.grid')), 'grid: LABEL "M 0/3", others Not started');
    await tp.click('[data-cell="FX-T01|TRIG.RT.LABEL"]'); await tp.waitForSelector('.panel table');
    check((await tp.$$('.panel tbody tr')).length === 4 && /E→M/.test(await tp.textContent('.panel')), 'cell → 4 answers + history "E→M"');
    await shot(tp, '08_teacher_grid_cell');
    await tp.click('[data-set="SOLID"]'); await tp.waitForFunction(() => /Solid/.test((document.querySelector('[data-cell="FX-T01|TRIG.RT.LABEL"]') || {}).textContent || ''));
    check(/set Solid/.test(await tp.textContent('.panel')), 'Set Solid → grid cell Solid, history "set Solid"');
    await shot(tp, '09_teacher_set_solid');
    await tp.click('[data-tab="overview"]'); await tp.waitForSelector('#t-refresh');
    const before = await tp.textContent('.stamp'); await sleep(1100); await tp.click('#t-refresh');
    await tp.waitForFunction(b => document.querySelector('.stamp') && document.querySelector('.stamp').textContent !== b, before);
    check(/Wrong twice/.test(await tp.textContent('#t-main')), 'Overview Refresh works');
    await shot(tp, '10_teacher_overview');

    console.log('phone');
    const ph = (await E.newPage('phone')).page;
    await login(ph, E.url, 'FX-T01'); await ph.waitForSelector('#scr-home.on .row');
    check(/1 of 10 solid/.test(await ph.textContent('#home-list')), 'phone home: "1 of 10 solid" after the override');
    await shot(ph, '11_phone_home');
    await ph.click('.card [data-go="skills"]'); await ph.waitForSelector('.lad'); await shot(ph, '12_phone_my_skills');
    check(E.errors.length === 0, 'no page errors (' + E.errors.length + ')');
  } catch (e) { console.log('  ✗ FAIL: exception ' + e.stack); check(false, 'no exception'); }
  await E.close();
  process.exit(summary() ? 1 : 0);
})();
