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

/** Live items per sub-skill: {sub: n}. */
function liveBySub_() { var o = {}; livePool_().forEach(function (r) { var u = clean_(r.subskill); o[u] = (o[u] || 0) + 1; }); return o; }
/** The path with each sub-skill's progress, in skill-map order, and per-skill "x of y solid". */
function pathProgress_(code) {
  var subs = pathSubskills_(code), live = liveBySub_(), idx = skillIdx_();
  var path = subs.map(function (u) {
    var p = progressOf_(code, u);
    return { id: u, name: subskillName_(u), skill_id: idx.subOf[u], skill: skillName_(idx.subOf[u]), n_live: live[u] || 0, n_done: p.n, n_right1: p.right1,
             status: p.status, level: p.level, steps: p.steps, need: p.need, solid: p.solid, position: p.position, label: progressLabel_(p) };
  });
  var skills = [], last = null;
  path.forEach(function (p) { if (!last || last.id !== p.skill_id) { last = { id: p.skill_id, name: p.skill, n: 0, solid: 0 }; skills.push(last); } last.n++; if (p.solid) last.solid++; });
  return { path: path, skills: skills };
}
/** Home Practise = one sub-skill at a time: the first sub-skill of the path (skill-map order) that is not solid and has
 *  live questions. null when every such sub-skill is solid (or none has questions). */
function nextPathSub_(path) {
  for (var i = 0; i < path.length; i++) if (!path[i].solid && path[i].n_live) return path[i].id;
  return null;
}

/** Browser call: the home page data. */
function homeData(code) {
  cachedReads_();
  var st = requireStudent_(code);
  var pp = pathProgress_(code), att = attemptsOf_(code).filter(function (a) { return clean_(a.status) === 'done'; });
  var rv = openReview_(code).map(function (r) { return { qid: clean_(r.qid), subskill: subskillName_(clean_(r.subskill)), added: dateStr_(r.added_at) }; });
  var nx = nextPathSub_(pp.path), ts = tsOpenFor_(code);
  return { teacher_open: ts ? tsCard_(ts, code) : null, name: String(st.name || ''), path: pp.path, skills: pp.skills, next: nx, next_name: nx ? subskillName_(nx) : '',
           sample_n: pp.path.length ? 0 : livePool_().length, review: rv, n_done: att.length };
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
/** Tries per question: Practice 2 (max_tries) · Practise with teacher 3 (class_max_tries, BRAIN #31). */
function maxTries_(a) {
  var st = getSettings_();
  if (a && clean_(a.kind) === 'teacher') return Math.max(1, Number(st.class_max_tries) || 3);
  return Math.max(1, Number(st.max_tries) || 2);
}

/** The open question payload (also used to resume after a reload). */
function questionPayload_(a, q, scope) {
  var tries = triesOf_(a.attempt_id).map(function (t) { return { try_no: Number(t.try_no), answer: clean_(t.answer), correct: isYes_(t.correct) }; });
  return { ok: true, attempt_id: clean_(a.attempt_id), scope: scope, q: clientQuestion_(q), subskill: subskillName_(clean_(a.subskill)),
           k: encKey_(answerSpec_(q), clean_(a.attempt_id) + '|' + q.qid), max_tries: maxTries_(a), tries: tries,
           hint_used: isYes_(a.hint_used), hint_html: isYes_(a.hint_used) ? (q.hint_html || '') : '' };
}

/** Browser call. opts: {subskill: id} one sub-skill · {review: true} the review list · {} the path (or the samples).
 *  An attempt still open in the same scope is returned again (reload / back button never makes a new one). */
function nextQuestion(code, opts) {
  opts = opts || {};
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    requireStudent_(code);
    var ts = opts.teacher ? tsOpenFor_(code) : null;
    if (opts.teacher && (!ts || clean_(ts.session_id) !== String(opts.teacher))) return { ok: false, empty: true, msg: 'Your teacher has closed this practice.' };
    var scope = ts ? 'teacher:' + clean_(ts.session_id) : opts.review ? 'review' : opts.subskill ? 'sub:' + String(opts.subskill) : 'path';
    var mine = attemptsOf_(code);
    var open = mine.filter(function (a) { return clean_(a.status) === 'open' && clean_(a.scope) === scope; })[0];
    if (open) { var oq = libQuestion_(clean_(open.qid)); if (oq) return questionPayload_(open, oq, scope); }
    // pool for this scope (path = one sub-skill at a time: the first not-solid sub-skill with questions)
    var pool = livePool_(), kind = 'practice', sub = '', level = '', forced = null;
    if (ts) {                                                                  // Practise with teacher (#9 v2)
      var pk = tsPick_(ts, code, mine);
      if (!pk.sub) return { ok: false, empty: true, done_all: pk.done_all, msg: pk.msg };
      kind = 'teacher'; sub = pk.sub; level = pk.level; forced = pk.qid;
      pool = pool.filter(function (r) { return clean_(r.subskill) === sub; });
    } else if (opts.review) {
      var want = {}; openReview_(code).forEach(function (r) { want[clean_(r.qid)] = 1; });
      pool = pool.filter(function (r) { return want[clean_(r.qid)]; }); kind = 'review';
    } else {
      if (opts.subskill) sub = String(opts.subskill);
      else if (pathSubskills_(code).length) {
        sub = nextPathSub_(pathProgress_(code).path) || '';
        if (!sub) return { ok: false, empty: true, done_all: true, msg: 'Every sub-skill on your path is solid.' };
      } else kind = 'sample';
      if (sub) { pool = pool.filter(function (r) { return clean_(r.subskill) === sub; }); level = progressOf_(code, sub).level; }
    }
    if (!pool.length) return { ok: false, empty: true, msg: opts.review ? 'Your review list is empty.' : 'No questions here yet.' };
    var lastDone = mine.filter(function (x) { return clean_(x.status) === 'done'; }).sort(function (x, y) { return toMs_(x.finished_at) - toMs_(y.finished_at) || x._row - y._row; }).slice(-1)[0];
    pool = orderPool_(pool, mine, level, opts.after || (lastDone ? clean_(lastDone.qid) : ''));
    var pick = pool[0];
    if (forced) { var fr = questionRow_(forced); if (fr) { pick = fr; sub = clean_(fr.subskill); level = progressOf_(code, sub).level; } }
    var q = libQuestion_(clean_(pick.qid));
    if (!q) return { ok: false, empty: true, msg: 'This question could not be loaded. Tell your teacher.' };
    var a = { attempt_id: newId_('A'), student_code: normCode_(code), kind: kind, scope: scope, qid: q.qid, subskill: txt_(clean_(pick.subskill)),
              skill: txt_(clean_(pick.skill)), difficulty: clean_(pick.difficulty), started_at: nowIso_(), status: 'open', n_tries: 0, n_hints: 0,
              device: txt_(String(opts.device || '').slice(0, 40)), level_at_start: level, session_id: ts ? clean_(ts.session_id) : '' };
    dataAppend_(TAB.ATTEMPTS, [a]);
    if (ts && forced) tsUsed_(ts, forced);
    a.attempt_id = String(a.attempt_id); a.subskill = clean_(pick.subskill);
    var done = mine.filter(function (x) { return clean_(x.status) === 'done'; }).length;
    var out = questionPayload_(a, q, scope); out.n_done = done; out.pool_n = pool.length;
    return out;
  } finally { lock.releaseLock(); }
}

/** Order a pool for picking (spec §5): items at the student's level first, then one level up (its right answers still
 *  count), then lower levels (no credit, see Progress.gs); no level (samples / review) = all together. Inside: never seen
 *  first, then done longest ago; then skill-map order, tags.level 1 < 2 < 3, qid. Never the same item twice in a row
 *  (`after`) unless it is the only one. */
function orderPool_(pool, mine, level, after) {
  var last = {}; mine.forEach(function (a) { if (clean_(a.status) === 'done') last[clean_(a.qid)] = Math.max(last[clean_(a.qid)] || 0, toMs_(a.finished_at) || 1); });
  var ord = skillIdx_().order, L = level ? lvIdx_(level) : -1;
  function dist(r) { var d = lvIdx_(r.difficulty); if (L < 0) return 0; return d === L ? 0 : d > L ? 2 * (d - L) - 1 : 2 * (L - d); }
  pool = pool.slice().sort(function (x, y) {
    var dx = dist(x), dy = dist(y); if (dx !== dy) return dx - dy;
    var lx = last[clean_(x.qid)] || 0, ly = last[clean_(y.qid)] || 0;
    if (!lx !== !ly) return lx ? 1 : -1;
    if (lx && ly && lx !== ly) return lx - ly;
    return (ord[clean_(x.subskill)] || 999) - (ord[clean_(y.subskill)] || 999) || lvIdx_(x.difficulty) - lvIdx_(y.difficulty) || (Number(x.level) || 1) - (Number(y.level) || 1) || (clean_(x.qid) < clean_(y.qid) ? -1 : 1);
  });
  if (after && pool.length > 1 && clean_(pool[0].qid) === String(after)) {
    var j = 1; while (j < pool.length && clean_(pool[j].qid) === String(after)) j++;
    if (j < pool.length) pool.unshift(pool.splice(j, 1)[0]);
  }
  return pool;
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

/** Seconds from the browser: a number (old pages) or {sec: to Check, answer_sec: to the last change of the answer = the
 *  "final answer" time (SML #16), away_n / away_sec: times the window was left this try (silent log, SML #16 / lesson 13)}. */
function timing_(t) {
  var clamp = function (x) { return Math.max(0, Math.min(3600, Math.round(Number(x) || 0))); };
  if (t && typeof t === 'object') { var sec = clamp(t.sec); return { sec: sec, answer: Math.min(sec, clamp(t.answer_sec === undefined ? t.sec : t.answer_sec)), away_n: clamp(t.away_n), away_sec: clamp(t.away_sec) }; }
  var n = clamp(t); return { sec: n, answer: n, away_n: 0, away_sec: 0 };
}

/** Browser call: one try. The server grades it again (truth) and stores it; clientSaid = what the browser showed. */
function submitTry(code, attemptId, answer, timeSec, clientSaid) {
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    requireStudent_(code);
    var a = attemptRow_(code, attemptId);
    var tries = triesOf_(attemptId), max = maxTries_(a);
    if (clean_(a.status) !== 'open' || tries.length >= max) return { ok: false, finished: true, msg: 'This question is already finished.' };
    answer = String(answer === undefined || answer === null ? '' : answer).trim().slice(0, 40);
    if (!answer) return { ok: false, msg: 'Type an answer first.' };
    var q = libQuestion_(clean_(a.qid));
    if (!q) throw new Error('SESSION: This question could not be loaded.');
    var tm = timing_(timeSec), correct = msbGrade_(answerSpec_(q), answer), tryNo = tries.length + 1, sec = tm.sec;
    dataAppend_(TAB.TRIES, [{ attempt_id: txt_(attemptId), student_code: normCode_(code), qid: q.qid, try_no: tryNo, answer: txt_(answer),
                              correct: correct ? 'Yes' : 'No', mistake_type: correct ? '' : mistakeOf_(q, answer), time_sec: sec,
                              client_said: clientSaid === undefined || clientSaid === null ? '' : (clientSaid ? 'Yes' : 'No'), at: nowIso_(),
                              time_answer_sec: tm.answer }]);
    var awayN = (Number(a.away_n) || 0) + tm.away_n, awaySec = (Number(a.away_sec) || 0) + tm.away_sec;
    var finished = correct || tryNo >= max, out = { ok: true, correct: correct, try_no: tryNo, tries_left: Math.max(0, max - tryNo), finished: finished,
               mismatch: clientSaid !== undefined && clientSaid !== null && !!clientSaid !== correct };
    if (!finished) { if (tm.away_n) dataUpdate_(TAB.ATTEMPTS, a._row, { away_n: awayN, away_sec: awaySec }); return out; }
    var times = tries.map(function (t) { return Number(t.time_sec) || 0; }).concat([sec]);
    var ans1 = tries.length ? Number(tries[0].time_answer_sec === '' || tries[0].time_answer_sec === undefined ? tries[0].time_sec : tries[0].time_answer_sec) || 0 : tm.answer;
    var t1 = ans1, slowAt = slowAbove_(a.difficulty, q.type), result = correct ? (tryNo === 1 ? 'right_1' : 'right_2') : 'wrong_2';
    var slow = t1 > slowAt, credit = stepCredit_(result, slow);             // Practise with teacher counts exactly like Practice (BRAIN #31)
    var track = clean_(a.kind) !== 'sample' && clean_(a.subskill), before = track ? progressOf_(code, clean_(a.subskill)) : null;
    dataUpdate_(TAB.ATTEMPTS, a._row, { status: 'done', finished_at: nowIso_(), n_tries: tryNo, try1_correct: tryNo === 1 && correct ? 'Yes' : 'No',
      correct: correct ? 'Yes' : 'No', result: result, answer_shown: correct ? '' : 'Yes', time_try1_sec: t1,
      time_total_sec: times.reduce(function (s, x) { return s + x; }, 0), slow_above_sec: slowAt, pace: correct && tryNo === 1 ? (slow ? 'slow' : 'in_time') : '',
      step_credit: credit, time_answer_sec: tries.map(function (t) { return Number(t.time_answer_sec) || 0; }).concat([tm.answer]).slice(-1)[0],
      away_n: awayN, away_sec: awaySec, counted: a.level_at_start ? (credit > 0 && creditCounts_(a.difficulty, a.level_at_start) ? 'Yes' : 'No') : '' });
    out.result = result; out.step_credit = credit; out.slow = slow;
    if (track) {
      var p = refreshStatus_(code, clean_(a.subskill));
      out.progress = { label: progressLabel_(p), level: p.level, steps: p.steps, need: p.need, solid: p.solid, position: p.position,
                       moved: p.solid !== before.solid || p.level !== before.level ? (p.solid ? 'Solid' : p.level) : '' };
    }
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
