/**
 * MSB — THE data layer (spec §4, BRAIN §5 "one data-layer module"). Every Sheet read and write in the app goes through
 * the data*_ functions below; nothing else calls SpreadsheetApp (tests/structure_test.js checks it). Tab names live only
 * in TAB. To move to another store later (e.g. Supabase), only this file changes.
 * Rules (SAT lessons): columns by header name, never position; new columns only appended at the END; read a row right
 * before writing it; one row = one record, no formulas / merged cells in data tabs.
 * Speed (copied from SAT Math Lib #42): a tab is read at most once per call (memo) and read-only calls take a snapshot
 * from CacheService (version token per tab; any write through this file or a hand edit (onEdit) makes a new token;
 * ?flush=1 drops all). Calls that write always read the Sheet itself (row numbers must be exact).
 */

var TAB = {
  README: 'README', DICTIONARY: 'Dictionary', SETTINGS: 'Settings',
  STUDENTS: 'Students', CLASSES: 'Classes',
  SKILLS: 'Skills', PATHS: 'Paths',
  QUESTIONS: 'Questions', BATCHES: 'Batches', ITEM_OVERRIDES: 'Item_Overrides', TIME_NORMS: 'Time_Norms',
  ATTEMPTS: 'Attempts', TRIES: 'Tries', HINTS: 'Hints', REVIEW: 'Review', SKILL_STATUS: 'Skill_Status', LEVEL_OVERRIDES: 'Level_Overrides'
};

/* ---------------- spreadsheet ---------------- */
var _ss = null;
function ss_() {
  if (!_ss) {
    try { var a = SpreadsheetApp.getActiveSpreadsheet(); if (a && a.getId() === SHEET_ID) _ss = a; } catch (e) {}
    if (!_ss) _ss = SpreadsheetApp.openById(SHEET_ID); // web app context
  }
  return _ss;
}
function sheet_(name) {
  var sh = ss_().getSheetByName(name);
  if (!sh) throw new Error('Missing tab: ' + name);
  return sh;
}

/* ---------------- snapshots (SAT #42, prefix msb) ---------------- */
var _tables = {}, _readMode = 'fresh', TAB_CACHE_SEC = 900, TAB_CHUNK = 90000, EPOCH_KEY_ = 'msbv__epoch';
var _forceFresh = false;
var PRELOAD_TABS_ = [TAB.SETTINGS, TAB.STUDENTS, TAB.CLASSES, TAB.SKILLS, TAB.PATHS, TAB.QUESTIONS, TAB.BATCHES, TAB.ITEM_OVERRIDES,
                     TAB.TIME_NORMS, TAB.ATTEMPTS, TAB.TRIES, TAB.HINTS, TAB.REVIEW, TAB.SKILL_STATUS, TAB.LEVEL_OVERRIDES];
var REF_TABS_ = [TAB.SETTINGS, TAB.SKILLS, TAB.QUESTIONS, TAB.BATCHES, TAB.ITEM_OVERRIDES, TAB.TIME_NORMS];
var _pre = null;
/** Read-only call: use snapshots (no Sheet open). */
function cachedReads_() { if (_forceFresh) return; _readMode = 'cached'; preloadTabs_(); }
/** Teacher "Refresh" and the update: always read the Sheet itself. */
function freshReads_() { _readMode = 'fresh'; _tables = {}; _pre = null; }
function preloadTabs_() {
  _pre = null;
  try { var keys = [EPOCH_KEY_]; PRELOAD_TABS_.forEach(function (n) { keys.push(tabVerKey_(n), tabHeadKey_(n)); }); _pre = CacheService.getScriptCache().getAll(keys) || {}; } catch (e) { _pre = null; }
}
/** Simple trigger: a hand edit in the Sheet → that tab's snapshot is out of date. */
function onEdit(e) { try { tabChanged_(e.range.getSheet().getName()); } catch (x) {} }
function tabVerKey_(name) { return 'msbv_' + name; }
function tabHeadKey_(name) { return 'msbh_' + name; }
function tabChanged_(name) {
  delete _tables[name]; _pre = null;
  try { CacheService.getScriptCache().put(tabVerKey_(name), newToken_(), 21600); } catch (e) {}
}
function flushTabCache_() {
  _tables = {}; _pre = null;
  try { CacheService.getScriptCache().put(EPOCH_KEY_, newToken_(), 21600); } catch (e) {}
  return 'cache: flushed';
}
function newToken_() { return String(Date.now()) + Math.random().toString(36).slice(2, 6); }
function tabToken_(name, got, c, make) {
  var v = got[tabVerKey_(name)], e = got[EPOCH_KEY_];
  if (make && (!v || !e)) {
    var put = {}; if (!v) put[tabVerKey_(name)] = v = newToken_(); if (!e) put[EPOCH_KEY_] = e = newToken_();
    c.putAll(put, 21600);
  }
  return v && e ? v + '@' + e : null;
}
function tabFromCache_(name) {
  try {
    var c = CacheService.getScriptCache(), hk = tabHeadKey_(name);
    var g = _pre && PRELOAD_TABS_.indexOf(name) >= 0 ? _pre : (c.getAll([tabVerKey_(name), hk, EPOCH_KEY_]) || {});
    var v = tabToken_(name, g, c, false), head = g[hk];
    if (!v || !head) return null;
    var nl = head.indexOf('\n'), meta = JSON.parse(head.slice(0, nl));
    if (meta.v !== v || !(meta.n >= 1)) return null;
    var parts = [head.slice(nl + 1)];
    if (meta.n > 1) {
      var keys = []; for (var i = 1; i < meta.n; i++) keys.push('msbt_' + name + '_' + v + '_' + i);
      var got = c.getAll(keys) || {};
      for (var j = 0; j < keys.length; j++) { if (got[keys[j]] === undefined || got[keys[j]] === null) return null; parts.push(got[keys[j]]); }
    }
    var o = JSON.parse(parts.join(''), function (k, val) { return val && typeof val === 'object' && '$d' in val ? new Date(val.$d) : val; });
    return tableObj_(name, o.headers, o.rows);
  } catch (e) { return null; }
}
function tabToCache_(name, t, ver) {
  try {
    var c = CacheService.getScriptCache(), v = ver;
    if (!v) return;
    var rows = t.rows.map(function (r) { var o = {}; Object.keys(r).forEach(function (k) { var x = r[k]; o[k] = Object.prototype.toString.call(x) === '[object Date]' ? { $d: x.getTime() } : x; }); return o; });
    var s = JSON.stringify({ headers: t.headers, rows: rows }), put = {}, n = Math.ceil(s.length / TAB_CHUNK) || 1;
    if (n > 60) return;
    for (var i = 1; i < n; i++) put['msbt_' + name + '_' + v + '_' + i] = s.slice(i * TAB_CHUNK, (i + 1) * TAB_CHUNK);
    put[tabHeadKey_(name)] = JSON.stringify({ v: v, n: n }) + '\n' + s.slice(0, TAB_CHUNK);
    c.putAll(put, TAB_CACHE_SEC);
  } catch (e) {}
}
function tableObj_(name, headers, rows) {
  var idx = {}; headers.forEach(function (h, i) { if (h && !(h in idx)) idx[h] = i; });
  return { name: name, headers: headers, idx: idx, rows: rows };
}
function readTable_(name) {
  if (_tables[name]) return _tables[name];
  var t = null, ver = null;
  if (_readMode === 'cached' || (!_forceFresh && REF_TABS_.indexOf(name) >= 0)) {
    t = tabFromCache_(name);
    if (t) return (_tables[name] = t);
  }
  try { var c = CacheService.getScriptCache(); ver = tabToken_(name, c.getAll([tabVerKey_(name), EPOCH_KEY_]) || {}, c, true); } catch (e) {}
  t = readTableSheet_(name);
  tabToCache_(name, t, ver);
  return (_tables[name] = t);
}
function readTableSheet_(name) {
  var sh = sheet_(name);
  var lastRow = sh.getLastRow(), lastCol = sh.getLastColumn();
  if (lastCol < 1) return tableObj_(name, [], []);
  var values = sh.getRange(1, 1, Math.max(lastRow, 1), lastCol).getValues();
  var headers = values[0].map(function (h) { return String(h).trim(); });
  var rows = [];
  for (var r = 1; r < values.length; r++) {
    var row = values[r], empty = true;
    for (var c = 0; c < row.length; c++) { if (row[c] !== '' && row[c] !== null) { empty = false; break; } }
    if (empty) continue;
    var o = { _row: r + 1 };
    headers.forEach(function (h, i) { if (h) o[h] = row[i]; });
    rows.push(o);
  }
  return tableObj_(name, headers, rows);
}
function headers_(name) {
  var sh = sheet_(name), lastCol = sh.getLastColumn();
  if (lastCol < 1) return [];
  return sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h).trim(); });
}
function ensureGrid_(sh, lastRowNeeded, lastColNeeded) {
  var maxR = sh.getMaxRows();
  if (lastRowNeeded > maxR) sh.insertRowsAfter(maxR, lastRowNeeded - maxR + 500);
  if (lastColNeeded) { var maxC = sh.getMaxColumns(); if (lastColNeeded > maxC) sh.insertColumnsAfter(maxC, lastColNeeded - maxC); }
}
function rowsFor_(headers, objs) {
  return objs.map(function (o) { return headers.map(function (h) { return (h in o && o[h] !== undefined && o[h] !== null) ? o[h] : ''; }); });
}
/** A value read back from the Sheet, written again as the same text ("3/4" must not become a date, "=…" never a formula). */
function keepCell_(v) {
  if (typeof v !== 'string' || v === '') return v;
  return (/^[=+\-@]/.test(v) || /^-?\d+([.\/]\d+)?$/.test(v) || /^\d{1,2}\/\d{1,2}(\/\d{2,4})?$/.test(v) || /^\d{4}-\d{2}-\d{2}/.test(v)) ? "'" + v : v;
}
function checkTab_(name) {
  for (var k in TAB) if (TAB[k] === name) return name;
  throw new Error('Unknown tab: ' + name + ' (use TAB.*)');
}

/* ================= public API of the data layer (everything else uses only these) ================= */

/** All non-empty rows of a tab: [{_row, <header>: value, …}]. */
function dataRows_(tab) { return readTable_(checkTab_(tab)).rows; }
/** Headers + rows. */
function dataTable_(tab) { var t = readTable_(checkTab_(tab)); return { headers: t.headers, rows: t.rows }; }
/** First row where pred(row) is true, or null. */
function dataFind_(tab, pred) { var r = dataRows_(tab); for (var i = 0; i < r.length; i++) if (pred(r[i])) return r[i]; return null; }
/** Rows where pred(row) is true. */
function dataFilter_(tab, pred) { return dataRows_(tab).filter(pred); }

/** Append objects as rows (keys mapped to headers by name; unknown keys ignored). */
function dataAppend_(tab, objs) {
  checkTab_(tab);
  if (!objs || !objs.length) return;
  var sh = sheet_(tab), headers = headers_(tab), data = rowsFor_(headers, objs), start = sh.getLastRow() + 1;
  try {
    ensureGrid_(sh, start + data.length - 1, headers.length);
    sh.getRange(start, 1, data.length, headers.length).setValues(data);
    tabChanged_(tab);
  } catch (e) { console.error('WRITE FAILED dataAppend_(' + tab + ', ' + data.length + ' rows at row ' + start + '): ' + e); throw e; }
}
/** Update named fields of one row (1-based Sheet row). The row is read right before it is written; other cells kept. */
function dataUpdate_(tab, rowNum, fields) {
  checkTab_(tab);
  var sh = sheet_(tab), headers = headers_(tab);
  var cur = sh.getRange(rowNum, 1, 1, headers.length).getValues()[0].map(keepCell_), changed = false;
  headers.forEach(function (h, i) { if (h in fields && fields[h] !== undefined) { cur[i] = fields[h] === null ? '' : fields[h]; changed = true; } });
  try { if (changed) { sh.getRange(rowNum, 1, 1, headers.length).setValues([cur]); tabChanged_(tab); } }
  catch (e) { console.error('WRITE FAILED dataUpdate_(' + tab + ', row ' + rowNum + '): ' + e); throw e; }
}
/** Rewrite a script-built tab: keep rows where keep(row), then add newObjs (Test Zone safe order). */
function dataRewrite_(tab, keep, newObjs) {
  checkTab_(tab);
  var t = readTableSheet_(tab), headers = t.headers, sh = sheet_(tab);
  var kept = t.rows.filter(keep).map(function (o) { return headers.map(function (h) { return keepCell_(h in o ? o[h] : ''); }); });
  var all = kept.concat(rowsFor_(headers, newObjs)), oldLast = sh.getLastRow();
  if (all.length) { ensureGrid_(sh, 1 + all.length, headers.length); sh.getRange(2, 1, all.length, headers.length).setValues(all); }
  var newLast = 1 + all.length;
  if (oldLast > newLast) sh.getRange(newLast + 1, 1, oldLast - newLast, headers.length).clearContent();
  tabChanged_(tab);
}

/* ---------------- structure (used by Setup.gs / SheetText.gs only) ---------------- */
function dataHasTab_(tab) { return !!ss_().getSheetByName(tab); }
/** Create a tab if missing; append missing header columns at the END. Returns {made, added}. */
function dataEnsureTab_(tab, cols) {
  checkTab_(tab);
  var ss = ss_(), made = false;
  var s1 = ss.getSheetByName('Sheet1') || ss.getSheetByName('Trang tính1');
  if (tab === TAB.README && s1 && !ss.getSheetByName(TAB.README) && s1.getLastRow() === 0) { s1.setName(TAB.README); made = true; }
  var sh = ss.getSheetByName(tab);
  if (!sh) { sh = ss.insertSheet(tab); made = true; }
  if (!cols) return { made: made, added: 0 };
  var have = sh.getLastColumn() ? sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(function (h) { return String(h).trim(); }) : [];
  var miss = cols.filter(function (h) { return have.indexOf(h) < 0; });
  if (miss.length) {
    ensureGrid_(sh, 2, have.length + miss.length);
    sh.getRange(1, have.length + 1, 1, miss.length).setValues([miss]).setFontWeight('bold');
    try { sh.setFrozenRows(1); } catch (e) {}
    tabChanged_(tab);
  }
  return { made: made, added: miss.length };
}
function dataHeaders_(tab) { checkTab_(tab); return headers_(tab); }
/** Write a text tab (README): column A lines, first line bold. */
function dataWriteText_(tab, lines) {
  checkTab_(tab);
  var sh = sheet_(tab), old = sh.getLastRow();
  ensureGrid_(sh, lines.length + 1, 1);
  if (old) sh.getRange(1, 1, old, 1).clearContent();
  sh.getRange(1, 1, lines.length, 1).setValues(lines.map(function (l) { return [l]; }));
  sh.getRange(1, 1).setFontWeight('bold');
  tabChanged_(tab);
}
