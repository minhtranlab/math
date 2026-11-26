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

/* ======================= Assign path (spec v0.2 §2.2) ======================= */
/** The skill-map tree with live counts: [{topic, name, skills:[{id, name, subs:[{id, name, n_live}]}]}]. */
function skillTree_() {
  var live = liveBySub_(), out = [], tIdx = {}, sIdx = {};
  dataRows_(TAB.SKILLS).filter(function (r) { return clean_(r.active || 'Yes') !== 'No' && clean_(r.subskill); })
    .sort(function (a, b) { return (Number(a.order) || 0) - (Number(b.order) || 0); })
    .forEach(function (r) {
      var t = clean_(r.topic), k = clean_(r.skill), u = clean_(r.subskill);
      if (!(t in tIdx)) { tIdx[t] = out.length; out.push({ topic: t, name: clean_(r.topic_name), skills: [] }); }
      var T = out[tIdx[t]];
      if (!(k in sIdx)) { sIdx[k] = { id: k, name: clean_(r.skill_name), subs: [] }; T.skills.push(sIdx[k]); }
      sIdx[k].subs.push({ id: u, name: clean_(r.subskill_name), n_live: live[u] || 0 });
    });
  return out;
}
function studentList_() {
  return dataRows_(TAB.STUDENTS).filter(function (s) { return clean_(s.student_code); })
    .map(function (s) { return { code: normCode_(s.student_code), name: String(s.name || s.student_code), active: isYes_(s.active) }; });
}
/** Browser call: everything the Assign path tab needs. */
function teacherPathData(code, fresh) {
  if (fresh) freshReads_(); else cachedReads_();
  requireTeacher_(code);
  var paths = {};
  studentList_().forEach(function (s) { paths[s.code] = pathSubskills_(s.code); });
  return { ok: true, read_at: fmtDate_(new Date(), 'HH:mm:ss'), students: studentList_(), tree: skillTree_(), paths: paths };
}
/** Browser call: save one student's ticks (sub-skill IDs). A fully ticked skill is stored as ONE skill row (new sub-skills
 *  of that skill join the path later); otherwise one row per sub-skill. Removed ticks: row kept, active = No. */
function teacherSetPath(code, student, subIds) {
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    freshReads_(); requireTeacher_(code);
    var c = normCode_(student);
    if (!findStudent_(c)) throw new Error('SESSION: Student not found.');
    var idx = skillIdx_(), want = {}, rows = [];
    (subIds || []).forEach(function (u) { u = String(u); if (idx.sub[u]) want[u] = 1; });
    var bySkill = {};
    Object.keys(idx.subOf).forEach(function (u) { if (clean_(dataFind_(TAB.SKILLS, function (r) { return clean_(r.subskill) === u; }).active || 'Yes') === 'No') return; (bySkill[idx.subOf[u]] = bySkill[idx.subOf[u]] || []).push(u); });
    Object.keys(bySkill).forEach(function (k) {
      var subs = bySkill[k], on = subs.filter(function (u) { return want[u]; });
      if (on.length && on.length === subs.length) rows.push({ type: 'skill', id: k });
      else on.forEach(function (u) { rows.push({ type: 'subskill', id: u }); });
    });
    var key = function (t, i) { return t + '|' + i; }, wantKey = {}; rows.forEach(function (r) { wantKey[key(r.type, r.id)] = 1; });
    var have = {}, off = 0, on2 = 0, add = [];
    dataFilter_(TAB.PATHS, function (r) { return normCode_(r.student_code) === c; }).forEach(function (r) {
      var k = key(clean_(r.target_type).toLowerCase() === 'skill' ? 'skill' : 'subskill', clean_(r.target_id)), active = clean_(r.active || 'Yes') !== 'No';
      if (wantKey[k]) { if (!active) { dataUpdate_(TAB.PATHS, r._row, { active: 'Yes', note: 'ticked again ' + nowIso_().slice(0, 10) }); on2++; } have[k] = 1; }
      else if (active) { dataUpdate_(TAB.PATHS, r._row, { active: 'No', note: 'unticked ' + nowIso_().slice(0, 10) }); off++; }
    });
    rows.forEach(function (r) { if (!have[key(r.type, r.id)]) add.push({ student_code: c, target_type: r.type, target_id: txt_(r.id), active: 'Yes', added_at: nowIso_(), added_by: 'teacher', note: '' }); });
    dataAppend_(TAB.PATHS, add);
    var subs = pathSubskills_(c);
    return { ok: true, student: c, path: subs, added: add.length, removed: off, back: on2 };
  } finally { lock.releaseLock(); }
}

/* ======================= Status grid (spec v0.2 §2.2) ======================= */
function cellOf_(c, u, onPath) {
  var p = progressOf_(c, u);
  return { on: onPath, status: p.status, level: p.level, steps: p.steps, need: p.need, solid: p.solid, n: p.n, right1: p.right1, wrong2: p.wrong2, hints: p.hints,
           override: p.override, last: p.last ? dateStr_(new Date(p.last)) : '' };
}
/** Browser call: students × the sub-skills of their paths (union, skill-map order). */
function teacherGrid(code, fresh) {
  if (fresh) freshReads_(); else cachedReads_();
  requireTeacher_(code);
  var idx = skillIdx_(), studs = studentList_().filter(function (s) { return s.active; }), union = {}, paths = {};
  studs.forEach(function (s) { paths[s.code] = {}; pathSubskills_(s.code).forEach(function (u) { paths[s.code][u] = 1; union[u] = 1; }); });
  var subs = Object.keys(union).sort(function (a, b) { return (idx.order[a] || 999) - (idx.order[b] || 999); })
    .map(function (u) { return { id: u, name: subskillName_(u), skill: skillName_(idx.subOf[u]) }; });
  var cells = {};
  studs.forEach(function (s) { subs.forEach(function (u) { var on = !!paths[s.code][u.id], cl = cellOf_(s.code, u.id, on); if (on || cl.n) cells[s.code + '|' + u.id] = cl; }); });
  return { ok: true, read_at: fmtDate_(new Date(), 'HH:mm:ss'), students: studs.filter(function (s) { return Object.keys(paths[s.code]).length; }), subs: subs, cells: cells };
}
/** Browser call: one student's answers for one sub-skill (newest first) + the cell. */
function teacherCell(code, student, sub, fresh) {
  if (fresh) freshReads_(); else cachedReads_();
  requireTeacher_(code);
  var c = normCode_(student), u = String(sub), st = findStudent_(c);
  if (!st) throw new Error('SESSION: Student not found.');
  var tries = {};
  dataFilter_(TAB.TRIES, function (t) { return normCode_(t.student_code) === c; }).forEach(function (t) { (tries[clean_(t.attempt_id)] = tries[clean_(t.attempt_id)] || []).push(t); });
  var rows = dataFilter_(TAB.ATTEMPTS, function (a) { return normCode_(a.student_code) === c && clean_(a.subskill) === u && clean_(a.status) === 'done'; })
    .sort(function (a, b) { return toMs_(b.finished_at) - toMs_(a.finished_at) || b._row - a._row; })
    .map(function (a) {
      var ts = (tries[clean_(a.attempt_id)] || []).sort(function (x, y) { return Number(x.try_no) - Number(y.try_no); });
      return { when: dateStr_(a.finished_at), qid: clean_(a.qid), difficulty: clean_(a.difficulty), level: clean_(a.level_at_start), result: clean_(a.result),
               answers: ts.map(function (t) { return { a: clean_(t.answer), ok: isYes_(t.correct), mt: clean_(t.mistake_type) }; }),
               hint: isYes_(a.hint_used), time: Number(a.time_try1_sec) || 0, pace: clean_(a.pace), step: a.step_credit === '' ? '' : Number(a.step_credit),
               counted: clean_(a.counted), away: Number(a.away_sec) >= (Number(getSettings_().away_flag_sec) || 20) ? Number(a.away_sec) : 0 };
    });
  var p = progressOf_(c, u);
  return { ok: true, student: { code: c, name: String(st.name || c) }, sub: { id: u, name: subskillName_(u) }, cell: cellOf_(c, u, pathSubskills_(c).indexOf(u) >= 0),
           history: p.hist, attempts: rows };
}
/** Browser call: teacher override — set_to E / M / H (steps 0) or SOLID. Logged in Level_Overrides; Skill_Status rewritten. */
function teacherSetLevel(code, student, sub, setTo) {
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    freshReads_(); requireTeacher_(code);
    var c = normCode_(student), u = String(sub), to = String(setTo || '').toUpperCase();
    if (!findStudent_(c) || !skillIdx_().sub[u] || !/^(E|M|H|SOLID)$/.test(to)) throw new Error('SESSION: Not a valid change.');
    dataAppend_(TAB.LEVEL_OVERRIDES, [{ student_code: c, subskill: txt_(u), set_to: to === 'SOLID' ? 'solid' : to, set_by: 'teacher', set_at: nowIso_(), note: '' }]);
    refreshStatus_(c, u);
    return teacherCell(code, c, u, true);
  } finally { lock.releaseLock(); }
}
