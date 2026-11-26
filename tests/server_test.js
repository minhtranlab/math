// Server (Apps Script mock + made-up FX1 library): update, skills seed (re-runnable), login, home, one question at a time,
// 2 tries, server re-grade, review list, hint log, step credit, path expansion, teacher overview, no key in payloads.
const { makeGas, TEACHER } = require('./server');
let F = 0, P = 0;
function check(c, m) { if (c) { P++; console.log('  ✓ ' + m); } else { F++; console.log('  ✗ FAIL: ' + m); } }
function dec(hex, salt) { let t = ''; for (let i = 0; i < hex.length / 2; i++) t += String.fromCharCode((parseInt(hex.substr(2 * i, 2), 16) ^ salt.charCodeAt(i % salt.length) ^ (37 + i * 11) % 251) & 255); return JSON.parse(decodeURIComponent(escape(t))); }

const g = makeGas();
const call = (fn, ...a) => { g.fresh(); return g.call(fn, a); };
const T = n => g.table(n);

console.log('update');
const tabs = ['Level_Overrides', 'README', 'Settings', 'Students', 'Classes', 'Skills', 'Paths', 'Skill_Status', 'Attempts', 'Tries', 'Hints', 'Review', 'Questions', 'Batches', 'Item_Overrides', 'Time_Norms', 'Dictionary'];
check(tabs.every(t => g.order.map(k => g.sheets[k].name).includes(t)), 'all 17 tabs exist (' + tabs.length + ')');
check(T('Skills').length === 37, 'Skills seeded from the skill map: ' + T('Skills').length + ' sub-skills');
check(T('Skills').every(r => /^(PYTH|TRIG)\.[A-Z0-9]+\.[A-Z0-9_]+$/.test(r.subskill)), 'sub-skill IDs look like TRIG.RT.SIDE_NUM');
check(T('Time_Norms').length === 6, 'Time_Norms: 6 default rows');
const qs = T('Questions');
check(qs.length === 7 && qs.filter(q => q.status === 'live').length === 6 && qs.find(q => q.qid === 'FX-004').status === 'hold', 'library: 7 questions, 6 live, draft-hint item on hold');
check(T('Batches')[0].live === 'Yes', 'fixture batch live from the start (live_default)');
check(/all good/.test(g.ctx.checkSheet_()), 'checkSheet: ' + g.ctx.checkSheet_());
// re-run: idempotent + a sub-skill that leaves the map stays as active = No
g.ctx.SKILLMAP_.rows = g.ctx.SKILLMAP_.rows.filter(r => r.subskill !== 'TRIG.GR.TRANSF');
g.fresh(); g.ctx.APP_BUILD = 'b2'; const r2 = g.admin('doUpdate');
check(/done/.test(r2.status), 'second update runs: ' + r2.status);
const sk = T('Skills');
check(sk.length === 37 && sk.find(r => r.subskill === 'TRIG.GR.TRANSF').active === 'No', 'seed re-run: 37 rows, removed ID kept with active = No');
check(T('Questions').length === 7 && T('Time_Norms').length === 6, 'update twice: no duplicate rows');
check(T('Settings').filter(r => r.key === 'max_tries').length === 1, 'Settings rows not doubled');

console.log('login');
check(call('login', 'fx-t01', 'dev1', true).ok === true, 'student code works (any case)');
check(call('login', 'FX-T02', 'dev1').ok === false, 'locked student refused');
check(/not found/.test(call('login', 'NOPE', 'dev1').msg), 'wrong code refused');
check(call('login', TEACHER, 'dev1').teacher === true, 'teacher code → teacher');
let thrown = ''; try { call('teacherHome', 'FX-T01'); } catch (e) { thrown = e.message; } check(/^LOGIN/.test(thrown), 'student code cannot open the teacher view');

console.log('home + one question (sample: no path)');
const h = call('homeData', 'FX-T01');
check(h.path.length === 0 && h.sample_n === 6 && h.review.length === 0, 'no path → 6 sample questions, empty review list');
const q1 = call('nextQuestion', 'FX-T01', {});
check(q1.ok && q1.q.qid === 'FX-001' && q1.max_tries === 2, 'first question: FX-001 (skill-map order), 2 tries');
const pay = JSON.stringify(q1);
check(!/"key"|accepted|mistake_type|wrong_answers|hint_html":"<|tags|"round"/.test(pay), 'payload has no key / accepted / mistake types / tags / hint text');
const spec = dec(q1.k, q1.attempt_id + '|' + q1.q.qid);
check(spec.t === 'mcq' && spec.k[0] === 'B', 'encoded key of the ONE open question decodes to its answer spec');
check(call('nextQuestion', 'FX-T01', {}).attempt_id === q1.attempt_id, 'reload: the open attempt comes back (no new row)');
check(T('Attempts').length === 1, 'one Attempts row');
let t = call('submitTry', 'FX-T01', q1.attempt_id, 'A', 12, false);
check(t.ok && !t.correct && !t.finished && t.tries_left === 1 && !t.mismatch, 'try 1 wrong → 1 try left');
check(T('Tries')[0].mistake_type === 'opp_adj_swapped', 'wrong choice stored with its mistake type');
t = call('submitTry', 'FX-T01', q1.attempt_id, 'B', 9, true);
check(t.correct && t.finished && t.result === 'right_2' && t.step_credit === 0, 'try 2 right → right_2, step 0 (stay)');
check(call('submitTry', 'FX-T01', q1.attempt_id, 'B', 3, true).finished === true && T('Tries').length === 2, 'a 3rd try is refused');

const q2 = call('nextQuestion', 'FX-T01', { subskill: 'TRIG.RT.SIDE_NUM' });
check(q2.q.qid === 'FX-002' && q2.q.type === 'num' && q2.q.unit === 'cm', 'next: FX-002 numeric, unit cm');
const hint = call('useHint', 'FX-T01', q2.attempt_id);
check(hint.ok && /Made-up hint/.test(hint.hint_html) && T('Hints').length === 1, 'Hint: text returned + logged in Hints');
t = call('submitTry', 'FX-T01', q2.attempt_id, '5.000 cm', 20, true);
const a2 = T('Attempts').find(r => r.attempt_id === q2.attempt_id);
check(t.correct && t.result === 'right_1' && t.step_credit === 1 && a2.hint_used === 'Yes' && a2.pace === 'in_time', 'right on try 1 in time → step 1 (hint used, step unchanged)');

const q3 = call('nextQuestion', 'FX-T01', { subskill: 'TRIG.RT.ANGLE' });
check(q3.q.qid === 'FX-003', 'next: FX-003');
t = call('submitTry', 'FX-T01', q3.attempt_id, '53.1', 30, false);
check(!t.correct && T('Tries').slice(-1)[0].mistake_type === 'ratio_upside_down', 'numeric wrong value tagged ratio_upside_down');
t = call('submitTry', 'FX-T01', q3.attempt_id, '36', 30, true);
check(!t.correct && t.mismatch === true, 'browser said right, server says wrong → mismatch flagged, server wins');
check(t.finished && t.result === 'wrong_2' && t.answer.html === '36.9°' && t.review_added, 'wrong twice → answer shown (36.9°) + review list');
check(T('Review').length === 1 && T('Review')[0].status === 'open', 'Review row open');
check(call('homeData', 'FX-T01').review.length === 1, 'home shows 1 to review');

console.log('review');
const rq = call('nextQuestion', 'FX-T01', { review: true });
check(rq.q.qid === 'FX-003', 'review serves the wrong-twice item');
t = call('submitTry', 'FX-T01', rq.attempt_id, '36.87', 200, true);
check(t.correct && t.review_cleared && t.step_credit === 0.5, 'right on try 1 but slow (200 s > 180) → ½ step, review cleared');
check(T('Review')[0].status === 'cleared' && call('homeData', 'FX-T01').review.length === 0, 'review list empty again');

console.log('path');
const hp = call('homeData', 'FX-T03');
check(hp.path.length === 11, 'skill tick TRIG.RT (10) + sub-skill TRIG.BR.READ = 11 sub-skills on the path: ' + hp.path.length);
check(hp.path[0].id === 'TRIG.RT.LABEL' && hp.path.find(p => p.id === 'TRIG.RT.LABEL').n_live === 4 && hp.next === 'TRIG.RT.LABEL', 'skill-map order; live counts; next = first not-solid sub-skill');
const ps = call('nextQuestion', 'FX-T03', { subskill: 'TRIG.RT.ANGLE' });
check(ps.q.qid === 'FX-003' && ps.scope === 'sub:TRIG.RT.ANGLE', 'Practise one sub-skill → its item');
check(call('nextQuestion', 'FX-T03', { subskill: 'TRIG.BR.READ' }).empty === true, 'sub-skill without questions → empty message');
let e = ''; try { call('submitTry', 'FX-T01', ps.attempt_id, '1', 1); } catch (x) { e = x.message; }
check(/^SESSION/.test(e), "another student's attempt is refused");

console.log('teacher');
const th = call('teacherHome', TEACHER, true);
check(th.students.length === 3 && th.recent.length === 4 && th.wrong2.length === 0 && th.hints.length === 1, 'overview: 3 students, 4 answers, 0 open wrong-twice, 1 hint row');
check(th.students.find(s => s.code === 'FX-T01').done === 4 && th.students.find(s => s.code === 'FX-T03').path_n === 2, 'per-student counts + path ticks');
check(!/"key"|accepted/.test(JSON.stringify(th)), 'teacher overview has no keys either');

console.log(`\nserver_test: ${P} passed, ${F} failed`);
process.exit(F ? 1 : 0);
