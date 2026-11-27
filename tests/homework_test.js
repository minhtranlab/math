// #8 SAT-style assignments + teacher workflow (Apps Script mock + made-up FX1): builder tree + counts, Pick (spread over
// E/M/H, new first, neighbour fill, Swap queue), Publish to a student / a class, home card, Start / Continue, autosave
// (server cleans answers, one live copy), Submit = First Try (graded on the server), step credit like Practice, Review,
// Fix (MCQ 3 tries in total, typed unlimited, never the key), Best Score, Ask teacher (assignment + practice), inbox,
// resolve, Go over priority + practice answers, mistake tagging (types + skill-map tags, resolves the Ask, Review),
// History + read-only review, close / delete, rights.
const { createGas } = require('./gas');
const { initialTabs, LIB, LIB_ID, TEACHER } = require('./server');
let F = 0, P = 0;
function check(c, m) { if (c) { P++; console.log('  ✓ ' + m); } else { F++; console.log('  ✗ FAIL: ' + m); } }
const tabs = initialTabs(); tabs.Classes = [['class_id', 'name', 'student_codes', 'active', 'created_in', 'note'], ['C-TRIG', 'Trig group', 'FX-T01, FX-T03', 'Yes', 'sheet', '']];
const g = createGas(require('./paths').APP, tabs, { libDir: LIB, libId: LIB_ID });
g.ctx.console = { log() {}, warn() {}, error: console.error, info() {} };
if (!/done/.test(g.admin('doUpdate').status)) throw new Error('update failed');
const call = (fn, ...a) => { g.fresh(); return g.call(fn, a); };
const T = n => g.table(n);
const err = (fn, ...a) => { try { call(fn, ...a); return ''; } catch (x) { return x.message; } };
const KEY = { 'FX-001': 'B', 'FX-005': 'A', 'FX-006': 'C', 'FX-007': 'A', 'FX-002': '5.00', 'FX-003': '36.9' };
const LEAK = /"key"|accepted|mistake_type|mistake_auto|wrong_answers|"answer":\{|hint_html/;

console.log('builder + pick');
check(/^LOGIN/.test(err('hwBuilder', 'FX-T01', '')), 'a student code cannot open the builder');
let b = call('hwBuilder', TEACHER, 'st:FX-T01');
const lab = b.tree.flatMap(t => t.skills).flatMap(k => k.subs).find(u => u.id === 'TRIG.RT.LABEL');
check(lab.count.E === 2 && lab.count.M === 1 && lab.count.H === 1 && lab.count.fE === 2, 'tree: LABEL E 2 · M 1 · H 1 live, all new for FX-T01');
check(b.targets.classes.length === 1 && b.targets.students.some(s => s.id === 'st:FX-T03'), 'targets: students + the class "Trig group"');
let pk = call('hwPick', TEACHER, { target: 'st:FX-T01', topics: [{ code: 'TRIG.RT.LABEL', n: 3, diffs: 'E,M' }, { code: 'TRIG.RT.SIDE_NUM', n: 2, diffs: 'E' }] });
const t0 = pk.topics[0], t1 = pk.topics[1];
check(t0.picked.length === 3 && t0.picked.filter(x => x.difficulty === 'E').length === 2 && t0.picked.filter(x => x.difficulty === 'M').length === 1, 'LABEL n 3 over E+M → 2 E + 1 M');
check(t1.picked.length === 1 && /only 1 Easy available.*1 missing/.test(t1.notes.join()) , 'SIDE_NUM n 2 Easy: only 1 → note "only 1 Easy available … 1 missing"');
check(t0.queue.some(x => x.qid === 'FX-006') && t0.picked.every(x => x.status === 'new for all') && !LEAK.test(JSON.stringify(pk)), 'Swap queue has the Hard item; statuses "new for all"; no key in the pick');
check(/Tick Easy/.test(err('hwPick', TEACHER, { target: 'st:FX-T01', topics: [{ code: 'TRIG.RT.LABEL', n: 2, diffs: '' }] })), 'no difficulty ticked → refused');
const qids = t0.picked.map(x => x.qid).concat(t1.picked.map(x => x.qid));
let pub = call('hwPublish', TEACHER, { title: 'Labels HW', target: 'st:FX-T01', topics: [{ code: 'TRIG.RT.LABEL', n: 3, diffs: 'E,M' }], qids: qids.concat(['FX-004', 'NOPE']), due: '2099-01-01' });
const aid = pub.assignment_id;
check(pub.n === 4 && T('Assignments')[0].qids === qids.join(',') && T('Assignments')[0].status === 'published', 'Publish: 4 live questions frozen (hold / unknown dropped)');
check(/before/.test(err('hwPublish', TEACHER, { target: 'st:FX-T01', qids, available_from: '2099-02-01', due: '2099-01-01' })), 'due before "available from" → refused');

console.log('student: card, start, autosave, submit');
let home = call('homeData', 'FX-T01');
check(home.assigned.length === 1 && home.assigned[0].title === 'Labels HW' && home.assigned[0].answered === 0 && home.assigned[0].n === 4, 'home: "Labels HW" card (0 of 4)');
check(call('homeData', 'FX-T03').assigned.length === 0, 'other students: no card');
let set = call('hwStart', 'FX-T01', aid, 'dev1');
const sid = set.set_id;
check(set.questions.length === 4 && set.questions.every(q => !q.has_hint) && !LEAK.test(JSON.stringify(set)), 'Start: 4 questions, no hint, no key / tags in the payload');
const setB = call('hwStart', 'FX-T01', aid); set.copy = setB.copy;
check(setB.set_id === sid && T('Sets').length === 1, 'Start again = the same set (Continue); this window is now the live copy');
check(/not available/.test(err('hwStart', 'FX-T03', aid)), 'another student cannot start it');
const order = set.questions.map(q => q.qid);
const wrong = { 'FX-001': 'A', 'FX-007': 'B', 'FX-005': 'B', 'FX-002': '9' };
const ans = {}; order.forEach(q => { ans[q] = q === 'FX-007' ? KEY[q] : wrong[q]; });
let sv = call('hwSave', 'FX-T01', sid, { copy: set.copy, state: { ans: Object.assign({}, ans, { 'FX-001': 'Z', 'FX-999': 'A' }), cur: 2, t: { 'FX-007': 20 }, at: { 'FX-007': 12 } } });
let st = JSON.parse(T('Sets')[0].state_json);
check(sv.ok && st.ans['FX-001'] === undefined && st.ans['FX-999'] === undefined && st.cur === 2 && /answered/.test(T('Sets')[0].progress), 'autosave: invalid letter + foreign question dropped; progress text');
const set2 = call('hwGet', 'FX-T01', sid);
check(call('hwSave', 'FX-T01', sid, { copy: set.copy, state: { ans } }).other_copy === true, 'an older window stops saving ("open in another window")');
call('hwSave', 'FX-T01', sid, { copy: set2.copy, state: { ans, t: Object.fromEntries(order.map(q => [q, 15])), at: Object.fromEntries(order.map(q => [q, 10])) } });
check(call('homeData', 'FX-T01').assigned[0].answered === 4, 'home card: 4 of 4 answered');
check(call('askTeacher', 'FX-T01', { set_id: sid, qid: 'FX-001' }, true, 'Which side is opposite?').asked === true && T('Asks').length === 1, 'Ask teacher during the set (note saved)');
let res = call('hwSubmit', 'FX-T01', sid, { copy: set2.copy, state: { ans, t: Object.fromEntries(order.map(q => [q, 15])), at: Object.fromEntries(order.map(q => [q, 10])) } });
check(res.first_try === 1 && res.best === 1 && res.n === 4 && res.to_fix === 3, 'Submit: First Try 1/4 (graded on the server), 3 to fix');
check(!LEAK.test(JSON.stringify(res).replace(/"mistakes":\[[^\]]*\]/, '')), 'result: no key');
check(res.mistakes.some(m => m.tag === 'opp_adj_swapped' || m.n > 0) && res.subskills.length === 2, 'result: by sub-skill (2) + mistake types from the wrong answers');
check(T('Responses').length === 4 && T('Tries').filter(t => t.set_id === sid).length === 4, 'Responses 4 rows · Tries: 4 first tries with set_id');
const atts = T('Attempts').filter(a => a.kind === 'assignment');
check(atts.length === 4 && Number(atts.find(a => a.qid === 'FX-007').step_credit) === 1 && atts.find(a => a.qid === 'FX-007').result === 'right_1', 'step credit like Practice: FX-007 right in time = 1 step (Attempts kind assignment)');
check(g.ctx.progressOf_('FX-T01', 'TRIG.RT.LABEL').steps === 1, 'path progress: LABEL 1 step from the assignment');
check(T('Review').filter(r => r.reason === 'assignment' && r.status === 'open').length === 3, 'Review: the 3 wrong first tries');
check(call('hwSubmit', 'FX-T01', sid, {}).first_try === 1 && T('Responses').length === 4, 'Submit again = the stored result (no second grading)');
check(call('homeData', 'FX-T01').assigned.length === 0, 'home card gone after Submit');

console.log('fix wrong answers');
let fx = call('hwFix', 'FX-T01', sid);
check(fx.items.length === 3 && fx.items.every(o => o.status === 'open') && fx.fk && fx.fk.qid === fx.items[0].qid && !LEAK.test(JSON.stringify(fx.items)), 'Fix: 3 open items, encoded key of the first open one only, no plain key');
const spec = g.ctx.answerSpec_(g.ctx.libQuestion_(fx.fk.qid));
check(JSON.stringify(require('vm').runInNewContext('(' + decode.toString() + ')(k, s)', { k: fx.fk.k, s: sid + '|' + fx.fk.qid })) === JSON.stringify(spec), 'the encoded key decodes in the browser (salt set|qid)');
let r1 = call('hwFixTry', 'FX-T01', sid, 'FX-001', 'C', 8, false);
check(r1.correct === false && r1.tries_left === 1 && r1.status === 'open', 'MCQ fix: 2nd wrong (A then C) → 1 try left (3 in total)');
check(/already tried A/.test(call('hwFixTry', 'FX-T01', sid, 'FX-001', 'A', 3).msg), 'the same wrong letter again → "You already tried A."');
let r2 = call('hwFixTry', 'FX-T01', sid, 'FX-001', 'B', 5, true);
check(r2.correct && r2.status === 'fixed' && r2.best === 2 && !('answer' in r2), 'MCQ fix right → fixed, Best Score 2, no answer field');
check(T('Review').find(r => r.qid === 'FX-001').status === 'cleared', 'fixed → its Review row cleared ("still wrong after fixing" stays)');
check(/Choose one of the answers/.test(call('hwFixTry', 'FX-T01', sid, 'FX-005', 'C', 5).msg), 'a letter the question does not have → refused (not counted)');
for (const a of ['8', '7', '6', '4.9']) call('hwFixTry', 'FX-T01', sid, 'FX-002', a, 4);
let r4 = call('hwFixTry', 'FX-T01', sid, 'FX-002', '5', 4);
check(r4.correct && r4.n_tries === 6, 'typed answer: unlimited fixes (right on the 6th try)');
check(Number(T('Sets')[0].best_score) === 3 && T('Review').filter(r => r.status === 'open' && r.reason === 'assignment').map(r => r.qid).join() === 'FX-005', 'Best Score 3/4 · Review keeps only FX-005 (still wrong)');

console.log('history + review');
let h = call('hwHistory', 'FX-T01');
check(h.sets.length === 1 && h.sets[0].first_try === 1 && h.sets[0].best === 3 && h.sets[0].to_fix === 1, 'History: Labels HW · First Try 1 · Best 3 · 1 left to fix');
let rv = call('hwReview', 'FX-T01', sid);
check(rv.items.length === 4 && rv.items.find(o => o.qid === 'FX-005').status === 'wrong' && rv.items.find(o => o.qid === 'FX-001').status === 'fixed' && !LEAK.test(JSON.stringify(rv)), 'Open: read-only review (fixed / wrong / right), no key');
check(/not found/.test(err('hwReview', 'FX-T03', sid)), "a student cannot open another student's set");

console.log('practice ask + inbox + go over + tagging');
let q = call('nextQuestion', 'FX-T03', { subskill: 'TRIG.RT.LABEL' });
call('submitTry', 'FX-T03', q.attempt_id, 'Z', { sec: 5, answer_sec: 3 }, false); call('submitTry', 'FX-T03', q.attempt_id, 'Y', { sec: 5, answer_sec: 3 }, false);
check(call('askTeacher', 'FX-T03', { attempt_id: q.attempt_id }, true, 'lost').asked && T('Asks').length === 2, 'Ask teacher in Practice (wrong twice question)');
let ib = call('asksInbox', TEACHER, true);
check(ib.asks.length === 2 && ib.asks.some(a => a.where === 'Labels HW' && a.note === 'Which side is opposite?') && ib.asks.some(a => a.where === 'Practice'), 'Asked inbox: 2 open (assignment + practice) with notes');
let go = call('goOver', TEACHER, 'st:FX-T01', 'a:' + aid, true);
check(go.rows.length === 4 && go.rows[0].wrong1 === 1 && go.rows[go.rows.length - 1].qid === 'FX-007', 'Go over (assignment): wrong first, the right one last');
const r001 = go.rows.find(r => r.qid === 'FX-001');
check(r001.asks === 1 && r001.students[0].tries.map(t => t.a).join() === 'A,C,B' && r001.students[0].ask_note === 'Which side is opposite?', 'Go over row: each try (A, C, B) + the ask note');
check(go.rows[0].qid === 'FX-005' && go.rows[1].qid === 'FX-001', 'priority (one student): wrong first → still wrong (FX-005) before fixed → then asked (FX-001)');
let goAll = call('goOver', TEACHER, 'all', 'd7', true);
check(goAll.rows.some(r => r.students.some(s => s.where === 'Practice' && s.code === 'FX-T03')), 'date scope adds Practice answers (FX-T03 wrong twice)');
let gq = call('goQuestion', TEACHER, 'FX-001');
check(gq.answer.label === 'B' && gq.mistakes.types.length === 7 && gq.mistakes.tags.some(t => t.id === 'opp_adj_swapped'), 'question panel: key (teacher only) + 7 mistake types + the sub-skill tags');
check(/^LOGIN/.test(err('goQuestion', 'FX-T01', 'FX-001')), 'students cannot open the teacher question panel');
let tg = call('tagMistake', TEACHER, { set_id: sid, qid: 'FX-001' }, 'Misread A Detail', 'read X as Z');
check(tg.ask_resolved && T('Responses').find(r => r.qid === 'FX-001').mistake_type === 'Misread A Detail' && T('Asks').find(a => a.qid === 'FX-001').status === 'resolved', 'tag → stored + resolves the open Ask');
check(tg.review_added === true && T('Review').some(r => r.qid === 'FX-001' && r.reason === 'tagged' && r.status === 'open'), 'a real mistake → back in Review');
check(call('tagMistake', TEACHER, { set_id: sid, qid: 'FX-001' }, '', null, true).ask_reopened, 'Undo (clear + undo) reopens the Ask');
check(call('tagMistake', TEACHER, { attempt_id: q.attempt_id }, 'opp_adj_swapped').ok && T('Attempts').find(a => a.attempt_id === q.attempt_id).mistake_type_teacher === 'opp_adj_swapped', 'practice answer tagged with a skill-map tag');
check(/Unknown mistake/.test(err('tagMistake', TEACHER, { set_id: sid, qid: 'FX-002' }, 'Bad tag')), 'unknown mistake type → refused');
const before = call('asksInbox', TEACHER, true).asks;
ib = call('resolveAsk', TEACHER, before[0].ask_id);
check(before.length === 1 && ib.asks.length === 0, 'tagging the practice answer resolved its Ask; Resolve in the inbox → the last one gone');

console.log('class target, list, close, delete');
pk = call('hwPick', TEACHER, { target: 'C-TRIG', topics: [{ code: 'TRIG.RT.LABEL', n: 2, diffs: 'E' }] });
check(pk.topics[0].picked.every(x => x.status !== 'new for all') && pk.target.members === 2, 'class pick: items FX-T01 met are marked "met by Tess"');
const a2 = call('hwPublish', TEACHER, { title: 'Class HW', target: 'C-TRIG', qids: pk.topics[0].picked.map(x => x.qid) }).assignment_id;
check(call('homeData', 'FX-T03').assigned.length === 1 && call('homeData', 'FX-T01').assigned.length === 1, 'class assignment: card for both members');
let L = call('hwList', TEACHER, true);
check(L.current.length === 2 && L.current.find(a => a.assignment_id === aid).done === 1 && L.current.find(a => a.assignment_id === a2).students.length === 2, 'Assignments list: done 1/1 · class 0/2');
check(/close it instead/.test(err('hwSetStatus', TEACHER, aid, 'delete')), 'delete refused once started');
L = call('hwSetStatus', TEACHER, a2, 'close');
check(L.past.length === 1 && call('homeData', 'FX-T03').assigned.length === 0, 'Close → in Past, gone from the students\' home');
L = call('hwSetStatus', TEACHER, a2, 'delete');
check(L.past.length === 0 && T('Assignments').find(a => a.assignment_id === a2).status === 'deleted', 'Delete (not started) → row kept, status deleted');

console.log('MCQ lock (mcq_max_tries from Settings)');
const s3 = T('Settings').findIndex(r => r.key === 'mcq_max_tries'); g.ctx.dataUpdate_(g.ctx.TAB.SETTINGS, s3 + 2, { value: 2 }); g.ctx._settings = null;
const a3 = call('hwPublish', TEACHER, { title: 'Lock HW', target: 'st:FX-T03', qids: ['FX-001'] }).assignment_id;
const set3 = call('hwStart', 'FX-T03', a3);
call('hwSubmit', 'FX-T03', set3.set_id, { copy: set3.copy, state: { ans: { 'FX-001': 'A' } } });
let lk = call('hwFixTry', 'FX-T03', set3.set_id, 'FX-001', 'C', 4);
check(lk.status === 'locked' && lk.tries_left === 0 && !('answer' in lk), 'mcq_max_tries 2: 2nd wrong try → locked, the answer is never sent');
check(call('hwFixTry', 'FX-T03', set3.set_id, 'FX-001', 'B', 4).status === 'locked' && Number(T('Responses').filter(r => r.set_id === set3.set_id)[0].best_correct) === 0, 'locked: a later right letter is not accepted (Best stays)');
check(call('hwFix', 'FX-T03', set3.set_id).fk === null, 'locked item: no key sent for it');

console.log(`\nhomework_test: ${P} passed, ${F} failed`);
process.exit(F ? 1 : 0);

function decode(hex, salt) {
  var t = '', i; salt = String(salt || 'msb');
  for (i = 0; i < hex.length / 2; i++) t += String.fromCharCode((parseInt(hex.substr(2 * i, 2), 16) ^ salt.charCodeAt(i % salt.length) ^ (37 + i * 11) % 251) & 255);
  return JSON.parse(decodeURIComponent(escape(t)));
}
