/**
 * MSB — Sheet update after a new version (SAT Math Lib / Test Zone pattern). Runs once per deploy (stamp = APP_VERSION +
 * APP_BUILD, the commit id the Action writes into Code.gs). Each step is safe to repeat:
 *   tabs → settings → texts → time norms → skills (seed from the skill map, re-runnable) → library → check → cache
 * Then Settings row `code_version` = the stamp. Who starts it: (1) the GitHub Action opens <web app>?update=1;
 * (2) fallback: run updateAfterNewVersion in the Apps Script editor (also the one-time authorization).
 */
var UPDATE_SETTING = 'code_version';
var UPDATE_PREFIX = 'MSB update: ';

function stamp_() { return APP_VERSION + ' · ' + APP_BUILD; }

function runUpdateIfNeeded_() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return UPDATE_PREFIX + 'busy (another update is running) · ' + stamp_();
  try {
    if (String(currentStamp_().value) === stamp_()) return UPDATE_PREFIX + 'already up to date · ' + stamp_();
    return UPDATE_PREFIX + doUpdate_().status + ' · ' + stamp_();
  } finally { lock.releaseLock(); }
}

/** Editor (owner): always runs. Also the function Minh runs once to give the app its permissions. */
function updateAfterNewVersion() {
  requireEditor_();
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try { var r = doUpdate_(); console.log(r.line); } finally { lock.releaseLock(); }
}
/** Editor: seed / re-seed the Skills tab from Skills.gs only (after a new skill map). */
function reseedSkills() { requireEditor_(); _forceFresh = true; console.log(syncSkills_()); }

function currentStamp_() {
  try { return dataFind_(TAB.SETTINGS, function (r) { return String(r.key).trim() === UPDATE_SETTING; }) || { _row: 0, value: '' }; }
  catch (e) { return { _row: 0, value: '' }; }
}

function doUpdate_() {
  var steps = [['tabs', ensureTabs_], ['settings', ensureSettingsRows_], ['texts', syncSheetTexts_], ['time norms', ensureTimeNorms_],
               ['skills', syncSkills_], ['library', syncLibrary_], ['check', checkSheet_], ['cache', flushTabCache_]];
  var notes = [], failed = 0, log = [];
  _forceFresh = true; freshReads_();
  steps.forEach(function (s) {
    try { var msg = String(s[1]() || ''); log.push('[' + s[0] + '] ' + msg); notes.push(msg); }
    catch (err) { failed++; notes.push(s[0] + ' FAILED'); log.push('[' + s[0] + '] FAILED: ' + (err && err.stack || err)); }
  });
  _forceFresh = false;
  console.log('UPDATE ' + stamp_() + '\n' + log.join('\n'));
  var line = nowIso_() + ' · ' + notes.join(' · ');
  if (!failed) writeStamp_(line);
  return { status: failed ? 'FAILED (' + failed + ' step(s), see Apps Script Executions log)' : 'done', line: line, log: log };
}

function writeStamp_(line) {
  var cur = currentStamp_();
  var fields = { key: UPDATE_SETTING, value: txt_(stamp_()), meaning: 'Code version the Sheet was last updated for. Last run: ' + line.slice(0, 1500) };
  if (cur._row) dataUpdate_(TAB.SETTINGS, cur._row, fields); else dataAppend_(TAB.SETTINGS, [fields]);
}
