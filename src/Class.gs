/**
 * MSB — Class mode (ticket #9, BRAIN §5 #20): live practice with the teacher. Same question screen as Practice; only who
 * picks the next question and the teacher's live controls are new.
 *   Class_Sessions  one row per session (students, open / ended, tries before the answer = class_max_tries, changeable live)
 *   Class_Queue     the teacher's next-questions queue (order, sub-skill, E/M/H; queued → pushed / removed)
 *   Class_Events    everything the teacher did, PER STUDENT (push, pause, continue, message, reveal, tries, end)
 *   Attempts        a push opens an Attempts row (kind 'class', session_id) for that student; answers go through the same
 *                   submitTry (server re-grade, encoded key of the ONE open question only)
 * Live typing ("what the student just typed / chose") is NOT written to the Sheet: the student's 3-second poll puts it in
 * CacheService (6 h) for the teacher's 3-second poll — polls only read snapshots, so they stay cheap for Apps Script quotas.
 * Mastery (BRAIN #20): only the 1st try counts, and only if the teacher did not pause / message / reveal on that question
 * before it (Attempts.helped = Yes → step credit 0).
 */

var CL_HELP_ = { pause: 1, message: 1, reveal: 1 };

function clSession_(sid, mustOpen) {
  var s = dataFind_(TAB.CLASS_SESSIONS, function (r) { return clean_(r.session_id) === String(sid); });
  if (!s) throw new Error('SESSION: This class session was not found.');
  if (mustOpen && clean_(s.status) !== 'open') throw new Error('SESSION: This class has ended.');
  return s;
}
function clCodes_(s) { return clean_(s.student_codes).split(',').map(normCode_).filter(String); }
function clMaxTries_(s) { return Math.max(1, Math.min(9, Number(s.max_tries) || Number(getSettings_().class_max_tries) || 3)); }
function clEvents_(sid) { return dataFilter_(TAB.CLASS_EVENTS, function (e) { return clean_(e.session_id) === String(sid); }); }
function clLog_(sid, list) {
  var at = nowIso_();
  dataAppend_(TAB.CLASS_EVENTS, list.map(function (e) { return { session_id: sid, student_code: e.code, attempt_id: txt_(e.attempt_id || ''), qid: txt_(e.qid || ''), type: e.type, value: txt_(e.value === undefined ? '' : String(e.value).slice(0, 300)), at: at }; }));
}
/** The student's current class attempt in a session (the last one pushed), or null. */
function clCurrent_(sid, code) {
  var c = normCode_(code), list = dataFilter_(TAB.ATTEMPTS, function (a) { return clean_(a.session_id) === String(sid) && normCode_(a.student_code) === c && clean_(a.status) !== 'skipped'; });
  list.sort(function (a, b) { return a._row - b._row; });
  return list.length ? list[list.length - 1] : null;
}
/** Open session that holds this student (newest), or null. */
function clOpenFor_(code) {
  var c = normCode_(code), list = dataFilter_(TAB.CLASS_SESSIONS, function (s) { return clean_(s.status) === 'open' && clCodes_(s).indexOf(c) >= 0; });
  return list.length ? list[list.length - 1] : null;
}
function clPaused_(evs, code) {
  var p = false; evs.forEach(function (e) { if (normCode_(e.student_code) !== normCode_(code)) return; if (e.type === 'pause') p = true; else if (e.type === 'continue' || e.type === 'push') p = false; });
  return p;
}
function clTypKey_(sid, code) { return 'msb_cl_typ_' + sid + '_' + normCode_(code); }

/* =========================== student =========================== */

/** Browser call (student, every class_poll_sec): what to show now. live = {attempt_id, typed} is what the student has on
 *  screen (typed answer / chosen letter) → cache for the teacher. Never writes the Sheet. */
function classPoll(code, sid, live) {
  cachedReads_();
  var st = requireStudent_(code), c = normCode_(st.student_code);
  var s = clSession_(sid, false);
  if (clCodes_(s).indexOf(c) < 0) throw new Error('SESSION: You are not in this class.');
  if (clean_(s.status) !== 'open') return { ok: true, ended: true, summary: classSummaryOf_(s, c) };
  live = live || {};
  try { CacheService.getScriptCache().put(clTypKey_(sid, c), JSON.stringify({ a: String(live.attempt_id || ''), t: String(live.typed || '').slice(0, 40), at: Date.now() }), 21600); } catch (e) {}
  var evs = clEvents_(sid), cur = clCurrent_(sid, c);
  var msgs = evs.filter(function (e) { return normCode_(e.student_code) === c && e.type === 'message'; }).map(function (e) { return { id: e._row, text: clean_(e.value), at: dateStr_(e.at) }; });
  var out = { ok: true, title: clean_(s.title), paused: clPaused_(evs, c), messages: msgs, max_tries: clMaxTries_(s), poll_sec: Number(getSettings_().class_poll_sec) || 3 };
  if (!cur) { out.waiting = true; return out; }
  out.attempt_id = clean_(cur.attempt_id); out.status = clean_(cur.status); out.result = clean_(cur.result);
  if (String(live.attempt_id || '') !== out.attempt_id) {                     // a new question for this student: send it
    var q = libQuestion_(clean_(cur.qid));
    if (q) { var pay = questionPayload_(cur, q, 'class:' + sid); pay.max_tries = clMaxTries_(s); out.question = pay; }
  }
  if (out.status === 'done' && !isYes_(cur.correct)) { var q2 = libQuestion_(clean_(cur.qid)); if (q2) out.answer = answerText_(q2); }
  return out;
}

/* =========================== teacher =========================== */

/** Browser call: open a session for one student or a group. */
function classStart(code, studentCodes, title) {
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    freshReads_(); requireTeacher_(code);
    var codes = (studentCodes || []).map(normCode_).filter(function (c, i, a) { return c && a.indexOf(c) === i; });
    codes.forEach(function (c) { var st = findStudent_(c); if (!st || !isYes_(st.active)) throw new Error('SESSION: Student ' + c + ' not found or locked.'); });
    if (!codes.length) throw new Error('SESSION: Pick at least one student.');
    // one open session per student: older open sessions of these students end
    dataFilter_(TAB.CLASS_SESSIONS, function (s) { return clean_(s.status) === 'open' && clCodes_(s).some(function (c) { return codes.indexOf(c) >= 0; }); })
      .forEach(function (s) { clEndRow_(s); });
    var sid = newId_('C');
    dataAppend_(TAB.CLASS_SESSIONS, [{ session_id: sid, title: txt_(String(title || '').trim().slice(0, 80) || 'Class ' + fmtDate_(new Date(), 'dd MMM')), student_codes: codes.join(','),
                                       status: 'open', max_tries: Number(getSettings_().class_max_tries) || 3, created_at: nowIso_(), ended_at: '', note: '' }]);
    clLog_(sid, codes.map(function (c) { return { code: c, type: 'start' }; }));
    return classLive(code, sid);
  } finally { lock.releaseLock(); }
}
function clEndRow_(s) {
  dataUpdate_(TAB.CLASS_SESSIONS, s._row, { status: 'ended', ended_at: nowIso_() });
  clCodes_(s).forEach(function (c) {
    var cur = clCurrent_(clean_(s.session_id), c);
    if (cur && clean_(cur.status) === 'open') dataUpdate_(TAB.ATTEMPTS, cur._row, { status: 'skipped', note: 'class ended' });
  });
  clLog_(clean_(s.session_id), clCodes_(s).map(function (c) { return { code: c, type: 'end' }; }));
}
/** Browser call: end the session → summary. An unanswered open question is closed as 'skipped' (no credit). */
function classEnd(code, sid) {
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try { freshReads_(); requireTeacher_(code); var s = clSession_(sid, false); if (clean_(s.status) === 'open') clEndRow_(s); freshReads_(); return classSummary(code, sid); }
  finally { lock.releaseLock(); }
}

/** Live panel (teacher, every class_poll_sec): one row per student + the queue. Snapshots + the typing cache. */
function classLive(code, sid) {
  cachedReads_(); requireTeacher_(code);
  var s = clSession_(sid, false), codes = clCodes_(s), evs = clEvents_(sid), now = Date.now();
  var typ = {}; try { typ = CacheService.getScriptCache().getAll(codes.map(function (c) { return clTypKey_(sid, c); })) || {}; } catch (e) {}
  var names = {}; dataRows_(TAB.STUDENTS).forEach(function (r) { names[normCode_(r.student_code)] = String(r.name || r.student_code); });
  var rows = codes.map(function (c) {
    var cur = clCurrent_(sid, c), r = { code: c, name: names[c] || c, paused: clPaused_(evs, c), state: 'waiting' };
    var mine = evs.filter(function (e) { return normCode_(e.student_code) === c; });
    r.messages = mine.filter(function (e) { return e.type === 'message'; }).length;
    if (!cur) return r;
    var tries = triesOf_(cur.attempt_id), t = {}; try { t = JSON.parse(typ[clTypKey_(sid, c)] || '{}'); } catch (e) {}
    r.attempt_id = clean_(cur.attempt_id); r.qid = clean_(cur.qid); r.subskill = subskillName_(clean_(cur.subskill)); r.difficulty = clean_(cur.difficulty);
    r.tries = tries.map(function (x) { return { a: clean_(x.answer), ok: isYes_(x.correct) }; });
    r.hint = isYes_(cur.hint_used); r.helped = isYes_(cur.helped);
    r.typed = t.a === r.attempt_id ? t.t : ''; r.seen_sec = t.at ? Math.round((now - t.at) / 1000) : null;
    r.sec = clean_(cur.status) === 'open' ? Math.max(0, Math.round((now - toMs_(cur.started_at)) / 1000)) : (Number(cur.time_total_sec) || 0);
    r.state = clean_(cur.status) === 'open' ? 'working' : clean_(cur.result) === 'revealed' ? 'revealed' : isYes_(cur.correct) ? 'right' : 'wrong';
    r.result = clean_(cur.result);
    return r;
  });
  var queue = dataFilter_(TAB.CLASS_QUEUE, function (q) { return clean_(q.session_id) === String(sid) && clean_(q.status) !== 'removed'; })
    .sort(function (a, b) { return (clean_(a.status) === 'queued' ? 0 : 1) - (clean_(b.status) === 'queued' ? 0 : 1) || Number(a.pos) - Number(b.pos) || a._row - b._row; })
    .map(function (q) { return { item_id: clean_(q.item_id), qid: clean_(q.qid), subskill: clean_(q.subskill), subskill_name: subskillName_(clean_(q.subskill)), difficulty: clean_(q.difficulty), status: clean_(q.status), pushed_to: clean_(q.pushed_to) }; });
  return { ok: true, session_id: String(sid), title: clean_(s.title), status: clean_(s.status), max_tries: clMaxTries_(s), students: rows, queue: queue,
           subs: liveSubList_(), read_at: fmtDate_(new Date(), 'HH:mm:ss'), poll_sec: Number(getSettings_().class_poll_sec) || 3 };
}
/** Sub-skills that have live questions (for "Add to queue"), skill-map order, with E/M/H counts. */
function liveSubList_() {
  var by = {}; livePool_().forEach(function (r) { var u = clean_(r.subskill), d = clean_(r.difficulty).toUpperCase(); by[u] = by[u] || { E: 0, M: 0, H: 0 }; if (d in by[u]) by[u][d]++; });
  var ord = skillIdx_().order;
  return Object.keys(by).sort(function (a, b) { return (ord[a] || 999) - (ord[b] || 999); }).map(function (u) { return { id: u, name: subskillName_(u), n: by[u] }; });
}

/** Pick a live item of a sub-skill + difficulty for the queue: not already queued, not `except`; unseen by the session's
 *  students first, then the one they did longest ago. */
function clPickItem_(s, sub, diff, except) {
  var codes = clCodes_(s), queued = {};
  dataFilter_(TAB.CLASS_QUEUE, function (q) { return clean_(q.session_id) === clean_(s.session_id) && clean_(q.status) === 'queued'; }).forEach(function (q) { queued[clean_(q.qid)] = 1; });
  var last = {};
  dataFilter_(TAB.ATTEMPTS, function (a) { return codes.indexOf(normCode_(a.student_code)) >= 0 && clean_(a.status) === 'done'; }).forEach(function (a) { last[clean_(a.qid)] = Math.max(last[clean_(a.qid)] || 0, toMs_(a.finished_at) || 1); });
  var pool = livePool_().filter(function (r) { return clean_(r.subskill) === String(sub) && (!diff || clean_(r.difficulty).toUpperCase() === diff) && !queued[clean_(r.qid)] && clean_(r.qid) !== except; });
  pool.sort(function (a, b) { var la = last[clean_(a.qid)] || 0, lb = last[clean_(b.qid)] || 0; return la - lb || (Number(a.level) || 1) - (Number(b.level) || 1) || (clean_(a.qid) < clean_(b.qid) ? -1 : 1); });
  return pool[0] || null;
}
/** Browser call: queue edits. op = add {subskill, difficulty} · remove {item_id} · up / down {item_id} · swap {item_id}
 *  (another item, same sub-skill + difficulty) · level {item_id, difficulty} (an item of the same sub-skill at E/M/H). */
function classQueueEdit(code, sid, op, args) {
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    freshReads_(); requireTeacher_(code);
    var s = clSession_(sid, true); args = args || {};
    var q = dataFilter_(TAB.CLASS_QUEUE, function (x) { return clean_(x.session_id) === String(sid) && clean_(x.status) === 'queued'; }).sort(function (a, b) { return Number(a.pos) - Number(b.pos) || a._row - b._row; });
    var item = args.item_id ? q.filter(function (x) { return clean_(x.item_id) === String(args.item_id); })[0] : null;
    var msg = '';
    if (op === 'add') {
      var d = String(args.difficulty || '').toUpperCase(), pick = clPickItem_(s, args.subskill, /^[EMH]$/.test(d) ? d : '', '');
      if (!pick) msg = 'No other question left for this choice.';
      else dataAppend_(TAB.CLASS_QUEUE, [{ session_id: sid, item_id: newId_('Q'), pos: (q.length ? Number(q[q.length - 1].pos) || q.length : 0) + 1, qid: clean_(pick.qid), subskill: txt_(clean_(pick.subskill)),
                                           difficulty: clean_(pick.difficulty), status: 'queued', added_at: nowIso_(), pushed_at: '', pushed_to: '', note: '' }]);
    } else if (!item) msg = 'This queue item is gone. Refresh.';
    else if (op === 'remove') dataUpdate_(TAB.CLASS_QUEUE, item._row, { status: 'removed' });
    else if (op === 'up' || op === 'down') {
      var i = q.indexOf(item), j = op === 'up' ? i - 1 : i + 1;
      if (j >= 0 && j < q.length) { q.forEach(function (x, k) { var p = k === i ? j : k === j ? i : k; if (Number(x.pos) !== p + 1) dataUpdate_(TAB.CLASS_QUEUE, x._row, { pos: p + 1 }); }); }
    } else if (op === 'swap' || op === 'level') {
      var d2 = op === 'level' ? String(args.difficulty || '').toUpperCase() : clean_(item.difficulty).toUpperCase();
      var p2 = clPickItem_(s, clean_(item.subskill), d2, clean_(item.qid));
      if (!p2) msg = 'No other ' + d2 + ' question in this sub-skill.';
      else dataUpdate_(TAB.CLASS_QUEUE, item._row, { qid: clean_(p2.qid), difficulty: clean_(p2.difficulty) });
    } else msg = 'Unknown change.';
    var live = classLive(code, sid); live.msg = msg; return live;
  } finally { lock.releaseLock(); }
}

/** Browser call: push a question. target = '*' (everyone in the session: the SAME question) or one student code.
 *  qid = a given question, else the first queued item. Each student gets a new Attempts row; an unfinished one is skipped. */
function classPush(code, sid, target, qid) {
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    freshReads_(); requireTeacher_(code);
    var s = clSession_(sid, true), codes = clCodes_(s), to = target === '*' ? codes : [normCode_(target)];
    if (to.some(function (c) { return codes.indexOf(c) < 0; })) throw new Error('SESSION: Not a student of this class.');
    var item = null;
    if (!qid) {
      item = dataFilter_(TAB.CLASS_QUEUE, function (x) { return clean_(x.session_id) === String(sid) && clean_(x.status) === 'queued'; }).sort(function (a, b) { return Number(a.pos) - Number(b.pos) || a._row - b._row; })[0];
      if (!item) { var l0 = classLive(code, sid); l0.msg = 'The queue is empty. Add a question first.'; return l0; }
      qid = clean_(item.qid);
    }
    var row = questionRow_(qid);
    if (!row || !libQuestion_(qid)) throw new Error('SESSION: Question not found.');
    var add = [], ev = [];
    to.forEach(function (c) {
      var cur = clCurrent_(sid, c);
      if (cur && clean_(cur.status) === 'open') dataUpdate_(TAB.ATTEMPTS, cur._row, { status: 'skipped', note: 'teacher pushed another question' });
      var lvl = progressOf_(c, clean_(row.subskill)).level, id = newId_('A');
      add.push({ attempt_id: id, student_code: c, kind: 'class', scope: 'class:' + sid, qid: String(qid), subskill: txt_(clean_(row.subskill)), skill: txt_(clean_(row.skill)),
                 difficulty: clean_(row.difficulty), started_at: nowIso_(), status: 'open', n_tries: 0, n_hints: 0, level_at_start: lvl, session_id: sid, helped: 'No' });
      ev.push({ code: c, attempt_id: id, qid: qid, type: 'push', value: target === '*' ? 'all' : 'one' });
    });
    dataAppend_(TAB.ATTEMPTS, add); clLog_(sid, ev);
    if (item) dataUpdate_(TAB.CLASS_QUEUE, item._row, { status: 'pushed', pushed_at: nowIso_(), pushed_to: target === '*' ? 'all' : normCode_(target) });
    return classLive(code, sid);
  } finally { lock.releaseLock(); }
}

/** Browser call: live controls. action = pause · continue · message (value = text) · reveal (Show answer now) · tries
 *  (value = new number of tries for the session; target ignored). target = '*' or one student code. */
function classControl(code, sid, target, action, value) {
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    freshReads_(); requireTeacher_(code);
    var s = clSession_(sid, true), codes = clCodes_(s), to = target === '*' ? codes : [normCode_(target)];
    if (to.some(function (c) { return codes.indexOf(c) < 0; })) throw new Error('SESSION: Not a student of this class.');
    if (action === 'tries') {
      var n = Math.max(1, Math.min(9, Math.round(Number(value) || 0)));
      dataUpdate_(TAB.CLASS_SESSIONS, s._row, { max_tries: n });
      clLog_(sid, codes.map(function (c) { return { code: c, type: 'tries', value: n }; }));
      return classLive(code, sid);
    }
    if (!/^(pause|continue|message|reveal)$/.test(action)) throw new Error('SESSION: Unknown action.');
    if (action === 'message' && !String(value || '').trim()) throw new Error('SESSION: Type a message first.');
    var ev = [];
    to.forEach(function (c) {
      var cur = clCurrent_(sid, c), open = cur && clean_(cur.status) === 'open';
      if (action === 'reveal') {
        if (!open) return;
        var tries = triesOf_(cur.attempt_id), q = libQuestion_(clean_(cur.qid));
        dataUpdate_(TAB.ATTEMPTS, cur._row, { status: 'done', finished_at: nowIso_(), n_tries: tries.length, try1_correct: 'No', correct: 'No', result: 'revealed',
                                             answer_shown: 'Yes', step_credit: 0, counted: 'No', helped: 'Yes',
                                             time_total_sec: Math.max(0, Math.round((Date.now() - toMs_(cur.started_at)) / 1000)) });
        if (tries.length && q && !openReview_(c).some(function (r) { return clean_(r.qid) === q.qid; }))
          dataAppend_(TAB.REVIEW, [{ student_code: c, qid: q.qid, subskill: txt_(clean_(cur.subskill)), attempt_id: txt_(cur.attempt_id), reason: 'revealed', added_at: nowIso_(), status: 'open', note: 'class' }]);
        refreshStatus_(c, clean_(cur.subskill));
      } else if (open && CL_HELP_[action] && !triesOf_(cur.attempt_id).length) dataUpdate_(TAB.ATTEMPTS, cur._row, { helped: 'Yes' });
      ev.push({ code: c, attempt_id: cur ? clean_(cur.attempt_id) : '', qid: cur ? clean_(cur.qid) : '', type: action, value: action === 'message' ? String(value).trim() : '' });
    });
    clLog_(sid, ev);
    return classLive(code, sid);
  } finally { lock.releaseLock(); }
}

/** Browser call: "Open on my screen" — the question as students see it + the correct answer (teacher only). */
function classTeacherQuestion(code, qid) {
  cachedReads_(); requireTeacher_(code);
  var q = libQuestion_(qid); if (!q) throw new Error('SESSION: Question not found.');
  return { ok: true, q: clientQuestion_(q), answer: answerText_(q), hint_html: q.hint_html || '', subskill: subskillName_(clean_((q.tags || {}).subskill)) };
}

/** Summary of a session: per student questions / right 1st try / tries / hints / messages / reveals + every question. */
function classSummaryOf_(s, onlyCode) {
  var sid = clean_(s.session_id), evs = clEvents_(sid), names = {};
  dataRows_(TAB.STUDENTS).forEach(function (r) { names[normCode_(r.student_code)] = String(r.name || r.student_code); });
  var codes = clCodes_(s).filter(function (c) { return !onlyCode || c === onlyCode; });
  var att = dataFilter_(TAB.ATTEMPTS, function (a) { return clean_(a.session_id) === sid && codes.indexOf(normCode_(a.student_code)) >= 0 && clean_(a.status) !== 'skipped'; })
    .sort(function (a, b) { return a._row - b._row; });
  var students = codes.map(function (c) {
    var mine = att.filter(function (a) { return normCode_(a.student_code) === c && clean_(a.status) === 'done'; });
    var me = evs.filter(function (e) { return normCode_(e.student_code) === c; });
    return { code: onlyCode ? '' : c, name: names[c] || c, n: mine.length, right1: mine.filter(function (a) { return isYes_(a.try1_correct); }).length,
             tries: mine.reduce(function (t, a) { return t + (Number(a.n_tries) || 0); }, 0), hints: mine.filter(function (a) { return isYes_(a.hint_used); }).length,
             messages: me.filter(function (e) { return e.type === 'message'; }).length, reveals: mine.filter(function (a) { return clean_(a.result) === 'revealed'; }).length,
             steps: mine.reduce(function (t, a) { return t + (clean_(a.counted) === 'Yes' ? Number(a.step_credit) || 0 : 0); }, 0) };
  });
  var questions = att.map(function (a) {
    return { student: names[normCode_(a.student_code)] || '', qid: clean_(a.qid), subskill: subskillName_(clean_(a.subskill)), difficulty: clean_(a.difficulty),
             result: clean_(a.status) === 'open' ? 'open' : clean_(a.result), tries: Number(a.n_tries) || 0, hint: isYes_(a.hint_used), helped: isYes_(a.helped),
             step: clean_(a.counted) === 'Yes' ? Number(a.step_credit) || 0 : 0 };
  });
  return { title: clean_(s.title), status: clean_(s.status), started: dateStr_(s.created_at), ended: dateStr_(s.ended_at), students: students, questions: questions };
}
/** Browser call (teacher): a session's summary + the latest sessions for the start screen. */
function classSummary(code, sid) {
  cachedReads_(); requireTeacher_(code);
  var out = { ok: true, summary: classSummaryOf_(clSession_(sid, false)) };
  out.summary.session_id = String(sid);
  return out;
}
/** Browser call (teacher): start screen data — students, open session (if any), the last 10 sessions. */
function classHome(code, fresh) {
  if (fresh) freshReads_(); else cachedReads_();
  requireTeacher_(code);
  var names = {}; dataRows_(TAB.STUDENTS).forEach(function (r) { names[normCode_(r.student_code)] = String(r.name || r.student_code); });
  var all = dataRows_(TAB.CLASS_SESSIONS).slice().sort(function (a, b) { return b._row - a._row; });
  var open = all.filter(function (s) { return clean_(s.status) === 'open'; })[0];
  return { ok: true, students: studentList_().filter(function (s) { return s.active; }), open: open ? clean_(open.session_id) : '',
           sessions: all.slice(0, 10).map(function (s) { return { session_id: clean_(s.session_id), title: clean_(s.title), status: clean_(s.status), started: dateStr_(s.created_at),
             students: clCodes_(s).map(function (c) { return names[c] || c; }).join(', ') }; }), read_at: fmtDate_(new Date(), 'HH:mm:ss') };
}
