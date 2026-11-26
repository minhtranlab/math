// Browser (Chromium) on the real page + server code (mock Sheet, made-up FX1): sign in → home → 3 sample questions with
// instant ✓/✗ and 2 tries → answer shown + review list → Hint → teacher sign-in → Refresh. Screenshots → SHOTS.
const { setup, sleep, shot, login, check, summary } = require('./h');
(async () => {
  const E = await setup();
  try {
    const { page } = await E.newPage();
    console.log('student');
    await login(page, E.url, 'FX-TXX');
    await page.waitForSelector('#login-err:not(:empty)'); check(/not found/i.test(await page.textContent('#login-err')), 'wrong code → message');
    await shot(page, '01_sign_in');
    await page.fill('#login-code', 'fx-t01'); await page.click('#login-btn');
    await page.waitForSelector('#scr-home.on [data-start="path"]');
    check(/Hi Tess!/.test(await page.textContent('#home-hello')), 'home: Hi Tess!');
    check(/3 sample questions/.test(await page.textContent('#home-list')), 'home: 3 sample questions card');
    await shot(page, '02_home_sample');
    await page.click('[data-start="path"]');
    await page.waitForSelector('.ch');
    check(await page.$$eval('.ch', b => b.length) === 3, 'Q1: 3 choices, Check + Hint buttons'); await sleep(400);
    await shot(page, '03_q1_mcq');
    await page.click('.ch[data-l="A"]'); await page.click('#q-check');
    await page.waitForSelector('.fb.no'); check(/1 try left/.test(await page.textContent('#q-fb')), 'wrong → "Not quite — 1 try left" at once');
    check(await page.$eval('.ch[data-l="A"]', b => b.classList.contains('tried') && b.disabled), 'tried choice crossed out');
    await page.waitForFunction(() => /Saved/.test(document.querySelector('#q-sync').textContent));
    await shot(page, '04_q1_wrong_once');
    await page.click('.ch[data-l="B"]'); await page.click('#q-check');
    await page.waitForSelector('.fb.ok'); check(/Correct/.test(await page.textContent('#q-fb')), 'right → ✓ Correct');
    await page.waitForSelector('#q-next'); await sleep(300);
    await shot(page, '05_q1_correct');
    await page.click('#q-next');
    await page.waitForSelector('#q-num');
    check(/cm/.test(await page.textContent('.numrow')), 'Q2: number box + unit cm');
    await page.click('#q-hint'); await page.waitForSelector('.hint');
    check(/Made-up hint/.test(await page.textContent('.hint')), 'Hint shows');
    await shot(page, '06_q2_hint');
    await page.fill('#q-num', '8.66'); await page.press('#q-num', 'Enter');
    await page.waitForSelector('.fb.no');
    await page.waitForFunction(() => /Saved/.test(document.querySelector('#q-sync').textContent));
    await page.fill('#q-num', '9'); await page.click('#q-check');
    await page.waitForSelector('.fb.ans');
    const ans = await page.textContent('#q-fb');
    check(/Answer: 5\.00 cm/.test(ans) && /review list/.test(ans), '2nd wrong → "Answer: 5.00 cm" + added to review list');
    await page.waitForSelector('#q-next'); await sleep(300);
    await shot(page, '07_q2_wrong_twice');
    await page.click('#q-next'); await page.waitForSelector('#q-num');
    await page.fill('#q-num', '36.87°'); await page.click('#q-check');
    await page.waitForSelector('.fb.ok'); check(true, 'Q3: 36.87° accepted for a 1 d.p. answer');
    await page.click('[data-go="home"].btn');
    await page.waitForSelector('[data-start="review"]');
    check(/1 to review/.test(await page.textContent('#home-list')), 'home: review list 1');
    await shot(page, '08_home_review');
    const att = E.st.gas.table('Attempts'), tries = E.st.gas.table('Tries');
    check(att.length === 3 && att.every(a => a.status === 'done') && tries.length === 5, 'Sheet: 3 attempts done, 5 tries stored');
    check(tries.every(t => t.client_said === t.correct), 'every instant ✓/✗ = the server re-grade (' + tries.length + ' tries)');
    check(!E.st.rpcLog.some(r => /"key"|accepted|mistake_type/.test(r.res)), 'no key / mistake type in any server→browser payload (' + E.st.rpcLog.length + ' calls)');

    console.log('phone');
    const ph = (await E.newPage('phone')).page;
    await login(ph, E.url, 'FX-T03'); await ph.waitForSelector('#scr-home.on .row');
    await shot(ph, '09_phone_home_path');

    console.log('teacher');
    const tp = (await E.newPage()).page;
    await login(tp, E.url, 'TEACH-FX-9');
    await tp.waitForSelector('#t-refresh');
    check(/Tess Test/.test(await tp.textContent('#t-main')) && /Wrong twice/.test(await tp.textContent('#t-main')), 'teacher overview: students + wrong twice');
    await shot(tp, '10_teacher');
    const before = await tp.textContent('.stamp');
    await sleep(1100); await tp.click('#t-refresh'); await tp.waitForFunction(b => document.querySelector('.stamp') && document.querySelector('.stamp').textContent !== b, before);
    check(true, 'Refresh reloads (stamp changed)');
    check(E.st.rpcLog.filter(r => r.fn === 'teacherHome').slice(-1)[0].req.includes('true'), 'Refresh asks for a fresh read');
    check(E.errors.length === 0, 'no page errors (' + E.errors.length + ')');
  } catch (e) { console.log('  ✗ FAIL: exception ' + e.stack); check(false, 'no exception'); }
  await E.close();
  process.exit(summary() ? 1 : 0);
})();
