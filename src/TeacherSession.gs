/**
 * MSB — "Practise with teacher" (ticket #9 v2, BRAIN §5 #30–#31; replaces the 26/11 Class mode).
 * The teacher ASSIGNS a scope to one student (sub-skills, start level, where to begin). The student's home shows a
 * "Practise with teacher" card at the top; inside, the app picks questions in that scope by the normal Practice rules
 * (one sub-skill at a time, level up when doing well), 3 tries (Settings class_max_tries), steps count like Practice.
 * The teacher follows with **Live**: the same question the student is on + what they have typed / chosen + the tries —
 * read ONLY when the teacher opens Live or presses Refresh (no polling). **Assign next** = the teacher chooses only the
 * NEXT question (one); after it the app picks again.
 *   Teacher_Sessions  one row per assignment (student, subskills, level, begin_sub, begin_qid, next_qid, status)
 *   Attempts          kind 'teacher', session_id = the assignment
 *   typing            the student's page sends what is typed / chosen (on change, debounced) → CacheService (6 h), never the Sheet
 */

function tsRow_(sid) { return dataFind_(TAB.TEACHER_SESSIONS, function (r) { return clean_(r.session_id) === String(sid); }); }
/** The student's open assignment (newest), or null. */
function tsOpenFor_(code) {
  var c = normCode_(code), list = dataFilter_(TAB.TEACHER_SESSIONS, function (r) { return normCode_(r.student_code) === c && clean_(r.status) === 'open'; });
  return list.length ? list[list.length - 1] : null;
}
/** Scope sub-skills in skill-map order, starting at begin_sub (then the rest, then wrapping round). */
function tsSubs_(ts) {
  var ord = skillIdx_().order, list = clean_(ts.subskills).split(',').map(function (x) { return x.trim(); }).filter(function (u) { return skillIdx_().sub[u]; });
  list.sort(function (a, b) { return (ord[a] || 999) - (ord[b] || 999); });
  var i = list.indexOf(clean_(ts.begin_sub));
  return i > 0 ? list.slice(i).concat(list.slice(0, i)) : list;
}
/** Level to serve in a sub-skill (#13, BRAIN §5 #32): starts at EXACTLY the teacher's level; inside this assignment the
 *  same rule as Practice moves it up (step credit of this assignment's answers at ≥ that level; steps_to_move_up → next
 *  level; H is the top). The student's own progress (mastery) is not changed by this — it follows the normal replay. */
function tsLevel_(ts, code, sub, mine) {
  var t = clean_(ts.level).toUpperCase(); if (!/^[EMH]$/.test(t)) return progressOf_(code, sub).level;
  var sid = clean_(ts.session_id), need = Number(getSettings_().steps_to_move_up) || 3, lv = lvIdx_(t), steps = 0;
  (mine || attemptsOf_(code)).filter(function (a) { return clean_(a.session_id) === sid && clean_(a.subskill) === String(sub) && clean_(a.status) === 'done'; })
    .sort(function (a, b) { return toMs_(a.finished_at) - toMs_(b.finished_at) || a._row - b._row; })
    .forEach(function (a) {
      if (lv >= 2 || lvIdx_(a.difficulty) < lv) return;
      steps += stepCredit_(clean_(a.result), clean_(a.pace) === 'slow');
      if (steps >= need) { lv++; steps = 0; }
    });
  return LV_[lv];
}
/** What to serve next in an assignment: the teacher's chosen question (begin question first, then Assign next), else the
 *  first not-solid scope sub-skill that has live questions, at tsLevel_. */
function tsPick_(ts, code, mine) {
  var sid = clean_(ts.session_id), used = mine.filter(function (a) { return clean_(a.session_id) === sid; });
  var forced = clean_(ts.next_qid) || (!used.length ? clean_(ts.begin_qid) : '');
  if (forced) { var fr = questionRow_(forced); if (fr && clean_(fr.status) === 'live') return { sub: clean_(fr.subskill), level: tsLevel_(ts, code, clean_(fr.subskill), mine), qid: forced }; }
  var live = liveBySub_(), subs = tsSubs_(ts), withQ = subs.filter(function (u) { return live[u]; });
  if (!withQ.length) return { msg: 'No questions here yet.' };
  for (var i = 0; i < withQ.length; i++) if (!progressOf_(code, withQ[i]).solid) return { sub: withQ[i], level: tsLevel_(ts, code, withQ[i], mine) };
  return { done_all: true, msg: 'Every sub-skill here is solid.' };
}
/** A chosen question was served: Assign next is used up (the begin question is used up by the first attempt itself). */
function tsUsed_(ts, qid) {
  if (clean_(ts.next_qid) === String(qid)) dataUpdate_(TAB.TEACHER_SESSIONS, ts._row, { next_qid: '', note: 'next ' + qid + ' served ' + nowIso_().slice(11, 16) });
}
/** Home card data for the student. */
function tsCard_(ts, code) {
  var subs = tsSubs_(ts), live = liveBySub_(), next = '';
  for (var i = 0; i < subs.length && !next; i++) if (live[subs[i]] && !progressOf_(code, subs[i]).solid) next = subs[i];
  return { session_id: clean_(ts.session_id), n: subs.length, next_name: next ? subskillName_(next) : '', solid: subs.filter(function (u) { return progressOf_(code, u).solid; }).length };
}

/* =========================== student =========================== */
function tsTypKey_(code) { return 'msb_ts_typ_' + normCode_(code); }
/** Browser call (student): what is typed / chosen on the open question now (sent on change, debounced). Cache only. */
function liveTyping(code, attemptId, typed) {
  cachedReads_();
  var st = requireStudent_(code), a = attemptRow_(st.student_code, attemptId);
  if (clean_(a.status) !== 'open') return { ok: false };
  try { CacheService.getScriptCache().put(tsTypKey_(st.student_code), JSON.stringify({ a: String(attemptId), t: String(typed || '').slice(0, 40), at: Date.now() }), 21600); } catch (e) {}
  return { ok: true };
}

/* =========================== teacher =========================== */
/** Browser call: tab "With teacher" — students with their open assignment + the skill tree for the Assign form. */
function tsHome(code, fresh) {
  if (fresh) freshReads_(); else cachedReads_();
  requireTeacher_(code);
  var studs = studentList_().filter(function (s) { return s.active; }).map(function (s) {
    var ts = tsOpenFor_(s.code), o = { code: s.code, name: s.name, open: null };
    if (ts) {
      var subs = tsSubs_(ts), nx = clean_(ts.next_qid) ? questionRow_(clean_(ts.next_qid)) : null;
      o.open = { session_id: clean_(ts.session_id), subs: subs.map(function (u) { return { id: u, name: subskillName_(u) }; }), level: clean_(ts.level), begin_sub: clean_(ts.begin_sub),
                 begin_qid: clean_(ts.begin_qid), next_qid: clean_(ts.next_qid), next_name: nx ? subskillName_(clean_(nx.subskill)) : '', since: dateStr_(ts.created_at),
                 done: dataFilter_(TAB.ATTEMPTS, function (a) { return clean_(a.session_id) === clean_(ts.session_id) && clean_(a.status) === 'done'; }).length };
    }
    return o;
  });
  return { ok: true, read_at: fmtDate_(new Date(), 'HH:mm:ss'), students: studs, tree: skillTree_() };
}
/** Browser call: assign "Practise with teacher". An older open one of the same student is closed. */
function tsStart(code, student, subIds, level, beginSub, beginQid) {
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    freshReads_(); requireTeacher_(code);
    var c = normCode_(student), st = findStudent_(c);
    if (!st || !isYes_(st.active)) throw new Error('SESSION: Student not found or locked.');
    var idx = skillIdx_(), subs = (subIds || []).map(String).filter(function (u, i, a) { return idx.sub[u] && a.indexOf(u) === i; });
    if (!subs.length) throw new Error('SESSION: Tick at least one sub-skill.');
    var lv = String(level || '').toUpperCase(); if (!/^[EMH]$/.test(lv)) lv = 'E';
    var b = subs.indexOf(String(beginSub)) >= 0 ? String(beginSub) : '';
    var bq = String(beginQid || '');
    if (bq) { var r = questionRow_(bq); if (!r || clean_(r.status) !== 'live' || subs.indexOf(clean_(r.subskill)) < 0) throw new Error('SESSION: The first question is not live in these sub-skills.'); if (!b) b = clean_(r.subskill); }
    dataFilter_(TAB.TEACHER_SESSIONS, function (r) { return normCode_(r.student_code) === c && clean_(r.status) === 'open'; })
      .forEach(function (r) { dataUpdate_(TAB.TEACHER_SESSIONS, r._row, { status: 'closed', closed_at: nowIso_(), note: 'replaced' }); });
    dataAppend_(TAB.TEACHER_SESSIONS, [{ session_id: newId_('T'), student_code: c, subskills: txt_(subs.join(',')), level: lv, begin_sub: txt_(b), begin_qid: txt_(bq),
                                         next_qid: '', next_set_at: '', status: 'open', created_at: nowIso_(), closed_at: '', note: '' }]);
    return tsHome(code, true);
  } finally { lock.releaseLock(); }
}
/** Browser call: close an assignment (the card leaves the student's home; an unanswered open question stays as it is). */
function tsClose(code, sid) {
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    freshReads_(); requireTeacher_(code);
    var r = tsRow_(sid); if (!r) throw new Error('SESSION: Not found.');
    if (clean_(r.status) === 'open') dataUpdate_(TAB.TEACHER_SESSIONS, r._row, { status: 'closed', closed_at: nowIso_() });
    return tsHome(code, true);
  } finally { lock.releaseLock(); }
}

/** Browser call: Live / Refresh — the question the student is on now (their latest attempt of the open assignment; else
 *  their latest attempt anywhere), what is typed / chosen (cache), the tries, the key (teacher only). Read on demand only. */
function tsLive(code, student) {
  freshReads_(); requireTeacher_(code);
  var c = normCode_(student), st = findStudent_(c);
  if (!st) throw new Error('SESSION: Student not found.');
  var ts = tsOpenFor_(c), sid = ts ? clean_(ts.session_id) : '';
  var mine = attemptsOf_(c).filter(function (a) { return clean_(a.status) !== 'skipped'; }).sort(function (a, b) { return a._row - b._row; });
  var inTs = sid ? mine.filter(function (a) { return clean_(a.session_id) === sid; }) : [];
  var cur = (inTs.length ? inTs : mine).slice(-1)[0] || null;
  var out = { ok: true, student: { code: c, name: String(st.name || c) }, read_at: fmtDate_(new Date(), 'HH:mm:ss'), session: null, current: null };
  if (ts) {
    var nx = clean_(ts.next_qid) ? questionRow_(clean_(ts.next_qid)) : null;
    out.session = { session_id: sid, subs: tsSubs_(ts).map(function (u) { return { id: u, name: subskillName_(u) }; }), level: clean_(ts.level),
                    next_qid: clean_(ts.next_qid), next_name: nx ? subskillName_(clean_(nx.subskill)) + ' · ' + clean_(nx.difficulty) : '' };
  }
  if (!cur) return out;
  var q = libQuestion_(clean_(cur.qid)); if (!q) return out;
  var t = {}; try { t = JSON.parse(CacheService.getScriptCache().get(tsTypKey_(c)) || '{}'); } catch (e) {}
  var p = progressOf_(c, clean_(cur.subskill)), open = clean_(cur.status) === 'open';
  out.current = { attempt_id: clean_(cur.attempt_id), in_session: !!sid && clean_(cur.session_id) === sid, kind: clean_(cur.kind), q: clientQuestion_(q), answer: answerText_(q),
                  hint_html: q.hint_html || '', subskill: subskillName_(clean_(cur.subskill)), difficulty: clean_(cur.difficulty), status: clean_(cur.status), result: clean_(cur.result),
                  tries: triesOf_(cur.attempt_id).map(function (x) { return { a: clean_(x.answer), ok: isYes_(x.correct) }; }), max_tries: maxTries_(cur), hint: isYes_(cur.hint_used),
                  typed: open && t.a === clean_(cur.attempt_id) ? t.t : '', typed_ago: open && t.a === clean_(cur.attempt_id) && t.at ? Math.round((Date.now() - t.at) / 1000) : null,
                  sec: open ? Math.max(0, Math.round((Date.now() - toMs_(cur.started_at)) / 1000)) : Number(cur.time_total_sec) || 0, progress: progressLabel_(p) };
  return out;
}

/** Browser call: questions to choose from for Assign next / the first question — one sub-skill at one level. */
function tsCandidates(code, student, sub, level) {
  cachedReads_(); requireTeacher_(code);
  var c = normCode_(student), lv = String(level || '').toUpperCase(), seen = {};
  attemptsOf_(c).forEach(function (a) { if (clean_(a.status) === 'done') seen[clean_(a.qid)] = (seen[clean_(a.qid)] || 0) + 1; });
  var rows = livePool_().filter(function (r) { return clean_(r.subskill) === String(sub) && (!/^[EMH]$/.test(lv) || clean_(r.difficulty).toUpperCase() === lv); })
    .sort(function (a, b) { return (seen[clean_(a.qid)] || 0) - (seen[clean_(b.qid)] || 0) || (Number(a.level) || 1) - (Number(b.level) || 1) || (clean_(a.qid) < clean_(b.qid) ? -1 : 1); })
    .slice(0, 15);
  return { ok: true, items: rows.map(function (r) {
    var q = libQuestion_(clean_(r.qid)), txt = q ? String(q.stem_html || '').replace(/<svg[\s\S]*?<\/svg>/g, ' [figure] ').replace(/<[^>]+>/g, ' ').replace(/\\[()]/g, '').replace(/\s+/g, ' ').trim() : '';
    return { qid: clean_(r.qid), difficulty: clean_(r.difficulty), level: Number(r.level) || 1, seen: seen[clean_(r.qid)] || 0, preview: txt.slice(0, 110) };
  }) };
}
/** Browser call: Assign next — the student's NEXT question is this one (once); then the app picks again. */
function tsAssignNext(code, student, qid) {
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    freshReads_(); requireTeacher_(code);
    var c = normCode_(student), ts = tsOpenFor_(c);
    if (!ts) throw new Error('SESSION: Assign "Practise with teacher" to this student first.');
    var r = questionRow_(qid); if (!r || clean_(r.status) !== 'live') throw new Error('SESSION: This question is not live.');
    dataUpdate_(TAB.TEACHER_SESSIONS, ts._row, { next_qid: txt_(qid), next_set_at: nowIso_() });
    return tsLive(code, c);
  } finally { lock.releaseLock(); }
}
