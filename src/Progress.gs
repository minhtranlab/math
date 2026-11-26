/**
 * MSB — path progress per student × sub-skill (spec v0.2 §5; BRAIN §5 #18). ONE rule, replayed from the data:
 *   events = the student's finished Attempts of that sub-skill (finished_at) + teacher Level_Overrides (set_at), oldest first
 *   start  : level `start_level` (E), steps 0
 *   attempt: credit = step_credit stored with the attempt (right 1st try in time 1 · slow ½ · 2nd try 0 · wrong twice 0);
 *            it COUNTS only when the item's difficulty ≥ the level at that moment (an easier stand-in item gives 0)
 *            E/M: steps ≥ steps_to_move_up → next level, steps 0 · H: steps ≥ steps_to_solid → Solid · never down
 *   override: set_to E/M/H → that level, steps 0 (Solid off) · set_to solid → Solid
 * Position on the My skills ladder = 3 × level index + steps (0 … 8.5), Solid = 9. A Solid sub-skill stays Solid.
 * Skill_Status (one row per student × sub-skill) is only a summary written after every change; the replay is the truth,
 * so gains ("this week") are the same replay cut at an earlier time.
 */

var LV_ = ['E', 'M', 'H'];
function lvIdx_(d) { var i = LV_.indexOf(String(d || '').toUpperCase()); return i < 0 ? 0 : i; }

/** Events of every student × sub-skill, grouped once per call: {"CODE|SUB": [ev…]} (attempts first on equal times). */
var _progEv = null;
function progressEvents_() {
  if (_progEv) return _progEv;
  var by = {};
  function add(k, e) { (by[k] = by[k] || []).push(e); }
  dataRows_(TAB.ATTEMPTS).forEach(function (a) {
    if (clean_(a.status) !== 'done') return;
    add(normCode_(a.student_code) + '|' + clean_(a.subskill), { t: toMs_(a.finished_at), k: 0, row: a._row, a: a });
  });
  dataRows_(TAB.LEVEL_OVERRIDES).forEach(function (o) {
    var to = clean_(o.set_to).toUpperCase();
    if (!/^(E|M|H|SOLID)$/.test(to)) return;
    add(normCode_(o.student_code) + '|' + clean_(o.subskill), { t: toMs_(o.set_at), k: 1, row: o._row, set: to, by: clean_(o.set_by) });
  });
  Object.keys(by).forEach(function (k) { by[k].sort(function (x, y) { return x.t - y.t || x.k - y.k || x.row - y.row; }); });
  return (_progEv = by);
}
function progressReset_() { _progEv = null; }

/** Replay one student × sub-skill up to untilMs (default now). */
function progressOf_(code, sub, untilMs) {
  var s = getSettings_(), up = Number(s.steps_to_move_up) || 3, solidN = Number(s.steps_to_solid) || 3;
  var st = { level: LV_[lvIdx_(s.start_level)], steps: 0, solid: false, n: 0, right1: 0, wrong2: 0, hints: 0, last: 0, hist: [], override: '', touched: false };
  var evs = progressEvents_()[normCode_(code) + '|' + String(sub)] || [], until = untilMs || Infinity;
  evs.forEach(function (e) {
    if (e.t > until) return;
    st.touched = true;
    var day = e.t ? fmtDate_(new Date(e.t), 'dd MMM') : '';
    if (e.k === 1) {
      if (e.set === 'SOLID') { if (!st.solid) st.hist.push('set Solid ' + day); st.solid = true; }
      else { st.hist.push('set ' + e.set + ' ' + day); st.level = e.set; st.steps = 0; st.solid = false; }
      st.override = e.set === 'SOLID' ? 'Solid' : e.set; return;
    }
    var a = e.a, res = clean_(a.result);
    st.n++; st.last = Math.max(st.last, e.t);
    if (isYes_(a.try1_correct)) st.right1++;
    if (res === 'wrong_2') st.wrong2++;
    if (isYes_(a.hint_used)) st.hints++;
    if (st.solid) return;
    var credit = Number(a.step_credit) || 0;
    if (credit <= 0 || lvIdx_(a.difficulty) < lvIdx_(st.level)) return;
    st.steps += credit;
    if (st.level !== 'H' && st.steps >= up) { st.hist.push(st.level + '→' + LV_[lvIdx_(st.level) + 1] + ' ' + day); st.level = LV_[lvIdx_(st.level) + 1]; st.steps = 0; }
    else if (st.level === 'H' && st.steps >= solidN) { st.hist.push('H→Solid ' + day); st.solid = true; }
  });
  st.status = st.solid ? 'solid' : st.n || st.override ? 'practising' : 'not started';
  st.position = st.solid ? 9 : 3 * lvIdx_(st.level) + Math.min(st.steps, (st.level === 'H' ? solidN : up) - 0.5);
  st.need = st.solid ? 0 : (st.level === 'H' ? solidN : up);
  return st;
}
/** Would the next right answer count at this level? (credit counts only for items at or above the level) */
function creditCounts_(difficulty, level) { return lvIdx_(difficulty) >= lvIdx_(level); }

/** Write the Skill_Status summary row of one student × sub-skill (read the row right before writing it). */
function writeStatus_(code, sub, p) {
  var c = normCode_(code), row = dataFind_(TAB.SKILL_STATUS, function (r) { return normCode_(r.student_code) === c && clean_(r.subskill) === String(sub); });
  var f = { student_code: c, subskill: txt_(sub), level: p.solid ? 'H' : p.level, steps: p.steps, status: p.status, n_attempts: p.n, n_right1: p.right1,
            n_wrong2: p.wrong2, n_hints: p.hints, last_at: p.last ? fmtDate_(new Date(p.last), 'yyyy-MM-dd HH:mm:ss') : '', updated_at: nowIso_(),
            position: p.position, history: txt_(p.hist.join(' · ')), override: p.override };
  if (row) dataUpdate_(TAB.SKILL_STATUS, row._row, f); else dataAppend_(TAB.SKILL_STATUS, [f]);
}
function refreshStatus_(code, sub) { progressReset_(); var p = progressOf_(code, sub); writeStatus_(code, sub, p); return p; }

/** Short student-facing words for a progress state. */
function progressLabel_(p) {
  if (p.solid) return 'Solid';
  var names = { E: 'Easy', M: 'Medium', H: 'Hard' };
  return names[p.level] + ' · ' + p.steps + ' of ' + p.need;
}
