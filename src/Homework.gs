/**
 * MSB — SAT-style assignments (ticket #8; BRAIN §5 #18–#19; copied in spirit from satmath @ db7dc1f: Teacher.gs
 * assignmentTree / pickAssignment / publishAssignment / assignmentsFor_, Code.gs getSet / autosave / submit / getFix /
 * checkTry / askTeacher; adapted to MSB IDs topic → skill → sub-skill and E/M/H).
 * Rules (SAT, exactly): a set of n questions, free navigation, autosave, Check Your Work → Submit; graded on Submit →
 * First Try; "Fix wrong answers": MCQ max `mcq_max_tries` (3) tries in total incl. the first, typed answers unlimited;
 * Best Score = right now. The correct answer is NEVER shown (no key in any student payload; the encoded key of ONE open
 * fix question only, for the instant ✓/✗ — obfuscation, the server re-grades). Items not right on the first try go to the
 * Review list; a fix clears that row (still wrong after fixing = stays). First tries also give path step credit: one
 * Attempts row per question (kind assignment), the same credit rule as Practice (Progress.gs replays it).
 *   Assignments  one row per published assignment (frozen qids)
 *   Sets         one row per student × assignment (state while working, First Try / Best Score)
 *   Responses    one row per question of a submitted set (first try, fixes, mistake tags)
 *   Tries        try 1 + every fix try (set_id filled, attempt_id empty)
 *   Asks         Ask teacher (assignments and practice) → teacher inbox / Go over
 */

/* =========================== shared =========================== */
function setRow_(setId) { return dataFind_(TAB.SETS, function (r) { return clean_(r.set_id) === String(setId); }); }
function asgRow_(aid) { return dataFind_(TAB.ASSIGNMENTS, function (r) { return clean_(r.assignment_id) === String(aid); }); }
function setQids_(s) { return clean_(s.qids).split(/[,\s]+/).map(function (x) { return x.trim(); }).filter(String); }
function codesOf_(v) { return String(v || '').split(/[,;\s]+/).map(normCode_).filter(String); }
function classRows_() { return dataRows_(TAB.CLASSES).filter(function (c) { return clean_(c.class_id) && clean_(c.active || 'Yes') !== 'No'; }); }
/** 'st:CODE' | '<class_id>' → {kind, id, title, members}. */
function resolveTarget_(target) {
  target = String(target || '');
  if (target.indexOf('st:') === 0) {
    var s = findStudent_(target.slice(3)); if (!s) throw new Error('SESSION: Student not found.');
    return { kind: 'student', id: normCode_(s.student_code), title: String(s.name || s.student_code), members: [normCode_(s.student_code)] };
  }
  var c = classRows_().filter(function (x) { return clean_(x.class_id) === target; })[0];
  if (!c) throw new Error('SESSION: Choose a student or a class.');
  return { kind: 'class', id: target, title: String(c.name || target), members: codesOf_(c.student_codes) };
}
function targetMembers_(a) {
  if (clean_(a.target_type) === 'student') return [normCode_(a.target_id)];
  var c = classRows_().filter(function (x) { return clean_(x.class_id) === clean_(a.target_id); })[0];
  return c ? codesOf_(c.student_codes) : [];
}
function hwTitle_(s) { var a = s && asgRow_(clean_(s.assignment_id)); return a ? String(a.title) : 'Assignment'; }
function fmtDay_(v) {
  if (!v) return '';
  if (Object.prototype.toString.call(v) === '[object Date]') return fmtDate_(v, 'yyyy-MM-dd');
  return clean_(v).slice(0, 10);
}
function dayStr_(ymd) { var d = new Date(ymd + 'T12:00:00+07:00'); return isNaN(d.getTime()) ? ymd : fmtDate_(d, 'EEE d MMM'); }
function today_() { return fmtDate_(new Date(), 'yyyy-MM-dd'); }
function parseState_(s) { try { return s.state_json ? JSON.parse(clean_(s.state_json)) : null; } catch (e) { return null; } }
function isSubmitted_(s) { return clean_(s.status) === 'submitted'; }
function mcqMax_() { return Math.max(1, Number(getSettings_().mcq_max_tries) || 3); }
function noteMax_() { return Math.max(20, Number(getSettings_().ask_note_max) || 200); }
function choiceLetters_(q) { var l = (q.choices || []).map(function (c) { return String(c.label).toUpperCase(); }); return l.length ? l : ['A', 'B', 'C', 'D']; }
/** The answer as stored: '' = blank, null = not a valid answer for this question. */
function cleanAnswer_(q, v) {
  if (!q) return null;
  if (v === null || v === undefined || v === '') return '';
  if (typeof v !== 'string' && typeof v !== 'number') return null;
  var s = String(v).trim().slice(0, 40);
  if (!s) return '';
  if ((q.type || 'mcq') !== 'mcq') return s;
  s = s.toUpperCase();
  return choiceLetters_(q).indexOf(s) >= 0 ? s : null;
}
/** A set question for the browser: whitelist (no key, no hint — assignments have no Hint, SAT rules). */
function setQuestion_(q, i) { var o = clientQuestion_(q); o.no = i + 1; o.has_hint = false; return o; }
function hwTries_(setId, qid) {
  return dataFilter_(TAB.TRIES, function (t) { return clean_(t.set_id) === String(setId) && (qid === undefined || clean_(t.qid) === String(qid)); })
    .sort(function (a, b) { return Number(a.try_no) - Number(b.try_no); });
}
function responsesOf_(setId) { return dataFilter_(TAB.RESPONSES, function (r) { return clean_(r.set_id) === String(setId); }).sort(function (a, b) { return Number(a.order) - Number(b.order); }); }
function requireSet_(code, setId) {
  var st = requireStudent_(code), s = setRow_(setId);
  if (!s || normCode_(s.student_code) !== normCode_(st.student_code)) throw new Error('SESSION: This set was not found.');
  return s;
}
function hwQ_(s) { return setQids_(s).map(function (qid) { return libQuestion_(qid); }).filter(Boolean); }

/* =========================== student =========================== */
/** Home cards: published, available from today, not yet submitted by this student (newest first). */
function hwCards_(code) {
  var c = normCode_(code), t = today_(), sets = dataFilter_(TAB.SETS, function (s) { return normCode_(s.student_code) === c; });
  return dataRows_(TAB.ASSIGNMENTS).filter(function (a) { return clean_(a.status) === 'published' && fmtDay_(a.available_from) <= t && targetMembers_(a).indexOf(c) >= 0; })
    .map(function (a) {
      var s = sets.filter(function (x) { return clean_(x.assignment_id) === clean_(a.assignment_id); })[0];
      if (s && isSubmitted_(s)) return null;
      var st = s ? parseState_(s) || {} : {}, ans = st.ans || {}, n = setQids_(a).length, due = fmtDay_(a.due);
      return { assignment_id: clean_(a.assignment_id), title: String(a.title), n: n, answered: Object.keys(ans).filter(function (k) { return ans[k] !== ''; }).length,
               started: !!s, due: due ? dayStr_(due) : '', late: !!due && due < t };
    }).filter(Boolean).reverse();
}

/** Browser call: Start / Continue an assignment → the set (questions, saved state, live-copy token). */
function hwStart(code, aid, device) {
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  var setId;
  try {
    freshReads_();
    var st = requireStudent_(code), c = normCode_(st.student_code), a = asgRow_(aid);
    if (!a || clean_(a.status) !== 'published' || targetMembers_(a).indexOf(c) < 0 || fmtDay_(a.available_from) > today_()) throw new Error('SESSION: This assignment is not available.');
    var have = dataFind_(TAB.SETS, function (s) { return normCode_(s.student_code) === c && clean_(s.assignment_id) === String(aid); });
    if (have) setId = clean_(have.set_id);
    else {
      setId = newId_('S');
      var q = setQids_(a);
      dataAppend_(TAB.SETS, [{ set_id: setId, student_code: c, kind: 'assignment', assignment_id: txt_(aid), n: q.length, qids: txt_(q.join(',')),
                                created_at: nowIso_(), status: 'in_progress', state_json: '', progress: '0/' + q.length + ' answered', last_saved_at: nowIso_() }]);
    }
  } finally { lock.releaseLock(); }
  return hwGet(code, setId, device);
}
/** Browser call: open (or reopen) a set. This window becomes the live copy (an older window stops saving). */
function hwGet(code, setId, device) {
  var copy = 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8), s, lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    freshReads_();
    s = requireSet_(code, setId);
    if (isSubmitted_(s)) return { ok: true, submitted: true, set_id: String(setId), result: hwResultView_(s) };
    var f = { copy_token: copy }; if (device) f.device = txt_(String(device).slice(0, 40));
    dataUpdate_(TAB.SETS, s._row, f);
  } finally { lock.releaseLock(); }
  var qs = hwQ_(s), S = getSettings_();
  if (!qs.length) throw new Error('SESSION: The questions of this set are not available. Ask your teacher.');
  return { ok: true, set_id: String(setId), title: hwTitle_(s), copy: copy, state: parseState_(s) || {}, questions: qs.map(setQuestion_),
           asks: asksFor_({ set_id: String(setId) }), autosave_sec: Number(S.autosave_sec) || 20, ask_note_max: noteMax_() };
}
/** Server check of what the browser sent: answers only for the set's questions (MCQ = one of its letters). */
function cleanState_(qs, st) {
  var by = {}; qs.forEach(function (q) { by[q.qid] = q; });
  var out = { ans: {}, cur: Math.max(0, Math.min(qs.length - 1, Number(st && st.cur) || 0)), t: {}, at: {} };
  Object.keys((st && st.ans) || {}).forEach(function (k) { var v = cleanAnswer_(by[k], st.ans[k]); if (v !== null && v !== '') out.ans[k] = v; });
  ['t', 'at'].forEach(function (x) { Object.keys((st && st[x]) || {}).forEach(function (k) { if (by[k]) out[x][k] = Math.max(0, Math.min(7200, Math.round(Number(st[x][k]) || 0))); }); });
  return out;
}
/** Browser call: autosave. payload {state: {ans, cur, t (seconds on each question), at (seconds to its last change)}, copy}. */
function hwSave(code, setId, payload) {
  payload = payload || {};
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    freshReads_();
    var s = requireSet_(code, setId);
    if (isSubmitted_(s)) return { ok: false, submitted: true };
    if (clean_(s.copy_token) && payload.copy && clean_(s.copy_token) !== String(payload.copy)) return { ok: false, other_copy: true, msg: 'This set is open in another window. Close this one.' };
    var qs = hwQ_(s), st = cleanState_(qs, payload.state), n = Object.keys(st.ans).length;
    dataUpdate_(TAB.SETS, s._row, { state_json: txt_(JSON.stringify(st)), progress: n + '/' + qs.length + ' answered', last_saved_at: nowIso_() });
    return { ok: true, answered: n, n: qs.length, saved_at: nowIso_().slice(11, 16) };
  } finally { lock.releaseLock(); }
}
/** Browser call: Submit. Graded here (first try). Idempotent: a second Submit returns the stored result. */
function hwSubmit(code, setId, payload) {
  payload = payload || {};
  var lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    freshReads_();
    var s = requireSet_(code, setId), c = normCode_(s.student_code);
    if (isSubmitted_(s)) return hwResultView_(s);
    if (clean_(s.copy_token) && payload.copy && clean_(s.copy_token) !== String(payload.copy)) return { ok: false, other_copy: true, msg: 'This set is open in another window. Close this one.' };
    var qs = hwQ_(s), st = cleanState_(qs, payload.state || parseState_(s) || {}), now = nowIso_(), resp = [], tries = [], atts = [], subs = {}, right = 0, blank = 0;
    qs.forEach(function (q, i) {
      var row = questionRow_(q.qid) || {}, sub = clean_(row.subskill) || clean_((q.tags || {}).subskill), diff = clean_(row.difficulty) || clean_((q.tags || {}).difficulty);
      var ans = st.ans[q.qid] || '', ok = ans ? msbGrade_(answerSpec_(q), ans) : false, tSec = st.t[q.qid] || 0, aSec = ans ? Math.min(tSec || 7200, st.at[q.qid] || tSec) : tSec;
      var slowAt = slowAbove_(diff, q.type), slow = aSec > slowAt, credit = ok ? stepCredit_('right_1', slow) : 0, lvl = sub ? progressOf_(c, sub).level : '';
      var aid = newId_('A'), auto = ok || !ans ? '' : mistakeOf_(q, ans);
      if (ok) right++; if (!ans) blank++;
      if (sub) subs[sub] = 1;
      resp.push({ set_id: txt_(setId), student_code: c, qid: q.qid, order: i + 1, skill: txt_(clean_(row.skill)), subskill: txt_(sub), difficulty: diff, level: row.level || '',
                  type: (q.type || 'mcq') === 'mcq' ? 'mcq' : 'num', try1_answer: txt_(ans), try1_correct: ans ? (ok ? 1 : 0) : '', final_answer: txt_(ans), best_correct: ok ? 1 : 0,
                  n_tries: ans ? 1 : 0, locked: '', fixed_at: '', time_try1_sec: aSec, time_total_sec: tSec, slow_above_sec: slowAt, pace: ok ? (slow ? 'slow' : 'in_time') : '',
                  mistake_auto: txt_(auto), attempt_id: txt_(aid), submitted_at: now });
      if (ans) tries.push({ attempt_id: '', student_code: c, qid: q.qid, try_no: 1, answer: txt_(ans), correct: ok ? 'Yes' : 'No', mistake_type: txt_(auto), time_sec: tSec,
                            client_said: '', at: now, time_answer_sec: aSec, set_id: txt_(setId) });
      atts.push({ attempt_id: aid, student_code: c, kind: 'assignment', scope: txt_('hw:' + setId), qid: q.qid, subskill: txt_(sub), skill: txt_(clean_(row.skill)),
                  difficulty: diff, started_at: now, finished_at: now, status: 'done', n_tries: ans ? 1 : 0, try1_correct: ok ? 'Yes' : 'No', correct: ok ? 'Yes' : 'No',
                  result: ok ? 'right_1' : ans ? 'wrong_1' : 'blank', answer_shown: '', hint_used: '', n_hints: 0, time_try1_sec: aSec, time_total_sec: tSec,
                  slow_above_sec: slowAt, pace: ok ? (slow ? 'slow' : 'in_time') : '', step_credit: credit, device: txt_(clean_(s.device)), note: '',
                  level_at_start: lvl, counted: credit > 0 && creditCounts_(diff, lvl) ? 'Yes' : 'No', time_answer_sec: aSec, session_id: '' });
    });
    dataAppend_(TAB.RESPONSES, resp);
    dataAppend_(TAB.TRIES, tries);
    dataAppend_(TAB.ATTEMPTS, atts);
    var open = {}; openReview_(c).forEach(function (r) { open[clean_(r.qid)] = 1; });
    dataAppend_(TAB.REVIEW, resp.filter(function (r) { return Number(r.best_correct) !== 1 && !open[r.qid]; }).map(function (r) {
      return { student_code: c, qid: r.qid, subskill: r.subskill, attempt_id: r.attempt_id, reason: 'assignment', added_at: now, status: 'open', note: '' };
    }));
    var used = resp.reduce(function (t, r) { return t + (Number(r.time_total_sec) || 0); }, 0);
    dataUpdate_(TAB.SETS, s._row, { status: 'submitted', submitted_at: now, state_json: txt_(JSON.stringify(st)), progress: 'Submitted', last_saved_at: now,
                                    first_try: right, best_score: right, n_blank: blank, time_used_min: round_(used / 60, 1) });
    progressReset_(); Object.keys(subs).forEach(function (u) { refreshStatus_(c, u); });
    return hwResultView_(setRow_(setId));
  } finally { lock.releaseLock(); }
}
/** The ONE result view (lesson 10): header + First Try / Best Score + by sub-skill + mistake types + the question list. */
function hwResultView_(s) {
  var rows = responsesOf_(s.set_id), by = {}, mist = {}, open = 0;
  rows.forEach(function (r) {
    var u = clean_(r.subskill), o = by[u] = by[u] || { subskill: u, name: subskillName_(u), n: 0, right1: 0, best: 0 };
    o.n++; if (Number(r.try1_correct) === 1) o.right1++; if (Number(r.best_correct) === 1) o.best++;
    [clean_(r.mistake_auto), clean_(r.mistake_type)].forEach(function (m) { if (m && m !== 'Not A Mistake') mist[m] = (mist[m] || 0) + 1; });
    if (Number(r.best_correct) !== 1 && !isYes_(r.locked)) open++;
  });
  var tags = (typeof SKILLMAP_ !== 'undefined' && SKILLMAP_.mistakes) || {};
  return { ok: true, submitted: true, set_id: clean_(s.set_id), title: hwTitle_(s), date: dateStr_(s.submitted_at), n: rows.length,
           first_try: Number(s.first_try) || 0, best: rows.filter(function (r) { return Number(r.best_correct) === 1; }).length, to_fix: open,
           subskills: Object.keys(by).map(function (k) { return by[k]; }),
           mistakes: Object.keys(mist).sort(function (a, b) { return mist[b] - mist[a]; }).map(function (m) { return { tag: m, text: tags[m] || m, n: mist[m] }; }),
           questions: rows.map(function (r) {
             return { no: Number(r.order), qid: clean_(r.qid), subskill: subskillName_(clean_(r.subskill)),
                      status: Number(r.try1_correct) === 1 ? 'right' : Number(r.best_correct) === 1 ? 'fixed' : clean_(r.final_answer) === '' ? 'blank' : isYes_(r.locked) ? 'locked' : 'wrong' };
           }) };
}
/** Browser call: a submitted set's result (My history → Open, or after Submit). */
function hwResult(code, setId) {
  cachedReads_();
  var s = requireSet_(code, setId);
  if (!isSubmitted_(s)) return { ok: false, msg: 'This set has not been submitted yet.' };
  return hwResultView_(s);
}

/* ---- Fix wrong answers ---- */
function fixState_(q, r, tries) {
  var mcq = (q.type || 'mcq') === 'mcq', n = Number(r.n_tries) || 0;
  var status = Number(r.try1_correct) === 1 ? 'right' : Number(r.best_correct) === 1 ? 'fixed' : isYes_(r.locked) ? 'locked' : 'open';
  return { status: status, n_tries: n, tries_left: mcq ? Math.max(0, mcqMax_() - n) : null, mcq: mcq,
           tried: mcq ? tries.filter(function (t) { return !isYes_(t.correct); }).map(function (t) { return clean_(t.answer).toUpperCase(); }) : [],
           tried_num: mcq ? [] : tries.filter(function (t) { return !isYes_(t.correct); }).map(function (t) { return clean_(t.answer); }).slice(-5),
           answer: clean_(r.final_answer) };
}
function fixKeyFor_(s, q) { return { qid: q.qid, k: encKey_(answerSpec_(q), clean_(s.set_id) + '|' + q.qid) }; }
/** Browser call: the questions not right on the first try (never the key) + the encoded key of the first open one. */
function hwFix(code, setId) {
  cachedReads_();
  var s = requireSet_(code, setId);
  if (!isSubmitted_(s)) throw new Error('SESSION: Submit the set first.');
  var rows = responsesOf_(setId), all = hwTries_(setId), qs = {};
  hwQ_(s).forEach(function (q) { qs[q.qid] = q; });
  var items = rows.filter(function (r) { return Number(r.try1_correct) !== 1 && qs[clean_(r.qid)]; }).map(function (r) {
    var q = qs[clean_(r.qid)], o = setQuestion_(q, Number(r.order) - 1), fx = fixState_(q, r, all.filter(function (t) { return clean_(t.qid) === q.qid; }));
    Object.keys(fx).forEach(function (k) { o[k] = fx[k]; });
    return o;
  });
  var first = items.filter(function (o) { return o.status === 'open'; })[0];
  return { ok: true, set_id: String(setId), title: hwTitle_(s), items: items, max_tries: mcqMax_(), ask_note_max: noteMax_(), asks: asksFor_({ set_id: String(setId) }),
           best: rows.filter(function (r) { return Number(r.best_correct) === 1; }).length, n: rows.length, fk: first ? fixKeyFor_(s, qs[first.qid]) : null };
}
/** Browser call: the encoded key of ONE open fix question (fetched while the student thinks). */
function hwFixKey(code, setId, qid) {
  cachedReads_();
  var s = requireSet_(code, setId); if (!isSubmitted_(s)) return { ok: false };
  var r = responsesOf_(setId).filter(function (x) { return clean_(x.qid) === String(qid); })[0], q = r && libQuestion_(String(qid));
  if (!q || fixState_(q, r, hwTries_(setId, qid)).status !== 'open') return { ok: false };
  var k = fixKeyFor_(s, q); k.ok = true; return k;
}
/** Browser call: one fix try — graded here (truth); returns right / wrong + tries left, never the key. */
function hwFixTry(code, setId, qid, answer, sec, clientSaid) {
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    freshReads_();
    var s = requireSet_(code, setId), c = normCode_(s.student_code);
    if (!isSubmitted_(s)) throw new Error('SESSION: Submit the set first.');
    var r = responsesOf_(setId).filter(function (x) { return clean_(x.qid) === String(qid); })[0], q = r && libQuestion_(String(qid));
    if (!q) throw new Error('SESSION: Question not found.');
    var tries = hwTries_(setId, qid), fx = fixState_(q, r, tries), best = function () { return responsesOf_(setId).filter(function (x) { return Number(x.best_correct) === 1; }).length; };
    if (fx.status !== 'open') return { ok: true, qid: q.qid, correct: fx.status !== 'locked', status: fx.status, tries_left: fx.tries_left, tried: fx.tried, best: best() };
    var a = cleanAnswer_(q, answer);
    if (a === null) return { ok: false, msg: 'Choose one of the answers.' };
    if (a === '') return { ok: false, msg: (q.type || 'mcq') === 'mcq' ? 'Choose an answer first.' : 'Type your answer first.' };
    if (fx.mcq && fx.tried.indexOf(a) >= 0) return { ok: false, msg: 'You already tried ' + a + '.' };
    var n = fx.n_tries + 1, ok = msbGrade_(answerSpec_(q), a), now = nowIso_(), locked = !ok && fx.mcq && n >= mcqMax_();
    var t = Math.max(0, Math.min(3600, Math.round(Number(sec) || 0)));
    dataAppend_(TAB.TRIES, [{ attempt_id: '', student_code: c, qid: q.qid, try_no: n, answer: txt_(a), correct: ok ? 'Yes' : 'No', mistake_type: ok ? '' : txt_(mistakeOf_(q, a)),
                              time_sec: t, client_said: clientSaid === undefined || clientSaid === null ? '' : (clientSaid ? 'Yes' : 'No'), at: now, time_answer_sec: t, set_id: txt_(setId) }]);
    var f = { n_tries: n, final_answer: txt_(a), time_total_sec: (Number(r.time_total_sec) || 0) + t };
    if (ok) { f.best_correct = 1; f.fixed_at = now; }
    if (locked) f.locked = 1;
    dataUpdate_(TAB.RESPONSES, r._row, f);
    if (ok) dataFilter_(TAB.REVIEW, function (x) { return normCode_(x.student_code) === c && clean_(x.qid) === q.qid && clean_(x.status) === 'open' && clean_(x.attempt_id) === clean_(r.attempt_id); })
      .forEach(function (x) { dataUpdate_(TAB.REVIEW, x._row, { status: 'cleared', cleared_at: now, cleared_by: 'fixed' }); });
    var b = best(); dataUpdate_(TAB.SETS, s._row, { best_score: b });
    var tried = fx.tried.slice(); if (!ok && fx.mcq) tried.push(a);
    return { ok: true, qid: q.qid, correct: ok, status: ok ? 'fixed' : locked ? 'locked' : 'open', n_tries: n, tries_left: fx.mcq ? Math.max(0, mcqMax_() - n) : null,
             tried: tried, best: b, mismatch: clientSaid !== undefined && clientSaid !== null && !!clientSaid !== ok };
  } finally { lock.releaseLock(); }
}

/* ---- History + read-only review ---- */
/** Browser call: My history — every submitted set (newest first). */
function hwHistory(code) {
  cachedReads_();
  var c = normCode_(requireStudent_(code).student_code);
  return { ok: true, sets: dataFilter_(TAB.SETS, function (s) { return normCode_(s.student_code) === c && isSubmitted_(s); })
    .sort(function (a, b) { return toMs_(b.submitted_at) - toMs_(a.submitted_at); }).map(function (s) {
      var rows = responsesOf_(s.set_id);
      return { set_id: clean_(s.set_id), title: hwTitle_(s), date: dateStr_(s.submitted_at), n: rows.length || Number(s.n) || 0, first_try: Number(s.first_try) || 0,
               best: rows.filter(function (r) { return Number(r.best_correct) === 1; }).length,
               to_fix: rows.filter(function (r) { return Number(r.best_correct) !== 1 && !isYes_(r.locked); }).length };
    }) };
}
/** Browser call: Open (read-only): the questions + the student's answer, right / wrong — NEVER the key. */
function hwReview(code, setId) {
  cachedReads_();
  var s = requireSet_(code, setId);
  if (!isSubmitted_(s)) throw new Error('SESSION: This set has not been submitted yet.');
  var qs = {}; hwQ_(s).forEach(function (q) { qs[q.qid] = q; });
  return { ok: true, set_id: String(setId), title: hwTitle_(s), date: dateStr_(s.submitted_at), items: responsesOf_(setId).filter(function (r) { return qs[clean_(r.qid)]; }).map(function (r) {
    var o = setQuestion_(qs[clean_(r.qid)], Number(r.order) - 1);
    o.answer = clean_(r.final_answer); o.first = clean_(r.try1_answer);
    o.status = Number(r.try1_correct) === 1 ? 'right' : Number(r.best_correct) === 1 ? 'fixed' : o.answer === '' ? 'blank' : 'wrong';
    return o;
  }) };
}

/* ---- Ask teacher (assignments and practice) ---- */
function asksFor_(ref) {
  var o = {};
  dataFilter_(TAB.ASKS, function (a) { return clean_(a.status) === 'open' && (ref.set_id ? clean_(a.set_id) === ref.set_id : clean_(a.attempt_id) === ref.attempt_id); })
    .forEach(function (a) { o[clean_(a.qid)] = clean_(a.note); });
  return o;
}
/** Browser call: Ask teacher on / off (+ note ≤ ask_note_max). ref = {set_id, qid} (assignment) or {attempt_id} (practice). */
function askTeacher(code, ref, on, note) {
  ref = ref || {};
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    freshReads_();
    var st = requireStudent_(code), c = normCode_(st.student_code), qid, kind;
    if (ref.set_id) { var s = requireSet_(code, ref.set_id); qid = String(ref.qid || ''); kind = 'assignment'; if (setQids_(s).indexOf(qid) < 0) throw new Error('SESSION: Question not found.'); }
    else { var a = attemptRow_(code, ref.attempt_id); qid = clean_(a.qid); kind = 'practice'; }
    var mine = dataFilter_(TAB.ASKS, function (x) { return normCode_(x.student_code) === c && clean_(x.qid) === qid && (ref.set_id ? clean_(x.set_id) === String(ref.set_id) : clean_(x.attempt_id) === String(ref.attempt_id)); });
    var open = mine.filter(function (x) { return clean_(x.status) === 'open'; })[0], text = String(note || '').slice(0, noteMax_());
    if (on) {
      if (open) dataUpdate_(TAB.ASKS, open._row, { note: txt_(text), at: nowIso_() });
      else dataAppend_(TAB.ASKS, [{ ask_id: newId_('Q'), student_code: c, kind: kind, set_id: txt_(ref.set_id || ''), attempt_id: txt_(ref.attempt_id || ''), qid: qid,
                                     note: txt_(text), at: nowIso_(), status: 'open', resolved_at: '', resolved_by: '' }]);
    } else if (open) dataUpdate_(TAB.ASKS, open._row, { status: 'withdrawn', resolved_at: nowIso_(), resolved_by: 'student' });
    return { ok: true, qid: qid, asked: !!on, note: on ? text : '' };
  } finally { lock.releaseLock(); }
}

/* =========================== teacher =========================== */
function targetsList_() {
  return { students: studentList_().filter(function (s) { return s.active; }).map(function (s) { return { id: 'st:' + s.code, name: s.name }; }),
           classes: classRows_().map(function (c) { return { id: clean_(c.class_id), name: String(c.name || c.class_id), n: codesOf_(c.student_codes).length }; }) };
}
/** qids any of these students has met (practice or assignments). */
function seenBy_(mem) {
  var m = {}, out = {}; mem.forEach(function (c) { m[c] = 1; });
  dataRows_(TAB.ATTEMPTS).forEach(function (a) { if (m[normCode_(a.student_code)]) { var o = out[clean_(a.qid)] = out[clean_(a.qid)] || { ms: 0, who: {} }; o.ms = Math.max(o.ms, toMs_(a.started_at)); o.who[normCode_(a.student_code)] = 1; } });
  dataRows_(TAB.SETS).forEach(function (s) { if (m[normCode_(s.student_code)] && !isSubmitted_(s)) setQids_(s).forEach(function (q) { var o = out[q] = out[q] || { ms: 0, who: {} }; o.ms = Math.max(o.ms, toMs_(s.created_at)); o.who[normCode_(s.student_code)] = 1; }); });
  return out;
}
/** Browser call: Assignment builder data — targets + the tree with live counts per E/M/H (and how many are new for the target). */
function hwBuilder(code, target, fresh) {
  if (fresh) freshReads_(); else cachedReads_();
  requireTeacher_(code);
  var mem = target ? resolveTarget_(target).members : [], seen = mem.length ? seenBy_(mem) : {}, cnt = {};
  livePool_().forEach(function (r) {
    var u = clean_(r.subskill), d = clean_(r.difficulty).toUpperCase(), o = cnt[u] = cnt[u] || { E: 0, M: 0, H: 0, fE: 0, fM: 0, fH: 0 };
    if (o[d] !== undefined) { o[d]++; if (!seen[clean_(r.qid)]) o['f' + d]++; }
  });
  var tree = skillTree_().map(function (t) {
    return { topic: t.topic, name: t.name, skills: t.skills.map(function (k) {
      return { id: k.id, name: k.name, subs: k.subs.map(function (u) { return { id: u.id, name: u.name, count: cnt[u.id] || null }; }) };
    }) };
  });
  return { ok: true, read_at: fmtDate_(new Date(), 'HH:mm:ss'), targets: targetsList_(), tree: tree, members: mem.length, today: today_() };
}
function spread_(n, diffs) { var o = {}; diffs.forEach(function (d, i) { o[d] = Math.floor(n / diffs.length) + (i < n % diffs.length ? 1 : 0); }); return o; }
function seedOf_(str) { var h = 7; String(str).split('').forEach(function (c) { h = (h * 31 + c.charCodeAt(0)) % 2147483646; }); return h + 1; }
function shuffle_(a, seed) { var s = seed; for (var i = a.length - 1; i > 0; i--) { s = (s * 16807) % 2147483647; var j = s % (i + 1), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
/** Browser call: Pick questions. spec = {target, topics: [{code: sub-skill ID, n, diffs: 'E,M'}]} → per sub-skill: picked +
 *  queue (for Swap). New for every target student first, then met longest ago; n spread over the ticked difficulties; a
 *  difficulty with too few items is filled from the neighbouring one (said in notes). */
function hwPick(code, spec) {
  cachedReads_(); requireTeacher_(code);
  spec = spec || {};
  var T = resolveTarget_(spec.target), seen = seenBy_(T.members), names = {}, pool = livePool_(), used = {}, seed = seedOf_(JSON.stringify(spec) + Date.now());
  studentList_().forEach(function (s) { names[s.code] = String(s.name).split(/\s+/)[0]; });
  var NAME = { E: 'Easy', M: 'Medium', H: 'Hard' }, NB = { E: ['M', 'H'], M: ['E', 'H'], H: ['M', 'E'] };
  var topics = (spec.topics || []).map(function (t) {
    var tc = String(t.code || ''), n = Math.max(1, Math.min(30, Number(t.n) || 1));
    var diffs = String(t.diffs || '').toUpperCase().split(/[^EMH]+/).filter(function (d, i, a) { return d && a.indexOf(d) === i; });
    if (!diffs.length) throw new Error('SESSION: Tick Easy, Medium or Hard for ' + subskillName_(tc) + '.');
    var inT = pool.filter(function (r) { return clean_(r.subskill) === tc; }), rnd = {};
    shuffle_(inT.slice(), seed).forEach(function (r, i) { rnd[clean_(r.qid)] = i; });
    var queueFor = function (d) {
      return inT.filter(function (r) { return clean_(r.difficulty).toUpperCase() === d && !used[clean_(r.qid)]; }).sort(function (a, b) {
        var la = seen[clean_(a.qid)], lb = seen[clean_(b.qid)];
        return (la ? 1 : 0) - (lb ? 1 : 0) || (la ? la.ms : 0) - (lb ? lb.ms : 0) || rnd[clean_(a.qid)] - rnd[clean_(b.qid)];
      });
    };
    var picked = [], take = function (d, k) { var q = queueFor(d).slice(0, k); q.forEach(function (r) { used[clean_(r.qid)] = 1; picked.push(r); }); return q.length; };
    var want = spread_(n, diffs), got = {}, notes = [];
    diffs.forEach(function (d) { got[d] = take(d, want[d]); });
    diffs.forEach(function (d) {
      var miss = want[d] - got[d], adds = []; if (miss <= 0) return;
      NB[d].forEach(function (nd) { if (miss <= 0) return; var k = take(nd, miss); if (k) { adds.push(k + ' ' + NAME[nd]); miss -= k; } });
      notes.push('only ' + got[d] + ' ' + NAME[d] + ' available' + (adds.length ? ' — ' + adds.join(' + ') + ' added' : '') + (miss > 0 ? ' — ' + miss + ' missing' : ''));
    });
    var item = function (r) {
      var l = seen[clean_(r.qid)], who = l ? Object.keys(l.who).map(function (c) { return names[c] || c; }) : [];
      return { qid: clean_(r.qid), difficulty: clean_(r.difficulty), type: clean_(r.type), status: l ? 'met by ' + who.join(', ') : 'new for all', preview: qPreview_(clean_(r.qid)) };
    };
    var queue = []; diffs.concat(['E', 'M', 'H'].filter(function (d) { return diffs.indexOf(d) < 0; })).forEach(function (d) { queueFor(d).forEach(function (r) { queue.push(item(r)); }); });
    return { code: tc, name: subskillName_(tc), n: n, diffs: diffs.join(','), notes: notes, picked: picked.map(item), queue: queue.slice(0, 20) };
  });
  return { ok: true, target: { id: String(spec.target), title: T.title, members: T.members.length }, topics: topics };
}
function qPreview_(qid) {
  var q = libQuestion_(qid);
  return q ? String(q.stem_html || '').replace(/<svg[\s\S]*?<\/svg>/g, ' [figure] ').replace(/<[^>]+>/g, ' ').replace(/\\[()]/g, '').replace(/\s+/g, ' ').trim().slice(0, 110) : '';
}
/** Browser call: Publish with the frozen list of questions. a = {title, target, topics, qids, available_from, due}. */
function hwPublish(code, a) {
  a = a || {};
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    freshReads_(); requireTeacher_(code);
    var T = resolveTarget_(a.target), live = {}; livePool_().forEach(function (r) { live[clean_(r.qid)] = 1; });
    var qids = (a.qids || []).map(String).filter(function (q, i, arr) { return live[q] && arr.indexOf(q) === i; });
    if (!qids.length) throw new Error('SESSION: Pick the questions first.');
    var title = String(a.title || '').trim().slice(0, 80) || 'Homework – ' + fmtDate_(new Date(), 'd MMM');
    var from = /^\d{4}-\d{2}-\d{2}$/.test(String(a.available_from || '')) ? String(a.available_from) : today_();
    var due = /^\d{4}-\d{2}-\d{2}$/.test(String(a.due || '')) ? String(a.due) : '';
    if (due && due < from) throw new Error('SESSION: Due is before "available from".');
    var id = newId_('H');
    dataAppend_(TAB.ASSIGNMENTS, [{ assignment_id: id, title: txt_(title), target_type: T.kind, target_id: txt_(T.id), topics: txt_(JSON.stringify(a.topics || [])), qids: txt_(qids.join(',')),
                                     available_from: txt_(from), due: txt_(due), status: 'published', created_at: nowIso_(), created_in: 'app', note: '' }]);
    return { ok: true, assignment_id: id, n: qids.length, title: title, list: hwListCore_() };
  } finally { lock.releaseLock(); }
}
function hwListCore_() {
  var names = {}; studentList_().forEach(function (s) { names[s.code] = s.name; });
  var cls = {}; classRows_().forEach(function (c) { cls[clean_(c.class_id)] = String(c.name || c.class_id); });
  var sets = dataRows_(TAB.SETS);
  var list = dataRows_(TAB.ASSIGNMENTS).filter(function (a) { return clean_(a.assignment_id) && clean_(a.status) !== 'deleted'; }).map(function (a) {
    var aid = clean_(a.assignment_id), mine = sets.filter(function (s) { return clean_(s.assignment_id) === aid; });
    var studs = targetMembers_(a).map(function (c) {
      var s = mine.filter(function (x) { return normCode_(x.student_code) === c; })[0], done = s && isSubmitted_(s);
      return { code: c, name: names[c] || c, state: !s ? 'not started' : done ? 'done' : 'in progress', progress: s ? clean_(s.progress) : '',
               first_try: done ? Number(s.first_try) || 0 : null, best: done ? Number(s.best_score) || 0 : null, set_id: s ? clean_(s.set_id) : '' };
    });
    return { assignment_id: aid, title: String(a.title), n: setQids_(a).length, who: clean_(a.target_type) === 'student' ? names[normCode_(a.target_id)] || clean_(a.target_id) : cls[clean_(a.target_id)] || clean_(a.target_id),
             from: fmtDay_(a.available_from), due: fmtDay_(a.due), status: clean_(a.status), started: mine.length, students: studs,
             done: studs.filter(function (x) { return x.state === 'done'; }).length };
  }).reverse();
  return { current: list.filter(function (a) { return a.status === 'published'; }), past: list.filter(function (a) { return a.status === 'closed'; }) };
}
/** Browser call: the Assignments list (Current · Past). */
function hwList(code, fresh) { if (fresh) freshReads_(); else cachedReads_(); requireTeacher_(code); var l = hwListCore_(); l.ok = true; l.read_at = fmtDate_(new Date(), 'HH:mm:ss'); return l; }
/** Browser call: Close (hidden for students; sets and history stay) · reopen · delete (only while nobody has started it; row kept). */
function hwSetStatus(code, aid, action) {
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    freshReads_(); requireTeacher_(code);
    var a = asgRow_(aid); if (!a || clean_(a.status) === 'deleted') throw new Error('SESSION: Assignment not found.');
    if (action === 'delete' && dataFilter_(TAB.SETS, function (s) { return clean_(s.assignment_id) === String(aid); }).length) throw new Error('SESSION: Someone has started it: close it instead.');
    var to = { close: 'closed', reopen: 'published', 'delete': 'deleted' }[action];
    if (!to) throw new Error('SESSION: Unknown action.');
    dataUpdate_(TAB.ASSIGNMENTS, a._row, { status: to });
    var l = hwListCore_(); l.ok = true; l.read_at = fmtDate_(new Date(), 'HH:mm:ss'); return l;
  } finally { lock.releaseLock(); }
}

/* ---- Asked inbox ---- */
function askRef_(x) { return clean_(x.set_id) ? { set_id: clean_(x.set_id), qid: clean_(x.qid) } : { attempt_id: clean_(x.attempt_id), qid: clean_(x.qid) }; }
/** Browser call: open asks, newest first. */
function asksInbox(code, fresh) {
  if (fresh) freshReads_(); else cachedReads_();
  requireTeacher_(code);
  var names = {}; studentList_().forEach(function (s) { names[s.code] = s.name; });
  var sets = {}; dataRows_(TAB.SETS).forEach(function (s) { sets[clean_(s.set_id)] = s; });
  return { ok: true, read_at: fmtDate_(new Date(), 'HH:mm:ss'), asks: dataRows_(TAB.ASKS).filter(function (a) { return clean_(a.status) === 'open'; }).map(function (a) {
    var r = questionRow_(clean_(a.qid)) || {}, s = sets[clean_(a.set_id)];
    return { ask_id: clean_(a.ask_id), student: names[normCode_(a.student_code)] || clean_(a.student_code), student_code: normCode_(a.student_code), qid: clean_(a.qid),
             subskill: subskillName_(clean_(r.subskill)), difficulty: clean_(r.difficulty), note: clean_(a.note), date: dateStr_(a.at), ms: toMs_(a.at),
             where: clean_(a.kind) === 'assignment' ? hwTitle_(s) : 'Practice', ref: askRef_(a) };
  }).sort(function (x, y) { return y.ms - x.ms; }) };
}
/** Browser call: Resolve (or reopen) one ask. */
function resolveAsk(code, askId, reopen) {
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    freshReads_(); requireTeacher_(code);
    var a = dataFind_(TAB.ASKS, function (x) { return clean_(x.ask_id) === String(askId); }); if (!a) throw new Error('SESSION: Not found.');
    dataUpdate_(TAB.ASKS, a._row, reopen ? { status: 'open', resolved_at: '', resolved_by: '' } : { status: 'resolved', resolved_at: nowIso_(), resolved_by: 'teacher' });
    return asksInbox(code, true);
  } finally { lock.releaseLock(); }
}

/* ---- Go over ---- */
/** The order rule of "What to go over" (SAT spec §9) — the ONE place to change it: questions somebody got wrong on the
 *  first try first (most students wrong first; one student: still wrong before fixed), then asked, then slow, then the rest. */
function priorityOrder_(rows, single) {
  rows.forEach(function (r) { r.group = r.wrong1 > 0 ? 1 : r.asks > 0 ? 2 : r.slow > 0 ? 3 : 4; });
  return rows.sort(function (a, b) {
    return a.group - b.group || b.wrong1 - a.wrong1 || (single ? b.still - a.still : 0) || b.asks - a.asks || b.extra - a.extra || b.slow - a.slow || (a.qid < b.qid ? -1 : 1);
  });
}
/** Browser call: Go over — target = 'all' | class id | 'st:CODE'; scope = 'a:<assignment id>' | 'd7' | 'd30' | 'all'.
 *  Assignments: each student's answer (first try + fixes). Date scopes add Practice answers (path, review, with teacher). */
function goOver(code, target, scope, fresh) {
  if (fresh) freshReads_(); else cachedReads_();
  requireTeacher_(code);
  target = String(target || 'all');
  var T = target === 'all' ? { kind: 'all', id: 'all', title: 'All students', members: studentList_().filter(function (s) { return s.active; }).map(function (s) { return s.code; }) } : resolveTarget_(target);
  var mem = {}, names = {}; T.members.forEach(function (c) { mem[c] = 1; }); studentList_().forEach(function (s) { names[s.code] = s.name; });
  var asg = dataRows_(TAB.ASSIGNMENTS).filter(function (a) { return clean_(a.status) !== 'deleted' && targetMembers_(a).some(function (c) { return mem[c]; }); });
  scope = String(scope || (asg.length ? 'a:' + clean_(asg[asg.length - 1].assignment_id) : 'd7'));
  var now = Date.now(), days = scope === 'all' ? 1e6 : Number(scope.replace(/\D/g, '')) || 7, inDays = function (ms) { return now - ms <= days * 86400000; };
  var byA = scope.indexOf('a:') === 0 ? scope.slice(2) : '';
  var sets = {}; dataRows_(TAB.SETS).forEach(function (s) { if (mem[normCode_(s.student_code)] && isSubmitted_(s) && (byA ? clean_(s.assignment_id) === byA : inDays(toMs_(s.submitted_at)))) sets[clean_(s.set_id)] = s; });
  var asks = {}; dataRows_(TAB.ASKS).forEach(function (a) { if (clean_(a.status) === 'open') asks[clean_(a.set_id) ? 's|' + clean_(a.set_id) + '|' + clean_(a.qid) : 'a|' + clean_(a.attempt_id)] = a; });
  var tries = {}; dataRows_(TAB.TRIES).forEach(function (t) { var k = clean_(t.set_id) ? 's|' + clean_(t.set_id) + '|' + clean_(t.qid) : 'a|' + clean_(t.attempt_id); (tries[k] = tries[k] || []).push(t); });
  var byQ = {}, add = function (qid, st) {
    var Q = questionRow_(qid) || {}, o = byQ[qid] = byQ[qid] || { qid: qid, subskill: clean_(Q.subskill), difficulty: clean_(Q.difficulty), type: clean_(Q.type),
                                                                  n: 0, wrong1: 0, still: 0, asks: 0, extra: 0, slow: 0, students: [] };
    o.n++; if (!st.open && !st.right1) o.wrong1++; if (!st.open && !st.best) o.still++; if (st.ask) o.asks++; o.extra += Math.max(0, st.n_tries - 1); if (st.pace === 'slow') o.slow++;
    o.students.push(st);
  };
  var tl = function (k) { return (tries[k] || []).sort(function (a, b) { return Number(a.try_no) - Number(b.try_no); }).map(function (t) { return { a: clean_(t.answer), ok: isYes_(t.correct), tag: clean_(t.mistake_type) }; }); };
  dataRows_(TAB.RESPONSES).forEach(function (r) {
    var s = sets[clean_(r.set_id)]; if (!s) return;
    var k = 's|' + clean_(r.set_id) + '|' + clean_(r.qid), ask = asks[k];
    add(clean_(r.qid), { code: normCode_(r.student_code), name: names[normCode_(r.student_code)] || clean_(r.student_code), where: hwTitle_(s), date: dateStr_(r.submitted_at),
                         ref: { set_id: clean_(r.set_id), qid: clean_(r.qid) }, tries: tl(k), right1: Number(r.try1_correct) === 1, best: Number(r.best_correct) === 1,
                         n_tries: Number(r.n_tries) || 0, locked: isYes_(r.locked), time_s: Math.round(Number(r.time_try1_sec) || 0), pace: clean_(r.pace),
                         ask: !!ask, ask_note: ask ? clean_(ask.note) : '', ask_id: ask ? clean_(ask.ask_id) : '', auto: clean_(r.mistake_auto),
                         mistake_type: clean_(r.mistake_type), mistake_note: clean_(r.mistake_note) });
  });
  if (!byA) dataRows_(TAB.ATTEMPTS).forEach(function (a) {
    var k = 'a|' + clean_(a.attempt_id), ask = asks[k], res = clean_(a.result), open = clean_(a.status) === 'open';
    if (!mem[normCode_(a.student_code)] || clean_(a.kind) === 'assignment' || (open ? !ask : clean_(a.status) !== 'done') || !inDays(toMs_(open ? a.started_at : a.finished_at))) return;
    if (res === 'right_1' && !ask && clean_(a.pace) !== 'slow') return;                      // practice: only what needs explaining
    add(clean_(a.qid), { code: normCode_(a.student_code), name: names[normCode_(a.student_code)] || clean_(a.student_code), where: (clean_(a.kind) === 'teacher' ? 'Practise with teacher' : 'Practice') + (open ? ' · still working' : ''),
                         date: dateStr_(open ? a.started_at : a.finished_at), ref: { attempt_id: clean_(a.attempt_id), qid: clean_(a.qid) }, tries: tl(k), right1: res === 'right_1', best: res !== 'wrong_2', open: open,
                         n_tries: Number(a.n_tries) || 0, locked: res === 'wrong_2', time_s: Math.round(Number(a.time_try1_sec) || 0), pace: clean_(a.pace),
                         ask: !!ask, ask_note: ask ? clean_(ask.note) : '', ask_id: ask ? clean_(ask.ask_id) : '', auto: (tl(k).filter(function (t) { return !t.ok; })[0] || {}).tag || '',
                         mistake_type: clean_(a.mistake_type_teacher), mistake_note: clean_(a.mistake_note) });
  });
  var rows = priorityOrder_(Object.keys(byQ).map(function (k) { return byQ[k]; }), T.members.length === 1);
  rows.forEach(function (r) {
    r.subskill_name = subskillName_(r.subskill);
    var b = [r.wrong1 + ' of ' + r.n + ' wrong'];
    if (r.asks) b.push(r.asks + ' asked'); if (r.extra) b.push(r.extra + ' extra tries'); if (r.slow) b.push(r.slow + ' slow');
    r.summary = b.join(' · ');
  });
  var scopes = [{ id: 'd7', label: 'Last 7 days' }, { id: 'd30', label: 'Last 30 days' }, { id: 'all', label: 'All time' }];
  asg.slice().reverse().forEach(function (a) { scopes.push({ id: 'a:' + clean_(a.assignment_id), label: 'Assignment · ' + String(a.title) }); });
  var targets = targetsList_();
  return { ok: true, read_at: fmtDate_(new Date(), 'HH:mm:ss'), target: { id: T.id === 'all' ? 'all' : (T.kind === 'student' ? 'st:' + T.id : T.id), title: T.title },
           targets: targets, scope: scope, scopes: scopes, rows: rows };
}
/** Browser call: the question panel of Go over — the question as students saw it + key + hint (teacher only; Show answer is
 *  instant from this) + the mistake options (Settings mistake_types, then the sub-skill's skill-map tags). */
function goQuestion(code, qid) {
  cachedReads_(); requireTeacher_(code);
  var q = libQuestion_(String(qid)); if (!q) throw new Error('SESSION: Question not found.');
  var r = questionRow_(q.qid) || {}, sub = clean_(r.subskill);
  return { ok: true, q: clientQuestion_(q), qid: q.qid, subskill: subskillName_(sub), difficulty: clean_(r.difficulty), answer: answerText_(q), hint_html: q.hint_html || '',
           mistakes: mistakeOptions_(sub) };
}
function mistakeOptions_(sub) {
  var types = String(getSettings_().mistake_types || '').split(/\s*;\s*/).filter(String), map = (typeof SKILLMAP_ !== 'undefined' && SKILLMAP_) || { rows: [], mistakes: {} };
  var row = map.rows.filter(function (x) { return x.subskill === sub; })[0], tags = ((row && row.mistakes) || []).map(function (k) { return { id: k, text: (map.mistakes || {})[k] || k }; });
  return { types: types, tags: tags };
}
/** Browser call: tag one wrong answer with a mistake type (or '' to clear). ref = {set_id, qid} | {attempt_id}. A tag resolves
 *  the open Ask of that answer (Undo = tag '' with undo_ask); a real mistake (not "Not A Mistake") puts the item in Review. */
function tagMistake(code, ref, type, note, undoAsk) {
  ref = ref || {};
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    freshReads_(); requireTeacher_(code);
    type = String(type || '').trim();
    var row, tab, c, qid, sub, aid;
    if (ref.set_id) { row = dataFind_(TAB.RESPONSES, function (r) { return clean_(r.set_id) === String(ref.set_id) && clean_(r.qid) === String(ref.qid); }); tab = TAB.RESPONSES; }
    else { row = dataFind_(TAB.ATTEMPTS, function (r) { return clean_(r.attempt_id) === String(ref.attempt_id); }); tab = TAB.ATTEMPTS; }
    if (!row) throw new Error('SESSION: Answer not found.');
    c = normCode_(row.student_code); qid = clean_(row.qid); sub = clean_(row.subskill); aid = tab === TAB.RESPONSES ? clean_(row.attempt_id) : clean_(row.attempt_id);
    var ok = mistakeOptions_(sub);
    if (type && ok.types.indexOf(type) < 0 && !ok.tags.some(function (t) { return t.id === type; })) throw new Error('SESSION: Unknown mistake type.');
    var f = { mistake_note: txt_(String(note === undefined || note === null ? clean_(row.mistake_note) : note).slice(0, 300)), tagged_at: type ? nowIso_() : '' };
    if (tab === TAB.RESPONSES) { f.mistake_type = txt_(type); f.tagged_in = type ? 'app' : ''; } else f.mistake_type_teacher = txt_(type);
    dataUpdate_(tab, row._row, f);
    var askRows = dataFilter_(TAB.ASKS, function (x) { return ref.set_id ? clean_(x.set_id) === String(ref.set_id) && clean_(x.qid) === qid : clean_(x.attempt_id) === String(ref.attempt_id); });
    var resolved = false, reopened = false;
    askRows.forEach(function (x) {
      if (type && clean_(x.status) === 'open') { dataUpdate_(TAB.ASKS, x._row, { status: 'resolved', resolved_at: nowIso_(), resolved_by: 'tag' }); resolved = true; }
      if (undoAsk && clean_(x.status) === 'resolved' && clean_(x.resolved_by) === 'tag') { dataUpdate_(TAB.ASKS, x._row, { status: 'open', resolved_at: '', resolved_by: '' }); reopened = true; }
    });
    var added = false;
    if (type && type !== 'Not A Mistake' && !openReview_(c).some(function (r) { return clean_(r.qid) === qid; })) {
      dataAppend_(TAB.REVIEW, [{ student_code: c, qid: qid, subskill: txt_(sub), attempt_id: txt_(aid), reason: 'tagged', added_at: nowIso_(), status: 'open', note: txt_(type) }]);
      added = true;
    }
    return { ok: true, type: type, review_added: added, ask_resolved: resolved, ask_reopened: reopened };
  } finally { lock.releaseLock(); }
}
