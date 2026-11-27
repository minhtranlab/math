/**
 * Math Skill Bank (MSB) — server (Google Apps Script web app).
 * Copied from SAT Math Lib (github.com/minhtranlab/satmath @ db7dc1f, v0.17.2), then cut — no shared code link.
 * -------------------------------------------------------------------------------------------------------------------
 * A student practises ONE question at a time, on the sub-skills of their path (topic → skill → sub-skill).
 * Two tries per question; after the 2nd wrong try the answer is shown (no solution) and the item goes to the review list.
 * Files:  Code.gs (web app, settings, small helpers) · Data.gs (THE data layer: tab names + every Sheet read/write)
 *         Auth.gs (sign-in, lock-out) · Grade.gs (grading rules shared with the browser, encoded key) · Library.gs (Drive
 *         question library, Questions/Batches/Skills sync) · Practice.gs (student calls) · Teacher.gs (teacher calls)
 *         Setup.gs (tabs + columns) · Update.gs (per-deploy Sheet update) · SheetText.gs (README / Dictionary / meanings)
 *         Skills.gs (GENERATED skill map) · Index/Styles/Api/Client/TeacherPage.html (browser; Api.html = the api.js wrapper)
 * Browser → server calls (only these): login · homeData · mySkills · nextQuestion · submitTry · useHint · reviewList ·
 *   teacherHome · teacherPathData · teacherSetPath · teacherGrid · teacherCell · teacherSetLevel ·
 *   Practise with teacher (#9 v2): liveTyping (student) · tsHome · tsStart · tsClose · tsLive · tsCandidates · tsAssignNext (teacher)
 * The answer key never leaves the server except the ONE open question, encoded (Grade.gs encKey_); the server re-grades
 * every try (submitTry) and that is what is stored.
 * Source of truth: github.com/minhtranlab/math (PUBLIC: code only). Question data + keys live in the private Drive folder.
 */

var SHEET_ID = '1EPtPXzl8hsxJU1IVe5V7ud_SrlyB4GHqdb_cy2G-ufM';          // "MSB – Data" (My Drive › 📚 Academics › Math Skill Bank)
var LIBRARY_FOLDER_ID = '1c9Mz7_tKbQ5-qZOSu2nxNR8TnAhi0-P3';             // "MSB - Library" (private): questions/<BATCH>.json
var APP_NAME = 'Math Skill Bank';
var APP_VERSION = 'v0.4.0 (2026-11-27, #9 v2 Practise with teacher: Live + Refresh, Assign next, pen, calculator, notes, More space, Snapshot)';
var APP_BUILD = 'dev';  // replaced by the GitHub Action with the commit id → the Sheet update (Update.gs) runs once per deploy

/* ============================== web app ============================== */

function doGet(e) {
  var p = (e && e.parameter) || {};
  // Called by the GitHub Action right after each deploy: runs the Sheet update once per new version (Update.gs).
  // One status line only (no Sheet data), so it is safe on the public URL.
  if (p.update === '1') return ContentService.createTextOutput(runUpdateIfNeeded_()).setMimeType(ContentService.MimeType.TEXT);
  // After editing the Sheet with another tool (no onEdit): ?flush=1 drops every snapshot. One status line, no data.
  if (p.flush === '1') {
    var fc = CacheService.getScriptCache(), msg = 'wait 10 s';
    if (!fc.get('msb_flush')) { fc.put('msb_flush', '1', 10); msg = flushTabCache_(); }
    return ContentService.createTextOutput(APP_NAME + ' ' + msg).setMimeType(ContentService.MimeType.TEXT);
  }
  var t = HtmlService.createTemplateFromFile('Index');
  return t.evaluate()
    .setTitle(getSettings_().app_name || APP_NAME)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);   // GitHub Pages shows the app in a frame
}

/** Page settings the browser may know: the Desmos key (client-side by design, like SAT Math Lib). */
function pageConfigJs_() {
  var k = String(getSettings_().desmos_api_key || '').replace(/[^A-Za-z0-9]/g, '') || 'dcb31709b452b1cf9dc26972add0fda6';   // empty = Desmos demo key
  return 'window.MSB_CFG = ' + JSON.stringify({ desmos: k }) + ';';
}

function include(name) {
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}

/* ============================== settings ============================== */
// Every number of the engine is a Settings row (spec §6). Values typed in the Sheet win; these are the first values.
var SETTINGS_DEFAULTS_ = {
  app_name: APP_NAME, teacher_code: '',
  max_tries: 2,                         // tries per question; after the last wrong try the answer is shown
  right_fast_credit: 1,                 // pilot progression (spec §5): right on try 1 and in time = 1 step
  right_slow_credit: 0.5,               //   right on try 1 but slow = ½ step
  right_try2_credit: 0,                 //   right on try 2 = stay
  wrong_credit: 0,                      //   wrong twice = stay (never down)
  steps_to_move_up: 3,                  //   steps needed at E (or M) to move up one level (BRAIN #18)
  steps_to_solid: 3,                    //   steps needed at H to be "solid"
  start_level: 'E',                     //   every sub-skill starts easy
  hint_counts: 'No',                    //   a hint does not change the step (it is logged and shown to the teacher)
  fallback_target_sec: 90, slow_ratio: 1.5,   // used only when Time_Norms has no row for an item
  round_length: '3sf', round_angle: '1dp',    // default rounding of template items (the question always says it)
  review_after: 'wrong_twice',
  away_min_sec: 2, away_flag_sec: 20,   // leaving the window: logged silently from 2 s; shown to the teacher from 20 s (SML #16, lesson 13)
  ms_window_days: 60,                   // My skills: first-try % over the last 60 days
  class_max_tries: 3,                   // Practise with teacher (#9 v2): tries before the answer is shown
  desmos_api_key: ''                    // Desmos calculator key (type it in the Sheet; empty = Desmos demo key)
};
var _settings = null;
function getSettings_() {
  if (_settings) return _settings;
  var out = {};
  Object.keys(SETTINGS_DEFAULTS_).forEach(function (k) { out[k] = SETTINGS_DEFAULTS_[k]; });
  try {
    dataRows_(TAB.SETTINGS).forEach(function (r) {
      var k = String(r.key || '').trim();
      if (!k) return;
      var v = r.value;
      if (typeof out[k] === 'number') { var n = Number(v); if (v !== '' && !isNaN(n)) out[k] = n; }
      else if (v !== '' && v !== null && v !== undefined) out[k] = String(v).trim();
    });
  } catch (e) { /* defaults */ }
  if (!out.app_name) out.app_name = APP_NAME;
  return (_settings = out);
}

/* ============================== small helpers ============================== */
function nowIso_() { return Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd HH:mm:ss'); }
function fmtDate_(d, pattern) { return Utilities.formatDate(d, Session.getScriptTimeZone() || 'Asia/Ho_Chi_Minh', pattern); }
function round_(x, d) { var p = Math.pow(10, d || 0); return Math.round(x * p) / p; }
function normCode_(c) { return String(c || '').trim().toUpperCase(); }
/** Force text in Sheets (so "6.10" or "3/4" is not turned into a number / date). */
function txt_(v) { return (v === null || v === undefined || v === '') ? '' : "'" + String(v); }
function clean_(v) { return String(v === undefined || v === null ? '' : v).replace(/^'/, '').trim(); }
function isYes_(v) { var s = String(v).trim().toLowerCase(); return s === 'yes' || s === 'y' || s === 'true' || s === '1' || v === true; }
function toMs_(v) {
  if (!v) return 0;
  if (Object.prototype.toString.call(v) === '[object Date]') return v.getTime();
  var d = new Date(String(v).replace(' ', 'T') + (/[zZ+]/.test(String(v).slice(10)) ? '' : '+07:00'));
  return isNaN(d.getTime()) ? 0 : d.getTime();
}
/** Dates shown in the app: "06 Nov, 19:52". */
function dateStr_(v) { var ms = toMs_(v); return ms ? fmtDate_(new Date(ms), 'dd MMM, HH:mm') : ''; }
function newId_(prefix) { return prefix + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 5).toUpperCase(); }
