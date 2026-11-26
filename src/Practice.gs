/**
 * MSB — student calls (spec §2.1, §5). One question at a time:
 *   nextQuestion → an Attempts row (status open) + the question (whitelisted) + its answer spec ENCODED for this attempt
 *   → the browser shows ✓/✗ at once (same rules: Grade.gs) → submitTry stores the try and re-grades it (truth)
 *   → after a right try or the 2nd wrong try the attempt is done: step credit (pilot progression), review list.
 * useHint logs every hint press (Hints tab + Attempts.hint_used); a hint never changes the step (Settings.hint_counts).
 * Levels / mastery status per sub-skill come in the next ticket; the step credit of each attempt is already stored.
 */

/* ---------------- path ---------------- */
/** Sub-skill IDs on the student's path (ticked skill → all its sub-skills), in skill-map order. */
function pathSubskills_(code) {
  var idx = skillIdx_(), want = {};
  dataFilter_(TAB.PATHS, function (r) { return normCode_(r.student_code) === normCode_(code) && clean_(r.active || 'Yes') !== 'No'; }).forEach(function (r) {
    var id = clean_(r.target_id), type = clean_(r.target_type).toLowerCase();
    if (type === 'skill' || (!idx.sub[id] && idx.skill[id])) Object.keys(idx.subOf).forEach(function (u) { if (idx.subOf[u] === id) want[u] = 1; });
    else if (idx.sub[id]) want[id] = 1;
  });
  return Object.keys(want).sort(function (a, b) { return (idx.order[a] || 999) - (idx.order[b] || 999); });
}
function attemptsOf_(code) { var c = normCode_(code); return dataFilter_(TAB.ATTEMPTS, function (r) { return normCode_(r.student_code) === c; }); }
function openReview_(code) {
  var c = normCode_(code);
  return dataFilter_(TAB.REVIEW, function (r) { return normCode_(r.student_code) === c && clean_(r.status) === 'open'; });
}

/** Browser call: the home page data. */
function homeData(code) {
  cachedReads_();
  var st = requireStudent_(code);
  var subs = pathSubskills_(code), pool = livePool_(), att = attemptsOf_(code).filter(function (a) { return clean_(a.status) === 'done'; });
  var liveBy = {}; pool.forEach(function (r) { var u = clean_(r.subskill); liveBy[u] = (liveBy[u] || 0) + 1; });
  var path = subs.map(function (u) {
    var mine = att.filter(function (a) { return clean_(a.subskill) === u; });
    return { id: u, name: subskillName_(u), skill: skillName_(skillIdx_().subOf[u]), n_live: liveBy[u] || 0, n_done: mine.length,
             n_right1: mine.filter(function (a) { return isYes_(a.try1_correct); }).length,
             status: mine.length ? 'practising' : 'not started' };
  });
  var rv = openReview_(code).map(function (r) { return { qid: clean_(r.qid), subskill: subskillName_(clean_(r.subskill)), added: dateStr_(r.added_at) }; });
  return { name: String(st.name || ''), path: path, sample_n: subs.length ? 0 : pool.length, review: rv, n_done: att.length };
}

/* ---------------- one question ---------------- */
function attemptRow_(code, attemptId) {
  var a = dataFind_(TAB.ATTEMPTS, function (r) { return clean_(r.attempt_id) === String(attemptId); });
  if (!a || normCode_(a.student_code) !== normCode_(code)) throw new Error('SESSION: This question was not found. Go back to Home.');
  return a;
}
function triesOf_(attemptId) {
  return dataFilter_(TAB.TRIES, function (r) { return clean_(r.attempt_id) === String(attemptId); })
    .sort(function (a, b) { return Number(a.try_no) - Number(b.try_no); });
}
function maxTries_() { return Math.max(1, Number(getSettings_().max_tries) || 2); }

/** The open question payload (also used to resume after a reload). */
function questionPayload_(a, q, scope) {
  var tries = triesOf_(a.attempt_id).map(function (t) { return { try_no: Number(t.try_no), answer: clean_(t.answer), correct: isYes_(t.correct) }; });
  return { ok: true, attempt_id: clean_(a.attempt_id), scope: scope, q: clientQuestion_(q), subskill: subskillName_(clean_(a.subskill)),
           k: encKey_(answerSpec_(q), clean_(a.attempt_id) + '|' + q.qid), max_tries: maxTries_(), tries: tries,
           hint_used: isYes_(a.hint_used), hint_html: isYes_(a.hint_used) ? (q.hint_html || '') : '' };
}

/** Browser call. opts: {subskill: id} one sub-skill · {review: true} the review list · {} the path (or the samples).
 *  An attempt still open in the same scope is returned again (reload / back button never makes a new one). */
function nextQuestion(code, opts) {
  opts = opts || {};
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    requireStudent_(code);
    var scope = opts.review ? 'review' : opts.subskill ? 'sub:' + String(opts.subskill) : 'path';
    var mine = attemptsOf_(code);
    var open = mine.filter(function (a) { return clean_(a.status) === 'open' && clean_(a.scope) === scope; })[0];
    if (open) { var oq = libQuestion_(clean_(open.qid)); if (oq) return questionPayload_(open, oq, scope); }
    // pool for this scope
    var pool = livePool_(), kind = 'practice';
    if (opts.review) {
      var want = {}; openReview_(code).forEach(function (r) { want[clean_(r.qid)] = 1; });
      pool = pool.filter(function (r) { return want[clean_(r.qid)]; }); kind = 'review';
    } else if (opts.subskill) {
      pool = pool.filter(function (r) { return clean_(r.subskill) === String(opts.subskill); });
    } else {
      var subs = pathSubskills_(code);
      if (subs.length) { var s = {}; subs.forEach(function (u) { s[u] = 1; }); pool = pool.filter(function (r) { return s[clean_(r.subskill)]; }); }
      else kind = 'sample';
    }
    if (!pool.length) return { ok: false, empty: true, msg: opts.review ? 'Your review list is empty.' : 'No questions here yet.' };
    // unseen first (skill-map order, then E < M < H), then the one done longest ago
    var last = {}; mine.forEach(function (a) { if (clean_(a.status) === 'done') last[clean_(a.qid)] = Math.max(last[clean_(a.qid)] || 0, toMs_(a.finished_at)); });
    var ord = skillIdx_().order, dOrd = { E: 1, M: 2, H: 3 };
    pool.sort(function (x, y) {
      var lx = last[clean_(x.qid)] || 0, ly = last[clean_(y.qid)] || 0;
      if (!lx !== !ly) return lx ? 1 : -1;
      if (lx && ly && lx !== ly) return lx - ly;
      return (ord[clean_(x.subskill)] || 999) - (ord[clean_(y.subskill)] || 999) || (dOrd[clean_(x.difficulty)] || 9) - (dOrd[clean_(y.difficulty)] || 9) || (clean_(x.qid) < clean_(y.qid) ? -1 : 1);
    });
    if (opts.after && pool.length > 1 && clean_(pool[0].qid) === String(opts.after)) pool.push(pool.shift());   // never the same item twice in a row
    var pick = pool[0], q = libQuestion_(clean_(pick.qid));
    if (!q) return { ok: false, empty: true, msg: 'This question could not be loaded. Tell your teacher.' };
    var a = { attempt_id: newId_('A'), student_code: normCode_(code), kind: kind, scope: scope, qid: q.qid, subskill: txt_(clean_(pick.subskill)),
              skill: txt_(clean_(pick.skill)), difficulty: clean_(pick.difficulty), started_at: nowIso_(), status: 'open', n_tries: 0, n_hints: 0,
              device: txt_(String(opts.device || '').slice(0, 40)) };
    dataAppend_(TAB.ATTEMPTS, [a]);
    a.attempt_id = String(a.attempt_id); a.subskill = clean_(pick.subskill);
    var done = mine.filter(function (x) { return clean_(x.status) === 'done'; }).length;
    var out = questionPayload_(a, q, scope); out.n_done = done; out.pool_n = pool.length;
    return out;
  } finally { lock.releaseLock(); }
}

/* ---------------- timing + step (pilot progression, spec §5) ---------------- */
function slowAbove_(difficulty, type) {
  var d = String(difficulty || '').toUpperCase(), t = type === 'mcq' ? 'mcq' : 'num', st = getSettings_();
  var row = dataFind_(TAB.TIME_NORMS, function (r) { return clean_(r.difficulty).toUpperCase() === d && clean_(r.qtype).toLowerCase() === t; });
  if (row && Number(row.slow_above_sec) > 0) return Number(row.slow_above_sec);
  return Math.round((Number(st.fallback_target_sec) || 90) * (Number(st.slow_ratio) || 1.5));
}
/** Step credit of a finished attempt: right on try 1 in time = right_fast_credit (1), slow = right_slow_credit (½),
 *  right on try 2 = right_try2_credit (0), wrong twice = wrong_credit (0 — never down). A hint does not change it. */
function stepCredit_(result, slow) {
  var s = getSettings_();
  if (result === 'right_1') return slow ? Number(s.right_slow_credit) : Number(s.right_fast_credit);
  if (result === 'right_2') return Number(s.right_try2_credit) || 0;
  return Number(s.wrong_credit) || 0;
}
function mistakeOf_(q, answer) {
  if ((q.type || 'mcq') === 'mcq') {
    var c = (q.choices || []).filter(function (x) { return String(x.label).toUpperCase() === String(answer).trim().toUpperCase(); })[0];
    return c ? clean_(c.mistake_type) : '';
  }
  var spec = answerSpec_(q), hit = (q.wrong_answers || []).filter(function (w) { return msbNumMatch_(answer, w.value, spec.r); })[0];
  return hit ? clean_(hit.mistake_type) : '';
}

/** Browser call: one try. The server grades it again (truth) and stores it; clientSaid = what the browser showed. */
function submitTry(code, attemptId, answer, timeSec, clientSaid) {
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    requireStudent_(code);
    var a = attemptRow_(code, attemptId);
    var tries = triesOf_(attemptId), max = maxTries_();
    if (clean_(a.status) !== 'open' || tries.length >= max) return { ok: false, finished: true, msg: 'This question is already finished.' };
    answer = String(answer === undefined || answer === null ? '' : answer).trim().slice(0, 40);
    if (!answer) return { ok: false, msg: 'Type an answer first.' };
    var q = libQuestion_(clean_(a.qid));
    if (!q) throw new Error('SESSION: This question could not be loaded.');
    var correct = msbGrade_(answerSpec_(q), answer), tryNo = tries.length + 1, sec = Math.max(0, Math.min(3600, Math.round(Number(timeSec) || 0)));
    dataAppend_(TAB.TRIES, [{ attempt_id: txt_(attemptId), student_code: normCode_(code), qid: q.qid, try_no: tryNo, answer: txt_(answer),
                              correct: correct ? 'Yes' : 'No', mistake_type: correct ? '' : mistakeOf_(q, answer), time_sec: sec,
                              client_said: clientSaid === undefined || clientSaid === null ? '' : (clientSaid ? 'Yes' : 'No'), at: nowIso_() }]);
    var finished = correct || tryNo >= max, out = { ok: true, correct: correct, try_no: tryNo, tries_left: Math.max(0, max - tryNo), finished: finished,
               mismatch: clientSaid !== undefined && clientSaid !== null && !!clientSaid !== correct };
    if (!finished) return out;
    var times = tries.map(function (t) { return Number(t.time_sec) || 0; }).concat([sec]);
    var t1 = times[0], slowAt = slowAbove_(a.difficulty, q.type), result = correct ? (tryNo === 1 ? 'right_1' : 'right_2') : 'wrong_2';
    var slow = t1 > slowAt, credit = stepCredit_(result, slow);
    dataUpdate_(TAB.ATTEMPTS, a._row, { status: 'done', finished_at: nowIso_(), n_tries: tryNo, try1_correct: tryNo === 1 && correct ? 'Yes' : 'No',
      correct: correct ? 'Yes' : 'No', result: result, answer_shown: correct ? '' : 'Yes', time_try1_sec: t1,
      time_total_sec: times.reduce(function (s, x) { return s + x; }, 0), slow_above_sec: slowAt, pace: correct && tryNo === 1 ? (slow ? 'slow' : 'in_time') : '',
      step_credit: credit });
    out.result = result; out.step_credit = credit; out.slow = slow;
    if (!correct) {
      out.answer = answerText_(q);
      var have = openReview_(code).some(function (r) { return clean_(r.qid) === q.qid; });
      if (!have) dataAppend_(TAB.REVIEW, [{ student_code: normCode_(code), qid: q.qid, subskill: txt_(clean_(a.subskill)), attempt_id: txt_(attemptId),
                                             reason: 'wrong_twice', added_at: nowIso_(), status: 'open', note: '' }]);
      out.review_added = !have;
    } else if (clean_(a.kind) === 'review' && tryNo === 1) {
      openReview_(code).filter(function (r) { return clean_(r.qid) === q.qid; }).forEach(function (r) {
        dataUpdate_(TAB.REVIEW, r._row, { status: 'cleared', cleared_at: nowIso_(), cleared_by: 'right_first_try' });
      });
      out.review_cleared = true;
    }
    return out;
  } finally { lock.releaseLock(); }
}

/** Browser call: the student pressed Hint. Logged every time (Hints tab); the step is not changed. */
function useHint(code, attemptId) {
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    requireStudent_(code);
    var a = attemptRow_(code, attemptId), q = libQuestion_(clean_(a.qid));
    if (!q || !q.hint_html) return { ok: false, msg: 'No hint for this question.' };
    dataAppend_(TAB.HINTS, [{ attempt_id: txt_(attemptId), student_code: normCode_(code), qid: q.qid, subskill: txt_(clean_(a.subskill)),
                              after_tries: triesOf_(attemptId).length, at: nowIso_() }]);
    dataUpdate_(TAB.ATTEMPTS, a._row, { hint_used: 'Yes', n_hints: (Number(a.n_hints) || 0) + 1 });
    return { ok: true, hint_html: q.hint_html };
  } finally { lock.releaseLock(); }
}

/** Browser call: the student's open review list. */
function reviewList(code) {
  cachedReads_();
  requireStudent_(code);
  return openReview_(code).map(function (r) { return { qid: clean_(r.qid), subskill: subskillName_(clean_(r.subskill)), added: dateStr_(r.added_at) }; });
}
