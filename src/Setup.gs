/**
 * MSB — the Sheet's tabs and columns (spec §6). The per-deploy update (Update.gs) creates missing tabs and appends missing
 * columns at the END of row 1; it never moves, renames or deletes anything Minh typed. One row = one record; IDs; no
 * formulas or merged cells in data tabs. Editor-only functions refuse to run through the web app (requireEditor_).
 */

var TABS_ = [
  [TAB.README, null],
  [TAB.SETTINGS, ['key', 'value', 'meaning']],
  [TAB.STUDENTS, ['student_code', 'name', 'active', 'classes', 'created_in', 'created_at', 'note']],
  [TAB.CLASSES, ['class_id', 'name', 'student_codes', 'active', 'created_in', 'note']],
  [TAB.SKILLS, ['topic', 'topic_name', 'skill', 'skill_name', 'subskill', 'subskill_name', 'prereq', 'order', 'active', 'map_version', 'note']],
  [TAB.PATHS, ['student_code', 'target_type', 'target_id', 'active', 'added_at', 'added_by', 'note']],
  [TAB.SKILL_STATUS, ['student_code', 'subskill', 'level', 'steps', 'status', 'n_attempts', 'n_right1', 'n_wrong2', 'n_hints', 'last_at', 'updated_at']],
  [TAB.ATTEMPTS, ['attempt_id', 'student_code', 'kind', 'scope', 'qid', 'subskill', 'skill', 'difficulty', 'started_at', 'finished_at', 'status',
                  'n_tries', 'try1_correct', 'correct', 'result', 'answer_shown', 'hint_used', 'n_hints', 'time_try1_sec', 'time_total_sec',
                  'slow_above_sec', 'pace', 'step_credit', 'device', 'note']],
  [TAB.TRIES, ['attempt_id', 'student_code', 'qid', 'try_no', 'answer', 'correct', 'mistake_type', 'time_sec', 'client_said', 'at']],
  [TAB.HINTS, ['attempt_id', 'student_code', 'qid', 'subskill', 'after_tries', 'at']],
  [TAB.REVIEW, ['student_code', 'qid', 'subskill', 'attempt_id', 'reason', 'added_at', 'status', 'cleared_at', 'cleared_by', 'note']],
  [TAB.QUESTIONS, ['qid', 'batch', 'version', 'version_of', 'type', 'topic', 'skill', 'subskill', 'difficulty', 'level', 'key', 'accepted', 'round',
                   'unit', 'hint_status', 'template', 'code', 'status', 'added_at', 'note', 'key_file', 'accepted_file']],
  [TAB.BATCHES, ['batch', 'title', 'source_type', 'n_items', 'n_live', 'uploaded_at', 'live', 'file_id', 'note']],
  [TAB.ITEM_OVERRIDES, ['qid', 'difficulty', 'status', 'set_by', 'set_at', 'note']],
  [TAB.TIME_NORMS, ['difficulty', 'qtype', 'target_sec', 'slow_above_sec', 'note']],
  [TAB.DICTIONARY, ['tab', 'column', 'meaning', 'example']]
];

/** Editor-only guard (Test Zone): through the web app the active user is empty while the effective user is the owner. */
function requireEditor_() {
  var a = '', e = '';
  try { a = String(Session.getActiveUser().getEmail() || ''); } catch (x) {}
  try { e = String(Session.getEffectiveUser().getEmail() || ''); } catch (x) {}
  if (e && a.toLowerCase() !== e.toLowerCase()) throw new Error('Run this function from the Apps Script editor.');
}
function checkSheet() { requireEditor_(); console.log(checkSheet_()); }
function syncLibrary() { requireEditor_(); _forceFresh = true; console.log(syncLibrary_()); }

function ensureTabs_() {
  var made = [], cols = 0;
  TABS_.forEach(function (t) { var r = dataEnsureTab_(t[0], t[1]); if (r.made) made.push(t[0]); cols += r.added; });
  return 'tabs: ' + (made.length ? 'created ' + made.join(', ') : 'all there') + (cols ? ' · columns added: ' + cols : '');
}

/** Settings rows the code needs (value only when the row is new; Minh's values are never changed). */
function ensureSettingsRows_() {
  var have = {};
  dataRows_(TAB.SETTINGS).forEach(function (r) { have[String(r.key).trim()] = r; });
  var add = [];
  Object.keys(SETTINGS_DEFAULTS_).forEach(function (k) {
    if (have[k]) { if (SETTING_MEANINGS_[k] && String(have[k].meaning) !== SETTING_MEANINGS_[k]) dataUpdate_(TAB.SETTINGS, have[k]._row, { meaning: SETTING_MEANINGS_[k] }); return; }
    var v = SETTINGS_DEFAULTS_[k];
    add.push({ key: k, value: (typeof v === 'number' ? v : txt_(v)), meaning: SETTING_MEANINGS_[k] || '' });
  });
  dataAppend_(TAB.SETTINGS, add);
  _settings = null;
  return 'settings: ' + (add.length ? add.length + ' rows added' : 'all there');
}

/** Default time norms (spec §5, open question Q1): only rows that are missing are added; Minh's numbers stay. */
var TIME_NORMS_DEFAULT_ = [
  ['E', 'mcq', 45, 70], ['E', 'num', 60, 90], ['M', 'mcq', 90, 135], ['M', 'num', 120, 180], ['H', 'mcq', 150, 225], ['H', 'num', 180, 270]
];
function ensureTimeNorms_() {
  var have = {}; dataRows_(TAB.TIME_NORMS).forEach(function (r) { have[clean_(r.difficulty).toUpperCase() + '|' + clean_(r.qtype).toLowerCase()] = 1; });
  var add = TIME_NORMS_DEFAULT_.filter(function (n) { return !have[n[0] + '|' + n[1]]; }).map(function (n) {
    return { difficulty: n[0], qtype: n[1], target_sec: n[2], slow_above_sec: n[3], note: 'default (spec v0.1)' };
  });
  dataAppend_(TAB.TIME_NORMS, add);
  return 'time norms: ' + (add.length ? add.length + ' rows added' : 'all there');
}

/** Read-only check: every tab + its columns; Questions vs Batches; student codes unique; paths point at real IDs. */
function checkSheet_() {
  var problems = [];
  TABS_.forEach(function (t) {
    if (!dataHasTab_(t[0])) { problems.push('missing tab ' + t[0]); return; }
    if (!t[1]) return;
    var have = dataHeaders_(t[0]);
    t[1].forEach(function (h) { if (have.indexOf(h) < 0) problems.push(t[0] + ': missing column ' + h); });
  });
  try {
    var b = {}; dataRows_(TAB.BATCHES).forEach(function (r) { b[clean_(r.batch)] = 1; });
    var orphan = dataRows_(TAB.QUESTIONS).filter(function (r) { return !b[clean_(r.batch)]; }).length;
    if (orphan) problems.push(orphan + ' Questions rows whose batch is not in Batches');
    var codes = {}; dataRows_(TAB.STUDENTS).forEach(function (r) { var c = normCode_(r.student_code); if (c && codes[c]) problems.push('student code twice: ' + c); codes[c] = 1; });
    var idx = skillIdx_();
    dataRows_(TAB.PATHS).forEach(function (p) { var id = clean_(p.target_id); if (id && !idx.sub[id] && !idx.skill[id]) problems.push('Paths row ' + p._row + ': unknown ID ' + id); });
    dataRows_(TAB.QUESTIONS).forEach(function (q) { var u = clean_(q.subskill); if (u && !idx.sub[u]) problems.push('Questions ' + clean_(q.qid) + ': unknown sub-skill ' + u); });
  } catch (e) { problems.push('check failed: ' + e.message); }
  return problems.length ? 'checkSheet → ' + problems.length + ' problem(s): ' + problems.slice(0, 12).join('; ') : 'checkSheet: all good';
}
