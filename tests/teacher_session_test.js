// #9 v2 "Practise with teacher": assign scope (sub-skills, level, where to begin), home card, picking inside the scope
// (begin question first, one sub-skill at a time, at the higher of the teacher's level and the student's level), 3 tries,
// steps like Practice, Live shows the student's latest state only when read (Refresh), Assign next = exactly one question,
// typing goes to the cache (no Sheet write), close, rights. Apps Script mock + made-up FX1.
const { makeGas, TEACHER } = require('./server');
let F = 0, P = 0;
function check(c, m) { if (c) { P++; console.log('  ✓ ' + m); } else { F++; console.log('  ✗ FAIL: ' + m); } }
const g = makeGas();
const call = (fn, ...a) => { g.fresh(); return g.call(fn, a); };
const T = n => g.table(n);
const KEY = { 'FX-001': 'B', 'FX-005': 'A', 'FX-006': 'C', 'FX-007': 'A', 'FX-002': '5.00', 'FX-003': '36.9' };
const fast = { sec: 12, answer_sec: 8 };

console.log('assign');
check(T('Teacher_Sessions').length === 0, 'Teacher_Sessions tab created by the update');
let e = ''; try { call('tsStart', 'FX-T01', 'FX-T01', ['TRIG.RT.LABEL'], 'E', '', ''); } catch (x) { e = x.message; } check(/^LOGIN/.test(e), 'a student code cannot assign');
e = ''; try { call('tsStart', TEACHER, 'FX-T01', [], 'E', '', ''); } catch (x) { e = x.message; } check(/at least one/.test(e), 'no sub-skill ticked → refused');
e = ''; try { call('tsStart', TEACHER, 'FX-T01', ['TRIG.RT.LABEL'], 'E', '', 'FX-003'); } catch (x) { e = x.message; } check(/not live in these/.test(e), 'first question outside the ticked sub-skills → refused');
let H = call('tsStart', TEACHER, 'FX-T01', ['TRIG.RT.ANGLE', 'TRIG.RT.LABEL', 'TRIG.RT.SIDE_NUM'], 'E', 'TRIG.RT.SIDE_NUM', '');
const o = H.students.find(s => s.code === 'FX-T01').open;
check(o && o.subs.map(x => x.id).join() === 'TRIG.RT.SIDE_NUM,TRIG.RT.ANGLE,TRIG.RT.LABEL', 'scope in skill-map order starting at "where to begin" (SIDE_NUM → ANGLE → LABEL)');
let home = call('homeData', 'FX-T01');
check(home.teacher_open && home.teacher_open.n === 3 && home.teacher_open.next_name.startsWith('Find a side'), 'student home: "Practise with teacher" card (3 sub-skills, next = Find a side…)');
check(!call('homeData', 'FX-T03').teacher_open, 'other students: no card');

console.log('practise inside the scope');
const sid = o.session_id;
let q = call('nextQuestion', 'FX-T01', { teacher: sid });
check(q.ok && q.q.qid === 'FX-002' && q.scope === 'teacher:' + sid && q.max_tries === 3, 'first question: SIDE_NUM (where to begin), 3 tries');
check(T('Attempts').slice(-1)[0].kind === 'teacher' && T('Attempts').slice(-1)[0].session_id === sid, 'Attempts row: kind teacher + session id');
check(call('nextQuestion', 'FX-T01', { teacher: sid }).attempt_id === q.attempt_id, 'reload → the same open question');
const before = T('Attempts').length + T('Tries').length + T('Teacher_Sessions').length;
check(call('liveTyping', 'FX-T01', q.attempt_id, '5.0').ok && T('Attempts').length + T('Tries').length + T('Teacher_Sessions').length === before, 'typing → cache only (no Sheet write)');
let L = call('tsLive', TEACHER, 'FX-T01');
check(L.current.q.qid === 'FX-002' && L.current.typed === '5.0' && L.current.tries.length === 0 && L.current.answer.html === '5.00 cm', 'Live: same question, typed "5.0", 0 tries, key for the teacher');
let r = call('submitTry', 'FX-T01', q.attempt_id, '8.66', fast, false); r = call('submitTry', 'FX-T01', q.attempt_id, '9', fast, false);
check(!r.finished && r.tries_left === 1, '2 wrong → still 1 try left (3 tries)');
call('liveTyping', 'FX-T01', q.attempt_id, '5');
check(call('tsLive', TEACHER, 'FX-T01').current.tries.length === 2 && call('tsLive', TEACHER, 'FX-T01').current.typed === '5', 'Refresh → the latest state: 2 wrong tries, now typing "5"');
r = call('submitTry', 'FX-T01', q.attempt_id, '5', fast, true);
check(r.correct && r.result === 'right_2' && r.step_credit === 0, 'right on the 3rd try → right later, step 0 (like Practice)');
L = call('tsLive', TEACHER, 'FX-T01');
check(L.current.status === 'done' && L.current.typed === '' && L.current.tries.length === 3, 'Live after the answer: done, 3 tries, nothing typed');

console.log('Assign next (one question), then the app again');
const cand = call('tsCandidates', TEACHER, 'FX-T01', 'TRIG.RT.LABEL', 'H');
check(cand.items.length === 1 && cand.items[0].qid === 'FX-006' && /hypotenuse/.test(cand.items[0].preview), 'candidates for LABEL · H: FX-006 with a text preview');
L = call('tsAssignNext', TEACHER, 'FX-T01', 'FX-006');
check(L.session.next_qid === 'FX-006', 'Assign next stored (FX-006)');
q = call('nextQuestion', 'FX-T01', { teacher: sid });
check(q.q.qid === 'FX-006' && T('Teacher_Sessions')[0].next_qid === '', 'next question = the assigned one, then Assign next is used up');
r = call('submitTry', 'FX-T01', q.attempt_id, 'C', fast, true);
check(r.correct && r.step_credit === 1 && r.progress && r.progress.level === 'E' && r.progress.steps === 1, 'right 1st try on the assigned H item (LABEL, student at E) → LABEL E 1 of 3');
q = call('nextQuestion', 'FX-T01', { teacher: sid });
check(q.q.qid === 'FX-002', 'after it the app picks again: back to SIDE_NUM (first not-solid sub-skill in the scope)');
r = call('submitTry', 'FX-T01', q.attempt_id, '5.00', fast, true);
check(r.correct && r.step_credit === 1 && r.progress.steps === 1, 'right 1st try in time → step 1 (counts like Practice)');
e = ''; try { call('tsAssignNext', TEACHER, 'FX-T01', 'FX-004'); } catch (x) { e = x.message; } check(/not live/.test(e), 'Assign next refuses a question that is not live (hint on hold)');

console.log('level + begin question');
H = call('tsStart', TEACHER, 'FX-T03', ['TRIG.RT.LABEL'], 'M', '', '');
const sid3 = H.students.find(s => s.code === 'FX-T03').open.session_id;
q = call('nextQuestion', 'FX-T03', { teacher: sid3 });
check(q.q.qid === 'FX-005', 'start level M → the Medium LABEL item first (student is at E)');
call('submitTry', 'FX-T03', q.attempt_id, 'A', fast, true);
H = call('tsStart', TEACHER, 'FX-T03', ['TRIG.RT.LABEL', 'TRIG.RT.ANGLE'], 'E', '', 'FX-001');
check(T('Teacher_Sessions').filter(x => x.student_code === 'FX-T03' && x.status === 'open').length === 1 && T('Teacher_Sessions').find(x => x.session_id === sid3).status === 'closed', 'a new assignment closes the old one (one open per student)');
const sid3b = H.students.find(s => s.code === 'FX-T03').open.session_id;
check(H.students.find(s => s.code === 'FX-T03').open.begin_sub === 'TRIG.RT.LABEL', 'first question given → begin sub-skill = its sub-skill');
q = call('nextQuestion', 'FX-T03', { teacher: sid3b });
check(q.q.qid === 'FX-001', 'first question = the chosen FX-001');
call('submitTry', 'FX-T03', q.attempt_id, 'B', fast, true);
q = call('nextQuestion', 'FX-T03', { teacher: sid3b });
check(q.q.qid === 'FX-007', 'the begin question is used once → the app picks the unseen Easy item FX-007');
call('submitTry', 'FX-T03', q.attempt_id, 'A', fast, true);
let L3 = call('tsAssignNext', TEACHER, 'FX-T03', 'FX-002');
check(L3.session.next_qid === 'FX-002', 'Assign next can take a question from another sub-skill (SIDE_NUM, not in this practice)');
q = call('nextQuestion', 'FX-T03', { teacher: sid3b });
check(q.q.qid === 'FX-002' && T('Attempts').slice(-1)[0].session_id === sid3b, 'served once inside the practice (session id kept)');
call('submitTry', 'FX-T03', q.attempt_id, '5.00', fast, true);
q = call('nextQuestion', 'FX-T03', { teacher: sid3b });
check(['TRIG.RT.LABEL', 'TRIG.RT.ANGLE'].indexOf(T('Attempts').slice(-1)[0].subskill) >= 0, 'then the app picks inside the scope again (' + q.q.qid + ')');
let n0 = call('nextQuestion', 'FX-T03', { teacher: sid });
check(!n0.ok && /closed/.test(n0.msg), "a student cannot open someone else's / an old assignment");

console.log('close + rights');
H = call('tsClose', TEACHER, sid);
check(!call('homeData', 'FX-T01').teacher_open && H.students.find(s => s.code === 'FX-T01').open === null, 'close → card gone');
const nq = call('nextQuestion', 'FX-T01', { teacher: sid });
check(!nq.ok && /closed/.test(nq.msg), 'closed → "Your teacher has closed this practice."');
e = ''; try { call('tsLive', 'FX-T03', 'FX-T01'); } catch (x) { e = x.message; } check(/^LOGIN/.test(e), 'students cannot open Live');
e = ''; try { call('liveTyping', 'FX-T03', T('Attempts').find(a => a.student_code === 'FX-T01').attempt_id, 'x'); } catch (x) { e = x.message; } check(/^SESSION/.test(e), "a student cannot type into another student's question");
check(!/"key"|accepted|mistake_type/.test(JSON.stringify(call('nextQuestion', 'FX-T03', { teacher: sid3b }))), 'student payload: no key / mistake types');
const sp = call('homeData', 'FX-T01'); check(sp.path !== undefined, 'Practice still works after (home loads)');

console.log('#13: start at EXACTLY the teacher level, level up inside the assignment');
{
  const g2 = makeGas(), c2 = (fn, ...a) => { g2.fresh(); return g2.call(fn, a); }, T2 = n => g2.table(n);
  c2('teacherSetLevel', TEACHER, 'FX-T01', 'TRIG.RT.LABEL', 'M');
  const h2 = c2('tsStart', TEACHER, 'FX-T01', ['TRIG.RT.LABEL'], 'E', '', ''), s2 = h2.students.find(s => s.code === 'FX-T01').open.session_id;
  const seen = [];
  for (let i = 0; i < 3; i++) {
    const q2 = c2('nextQuestion', 'FX-T01', { teacher: s2 }); seen.push(q2.q.qid + ':' + T2('Attempts').slice(-1)[0].difficulty);
    c2('submitTry', 'FX-T01', q2.attempt_id, KEY[q2.q.qid], fast, true);
  }
  check(seen.every(x => /:E$/.test(x)), 'student at M, teacher chose Easy → Easy items (' + seen.join(' ') + ')');
  const q4 = c2('nextQuestion', 'FX-T01', { teacher: s2 });
  check(q4.q.qid === 'FX-005' && T2('Attempts').slice(-1)[0].difficulty === 'M', 'after 3 right in time at Easy → Medium inside the assignment (FX-005)');
  check(g2.ctx.progressOf_('FX-T01', 'TRIG.RT.LABEL').level === 'M' && g2.ctx.progressOf_('FX-T01', 'TRIG.RT.LABEL').steps === 0, 'mastery unchanged by the easier items (still M · 0 steps, like Practice)');
  const h3 = c2('tsStart', TEACHER, 'FX-T03', ['TRIG.RT.LABEL'], 'H', '', ''), s3 = h3.students.find(s => s.code === 'FX-T03').open.session_id;
  check(c2('nextQuestion', 'FX-T03', { teacher: s3 }).q.qid === 'FX-006', 'teacher chose Hard → the Hard item first (FX-006)');
}
{
  const { createGas } = require('./gas'); const { initialTabs, LIB_ID } = require('./server'); const path = require('path');
  const tabs = initialTabs(); tabs.Class_Sessions = [['session_id', 'title'], ['C1', 'old class']]; tabs.Class_Queue = [['session_id', 'qid'], ['C1', 'FX-001']];
  const g3 = createGas(require('./paths').APP, tabs, { libDir: path.join(__dirname, 'fixtures', 'library'), libId: LIB_ID });
  g3.ctx.console = { log() {}, warn() {}, error: console.error, info() {} };
  const u = g3.admin('doUpdate'), names = g3.ctx.SpreadsheetApp.openById('x').getSheets().map(x => x.getName());
  check(/done/.test(u.status) && names.includes('_old_Class_Sessions') && names.includes('_old_Class_Queue') && !names.includes('Class_Sessions') && g3.table('_old_Class_Sessions').length === 1 && g3.ctx.SpreadsheetApp.openById('x').getSheetByName('_old_Class_Sessions').isSheetHidden(),
        'old Class_* tabs renamed to _old_Class_… (rows kept), hidden; update done');
  check(!Object.keys(g3.ctx.SETTINGS_DEFAULTS_).includes('class_poll_sec'), 'class_poll_sec is not a Settings default');
}

console.log(`\nteacher_session_test: ${P} passed, ${F} failed`);
process.exit(F ? 1 : 0);
