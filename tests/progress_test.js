// #7 path practice rules: replay (steps, levels, never down, lower items give no credit, Solid stays, overrides), gains,
// picking by level (never the same twice in a row), home "next" = first not-solid sub-skill, assign path, status grid,
// teacher override, My skills, time to the final answer + silent away log. Apps Script mock + made-up FX1.
const { makeGas, TEACHER } = require('./server');
let F = 0, P = 0;
function check(c, m) { if (c) { P++; console.log('  ✓ ' + m); } else { F++; console.log('  ✗ FAIL: ' + m); } }
const g = makeGas(), X = g.ctx;
const call = (fn, ...a) => { g.fresh(); return g.call(fn, a); };
const T = n => g.table(n);
const DAY = 86400000, iso = ms => X.fmtDate_(new Date(ms), 'yyyy-MM-dd HH:mm:ss');
const now = Date.now();

console.log('replay rules (synthetic attempts, FX-T01 × TRIG.RT.SIDE_NUM)');
let n = 0;
function att(daysAgo, diff, credit, extra) {
  const t = now - daysAgo * DAY + (n++) * 1000;
  X.dataAppend_(X.TAB.ATTEMPTS, [Object.assign({ attempt_id: 'AX' + n, student_code: 'FX-T01', kind: 'practice', qid: 'FX-002', subskill: 'TRIG.RT.SIDE_NUM', difficulty: diff,
    status: 'done', finished_at: iso(t), try1_correct: credit > 0 ? 'Yes' : 'No', result: credit > 0 ? 'right_1' : 'wrong_2', step_credit: credit }, extra || {})]);
}
function ov(daysAgo, to) { X.dataAppend_(X.TAB.LEVEL_OVERRIDES, [{ student_code: 'FX-T01', subskill: 'TRIG.RT.SIDE_NUM', set_to: to, set_by: 'teacher', set_at: iso(now - daysAgo * DAY + (n++) * 1000) }]); }
const P1 = () => { g.fresh(); return X.progressOf_('FX-T01', 'TRIG.RT.SIDE_NUM'); };
check(P1().status === 'not started' && P1().level === 'E' && P1().position === 0, 'no answers → not started, E, position 0');
att(10, 'E', 1); att(10, 'E', 1); att(9, 'E', 0.5);
check(P1().level === 'E' && P1().steps === 2.5 && P1().position === 2.5, 'E: 1 + 1 + ½ (slow) = 2.5 steps, still E');
att(8, 'E', 1);
check(P1().level === 'M' && P1().steps === 0 && /E→M/.test(P1().hist.join()), '3 steps at E → M (steps 0, history "E→M")');
att(2, 'E', 1);
check(P1().level === 'M' && P1().steps === 0, 'an EASY item at level M gives no credit');
att(1, 'M', 1); att(1, 'H', 1); att(1, 'M', 0, { result: 'wrong_2' }); att(1, 'M', 0, { result: 'right_2', try1_correct: 'No' });
let p = P1();
check(p.level === 'M' && p.steps === 2 && p.wrong2 === 1, 'M item 1 + H item 1 (harder counts) + wrong twice 0 + 2nd try 0 = M 2 — never down');
check(p.position === 5, 'position = 3 × level + steps = 5');
g.fresh(); const wk = X.progressOf_('FX-T01', 'TRIG.RT.SIDE_NUM', new Date(X.fmtDate_(new Date(now - 7 * DAY), 'yyyy-MM-dd') + 'T23:59:59+07:00').getTime());
check(wk.position === 3 && wk.level === 'M', 'replay cut 7 days ago = M 0 (position 3) → gain this week = 2');
ov(0.5, 'H');
check(P1().level === 'H' && P1().steps === 0 && P1().override === 'H', 'teacher override "H" → H, steps 0');
att(0.4, 'H', 1); att(0.4, 'H', 1); att(0.4, 'H', 0.5);
check(!P1().solid && P1().steps === 2.5, 'H: 2.5 steps, not solid yet');
att(0.4, 'H', 1);
check(P1().solid && P1().position === 9 && P1().status === 'solid', '3 steps at H → Solid (position 9)');
att(0.3, 'H', 0, { result: 'wrong_2' });
check(P1().solid, 'Solid stays Solid after a wrong answer');
ov(0.2, 'M');
check(!P1().solid && P1().level === 'M', 'teacher override "M" after Solid → M again');
ov(0.1, 'solid');
check(P1().solid && P1().override === 'Solid', 'teacher override "solid" → Solid');

console.log('path practice (FX-T03: path = TRIG.RT skill + TRIG.BR.READ)');
const fast = { sec: 20, answer_sec: 12, away_n: 0, away_sec: 0 };
function answerRight(r, t) { const spec = r.q.type === 'mcq' ? ({ 'FX-001': 'B', 'FX-005': 'A', 'FX-006': 'C', 'FX-007': 'A' })[r.q.qid] : '5.00'; return call('submitTry', 'FX-T03', r.attempt_id, spec, t || fast, true); }
let h = call('homeData', 'FX-T03');
check(h.next === 'TRIG.RT.LABEL' && h.skills.length === 2 && h.skills[0].n === 10 && h.skills[0].solid === 0, 'home: next = TRIG.RT.LABEL; skills "0 of 10 solid" + "0 of 1"');
const seen = [];
let r = call('nextQuestion', 'FX-T03', {});
check(r.scope === 'path' && /^FX-00[17]$/.test(r.q.qid), 'Practise (path) → LABEL at level E: an Easy item (' + r.q.qid + ')');
let t = answerRight(r); seen.push(r.q.qid);
check(t.progress && t.progress.level === 'E' && t.progress.steps === 1 && !t.progress.moved, 'right in time → E 1 of 3');
r = call('nextQuestion', 'FX-T03', {}); seen.push(r.q.qid);
check(r.q.qid !== seen[0] && /^FX-00[17]$/.test(r.q.qid), 'next: the other Easy item (never the same twice in a row)');
answerRight(r);
r = call('nextQuestion', 'FX-T03', {}); seen.push(r.q.qid);
check(r.q.qid !== seen[1], 'third pick is not the item just done (' + seen.join(' → ') + ')');
t = answerRight(r);
check(t.progress.moved === 'M' && t.progress.level === 'M' && t.progress.position === 3, '3rd right → "Level up: Medium" (position 3)');
const ss = T('Skill_Status').find(x => x.student_code === 'FX-T03' && x.subskill === 'TRIG.RT.LABEL');
check(ss && ss.level === 'M' && Number(ss.steps) === 0 && ss.status === 'practising' && /E→M/.test(ss.history), 'Skill_Status row written: M, 0 steps, practising, history');
r = call('nextQuestion', 'FX-T03', {});
check(r.q.qid === 'FX-005', 'at M → the Medium item FX-005');
t = answerRight(r, { sec: 150, answer_sec: 140, away_n: 1, away_sec: 25 });
const a5 = T('Attempts').find(x => x.attempt_id === r.attempt_id), tr5 = T('Tries').find(x => x.attempt_id === r.attempt_id);
check(t.progress.steps === 0.5 && a5.pace === 'slow' && a5.counted === 'Yes', 'right but slow (answer 140 s > 135 s MCQ Medium) → ½ step, counted');
check(Number(a5.time_try1_sec) === 140 && Number(tr5.time_answer_sec) === 140 && Number(tr5.time_sec) === 150, 'time = time to the FINAL answer (140 s), Check time kept (150 s)');
check(Number(a5.away_n) === 1 && Number(a5.away_sec) === 25 && !('away' in t), 'leaving the window logged silently (1 × 25 s), nothing in the student reply');
r = call('nextQuestion', 'FX-T03', {});
check(r.q.qid === 'FX-006', 'next: not FX-005 again → one level up (Hard FX-006, still counts)');
t = answerRight(r);
check(t.progress.steps === 1.5, 'Hard item right at level M → +1 (1.5)');
r = call('nextQuestion', 'FX-T03', {});
check(r.q.qid === 'FX-005', 'back to the Medium item');
let w = call('submitTry', 'FX-T03', r.attempt_id, 'B', fast, false); w = call('submitTry', 'FX-T03', r.attempt_id, 'B', fast, false);
check(w.result === 'wrong_2' && w.progress.steps === 1.5 && w.progress.level === 'M', 'wrong twice → stays M 1.5 (never down)');

console.log('teacher: grid, cell, override, assign path');
let grid = call('teacherGrid', TEACHER, true);
let cell = grid.cells['FX-T03|TRIG.RT.LABEL'];
check(grid.students.length === 1 && grid.subs.length === 11 && cell.level === 'M' && cell.steps === 1.5 && cell.wrong2 === 1 && cell.n === 6, 'grid: 1 student with a path × 11 sub-skills; LABEL = M 1.5/3, ✗1, 6 done');
check(grid.cells['FX-T03|TRIG.BR.READ'].status === 'not started', 'path sub-skill without answers = Not started');
let c = call('teacherCell', TEACHER, 'FX-T03', 'TRIG.RT.LABEL', true);
check(c.attempts.length === 6 && c.attempts[0].result === 'wrong_2' && c.attempts[0].answers.length === 2, "cell: that student's 6 answers, newest first, with each try");
check(c.attempts.find(x => x.qid === 'FX-005' && x.pace === 'slow').away === 25, 'cell shows a leave ≥ 20 s (25 s)');
c = call('teacherSetLevel', TEACHER, 'FX-T03', 'TRIG.RT.LABEL', 'SOLID');
check(c.cell.solid && T('Level_Overrides').length === 4, 'Set Solid → solid; logged in Level_Overrides');
h = call('homeData', 'FX-T03');
check(h.next === 'TRIG.RT.SIDE_NUM' && h.skills[0].solid === 1, 'home: LABEL solid → next = TRIG.RT.SIDE_NUM; "1 of 10 solid"');
r = call('nextQuestion', 'FX-T03', {});
check(r.q.qid === 'FX-002', 'Practise now serves SIDE_NUM');
let e = ''; try { call('teacherSetLevel', 'FX-T01', 'FX-T03', 'TRIG.RT.LABEL', 'E'); } catch (x) { e = x.message; }
check(/^LOGIN/.test(e), 'a student code cannot change levels');
const pathsBefore = T('Paths').length;
const all = X.SKILLMAP_.rows.filter(x => x.skill === 'TRIG.RT').map(x => x.subskill);
let sp = call('teacherSetPath', TEACHER, 'FX-T01', all);
check(sp.path.length === 10 && T('Paths').length === pathsBefore + 1 && T('Paths').slice(-1)[0].target_type === 'skill', 'tick a whole skill → ONE skill row (10 sub-skills)');
sp = call('teacherSetPath', TEACHER, 'FX-T01', all.slice(1).concat(['TRIG.BR.READ']));
const p01 = T('Paths').filter(x => x.student_code === 'FX-T01');
check(sp.path.length === 10 && p01.find(x => x.target_type === 'skill').active === 'No' && p01.filter(x => x.active === 'Yes').length === 10, 'untick one: skill row kept as active = No + 9 sub-skill rows + BR.READ');
sp = call('teacherSetPath', TEACHER, 'FX-T01', []);
check(sp.path.length === 0 && T('Paths').filter(x => x.student_code === 'FX-T01').every(x => x.active === 'No'), 'untick all: every row kept, active = No (never deleted)');
const pd = call('teacherPathData', TEACHER, true);
check(pd.tree[0].skills.length + pd.tree[1].skills.length === 8 && pd.paths['FX-T03'].length === 11, 'Assign path data: tree of 8 skills, FX-T03 has 11 ticks');

console.log('My skills');
const ms = call('mySkills', 'FX-T03');
const lab = ms.skills[0].subs.find(x => x.id === 'TRIG.RT.LABEL');
check(ms.n === 11 && ms.n_solid === 1 && ms.skills[0].solid === 1 && ms.skills[0].n === 10, 'My skills: 11 sub-skills, 1 solid, grouped by skill');
check(lab.position === 9 && lab.ft_n === 6 && lab.ft_pct === 83 && lab.gain === 9, 'LABEL: ladder 9 (Solid), first try 5/6 = 83 %, +9 this week');
check(!/"key"|accepted|FX-T01/.test(JSON.stringify(ms)), 'My skills payload: no keys, no other student');

console.log(`\nprogress_test: ${P} passed, ${F} failed`);
process.exit(F ? 1 : 0);
