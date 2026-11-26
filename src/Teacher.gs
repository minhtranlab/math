/**
 * MSB — teacher calls (sign in with Settings.teacher_code on the same sign-in box). Skeleton (ticket #4): one overview with
 * a Refresh button: students, recent answers, wrong-twice list, hint use. Assign path + status grid = next ticket (spec §2.2);
 * until then a path is typed in the Paths tab (one row per ticked skill / sub-skill).
 */

/** Browser call. fresh = true (Refresh button): read the Sheet itself, not the snapshots. */
function teacherHome(code, fresh) {
  if (fresh) freshReads_(); else cachedReads_();
  requireTeacher_(code);
  var names = {}, studs = dataRows_(TAB.STUDENTS);
  studs.forEach(function (s) { names[normCode_(s.student_code)] = String(s.name || s.student_code); });
  var att = dataRows_(TAB.ATTEMPTS).filter(function (a) { return clean_(a.status) === 'done'; });
  var hints = dataRows_(TAB.HINTS), paths = dataRows_(TAB.PATHS);
  var students = studs.map(function (s) {
    var c = normCode_(s.student_code), mine = att.filter(function (a) { return normCode_(a.student_code) === c; });
    var lastMs = mine.reduce(function (m, a) { return Math.max(m, toMs_(a.finished_at)); }, 0);
    return { code: c, name: String(s.name || c), active: isYes_(s.active),
             path_n: paths.filter(function (p) { return normCode_(p.student_code) === c && clean_(p.active || 'Yes') !== 'No'; }).length,
             done: mine.length, right1: mine.filter(function (a) { return isYes_(a.try1_correct); }).length,
             wrong2: mine.filter(function (a) { return clean_(a.result) === 'wrong_2'; }).length,
             hints: hints.filter(function (h) { return normCode_(h.student_code) === c; }).length,
             last: lastMs ? dateStr_(new Date(lastMs)) : '' };
  });
  var recent = att.slice().sort(function (a, b) { return toMs_(b.finished_at) - toMs_(a.finished_at); }).slice(0, 30).map(function (a) {
    return { when: dateStr_(a.finished_at), student: names[normCode_(a.student_code)] || normCode_(a.student_code), subskill: subskillName_(clean_(a.subskill)),
             qid: clean_(a.qid), difficulty: clean_(a.difficulty), result: clean_(a.result), tries: Number(a.n_tries) || 0,
             hint: isYes_(a.hint_used), time: Number(a.time_try1_sec) || 0, pace: clean_(a.pace), step: a.step_credit === '' ? '' : Number(a.step_credit) };
  });
  var wrong2 = dataRows_(TAB.REVIEW).filter(function (r) { return clean_(r.status) === 'open'; }).map(function (r) {
    return { student: names[normCode_(r.student_code)] || normCode_(r.student_code), subskill: subskillName_(clean_(r.subskill)), qid: clean_(r.qid), added: dateStr_(r.added_at) };
  });
  var hintBy = {};
  hints.forEach(function (h) { var k = normCode_(h.student_code) + '|' + clean_(h.subskill); hintBy[k] = (hintBy[k] || 0) + 1; });
  var hintRows = Object.keys(hintBy).map(function (k) { var p = k.split('|'); return { student: names[p[0]] || p[0], subskill: subskillName_(p[1]), n: hintBy[k] }; })
    .sort(function (a, b) { return b.n - a.n; });
  return { ok: true, version: APP_VERSION, read_at: fmtDate_(new Date(), 'HH:mm:ss'), students: students, recent: recent, wrong2: wrong2, hints: hintRows,
           n_live: livePool_().length, n_subskills: Object.keys(skillIdx_().sub).length };
}
