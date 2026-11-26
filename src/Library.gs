/**
 * MSB — the question library (private, on Drive) + its Sheet tabs. Copied from SAT Math Lib Library.gs, then cut.
 *
 * Drive (folder LIBRARY_FOLDER_ID "MSB - Library", private): questions/<BATCH>.json — one file per batch, text + keys.
 * Batch file: {batch, title, source_type, schema: "msb.q/0.1", live_default?, questions: [item…]} — item fields: spec §7.
 * Server only: batch text is cached in CacheService (chunks, 6 h, keyed by file id + last-updated time). A question reaches
 * a browser only through clientQuestion_() (whitelist) for the student's own open attempt — never the key, accepted forms,
 * mistake types, tags, source or solution.
 * Sheet tabs kept in step by syncLibrary_ / syncSkills_ (every deploy):
 *   Batches   one row per batch file (a new batch is live = No unless its file says live_default "Yes")
 *   Questions one row per question, NO text: tags, key (a key Minh types wins over the file), status
 *   Skills    the skill map (Skills.gs, generated from the project's skillmap/<topic>.json) — safe to re-run
 */

var LIB_QUESTIONS_FOLDER = 'questions';
var CACHE_CHUNK = 90000;

function cacheGetBig_(base) {
  var cache = CacheService.getScriptCache(), n = Number(cache.get(base + '_n'));
  if (!(n > 0)) return null;
  var keys = []; for (var i = 0; i < n; i++) keys.push(base + '_' + i);
  var got = cache.getAll(keys), parts = [];
  for (var j = 0; j < n; j++) { if (got[keys[j]] == null) return null; parts.push(got[keys[j]]); }
  return parts.join('');
}
function cachePutBig_(base, text) {
  var put = {}, k = 0;
  for (var p = 0; p < text.length; p += CACHE_CHUNK) put[base + '_' + (k++)] = text.slice(p, p + CACHE_CHUNK);
  put[base + '_n'] = String(k);
  try { CacheService.getScriptCache().putAll(put, 21600); } catch (e) { console.warn('cache put failed: ' + e); }
}

/** {BATCH: 'fileId|lastUpdatedMs'} for every questions/<BATCH>.json. Cached 10 min (an empty or failed read never is). */
var _libIdx = null;
function libIndex_(fresh) {
  if (_libIdx && !fresh) return _libIdx;
  var cache = CacheService.getScriptCache();
  if (!fresh) { var hit = cache.get('msb_lib_idx'); if (hit) { var h = JSON.parse(hit); if (h && Object.keys(h).length) return (_libIdx = h); } }
  var idx = {}, ok = false;
  try {
    var fit = DriveApp.getFolderById(LIBRARY_FOLDER_ID).getFoldersByName(LIB_QUESTIONS_FOLDER);
    while (fit.hasNext()) {
      var it = fit.next().getFiles();
      while (it.hasNext()) {
        var f = it.next(), m = /^([A-Za-z0-9][A-Za-z0-9_-]*)\.json$/.exec(f.getName());
        if (!m || f.isTrashed()) continue;
        var t = f.getLastUpdated().getTime();
        if (!idx[m[1]] || t > Number(idx[m[1]].split('|')[1])) idx[m[1]] = f.getId() + '|' + t;
      }
    }
    ok = true;
  } catch (err) { console.error('LIBRARY FOLDER NOT READABLE: ' + err); }
  if (!ok || !Object.keys(idx).length) return idx;
  cache.put('msb_lib_idx', JSON.stringify(idx), 600);
  return (_libIdx = idx);
}

var _batch = {};
function libBatch_(batch) {
  if (Object.prototype.hasOwnProperty.call(_batch, batch)) return _batch[batch];
  var ref = libIndex_()[batch];
  if (!ref) return (_batch[batch] = null);
  var base = 'msb_b_' + ref.replace(/[^A-Za-z0-9]/g, '_');
  var text = cacheGetBig_(base);
  if (text === null) { text = DriveApp.getFileById(ref.split('|')[0]).getBlob().getDataAsString('UTF-8'); cachePutBig_(base, text); }
  var data = JSON.parse(text);
  if (String(data.batch) !== batch) throw new Error('Library file ' + batch + '.json holds batch ' + data.batch);
  return (_batch[batch] = data);
}

/** One question (deep copy) with the Sheet key on top when Minh typed one. null when not found. */
function libQuestion_(qid) {
  var r = questionRow_(qid);
  if (!r) return null;
  var data = libBatch_(clean_(r.batch));
  var q = data && (data.questions || []).filter(function (x) { return x.qid === String(qid); })[0];
  if (!q) return null;
  q = JSON.parse(JSON.stringify(q));
  var k = sheetKey_(r, q);
  if (k) { q.key = k.key; if (k.accepted) q.accepted = k.accepted; }
  return q;
}
/** The Questions-tab key when Minh changed it (≠ key_file = what the file said last time); else null (file wins). */
function sheetKey_(r, q) {
  var v = clean_(r.key), kf = clean_(r.key_file), af = clean_(r.accepted_file), acc = clean_(r.accepted);
  if (!v) return null;
  if (kf && v === kf && acc === af) return null;
  var accepted = acc.split('|').map(function (x) { return x.trim(); }).filter(String);
  return { key: (q.type || 'mcq') === 'mcq' ? v.toUpperCase() : v, accepted: accepted.length ? accepted : null };
}

/** What the browser may see of a question (whitelist). Never: key, accepted, answer.round, mistake_type, tags, source. */
function clientQuestion_(q) {
  return {
    qid: q.qid, type: (q.type || 'mcq') === 'mcq' ? 'mcq' : 'num', stem_html: q.stem_html || '',
    figures: (q.figures || []).map(function (f) { return { src: f.src || '', alt: f.alt || '', width: f.width || '' }; }).filter(function (f) { return f.src; }),
    choices: (q.choices || []).map(function (c) { return { label: c.label, html: c.html }; }),
    unit: (q.answer && q.answer.unit) || '', has_hint: !!q.hint_html
  };
}

/* ---------------- Questions / Batches rows ---------------- */
var _qrows = null, _batchLive = null;
/** Item_Overrides on top of the Questions tab: a teacher's difficulty / status for one question (latest row wins). */
function questionRows_() {
  if (_qrows) return _qrows;
  var ov = {};
  dataRows_(TAB.ITEM_OVERRIDES).forEach(function (r) {
    var q = clean_(r.qid); if (!q) return;
    var o = ov[q] = ov[q] || {};
    var d = clean_(r.difficulty).toUpperCase(); if (/^[EMH]$/.test(d)) o.difficulty = d;
    var s = clean_(r.status).toLowerCase(); if (/^(live|hold|excluded)$/.test(s)) o.status = s;
  });
  _qrows = dataRows_(TAB.QUESTIONS).map(function (r) {
    var o = ov[clean_(r.qid)]; if (!o) return r;
    var c = {}; Object.keys(r).forEach(function (k) { c[k] = r[k]; });
    if (o.difficulty) { c.file_difficulty = r.difficulty; c.difficulty = o.difficulty; }
    if (o.status) c.status = o.status;
    return c;
  });
  return _qrows;
}
function questionRow_(qid) { var q = String(qid); return questionRows_().filter(function (r) { return clean_(r.qid) === q; })[0] || null; }
function batchLive_() {
  if (_batchLive) return _batchLive;
  _batchLive = {};
  dataRows_(TAB.BATCHES).forEach(function (r) { _batchLive[clean_(r.batch)] = isYes_(r.live); });
  return _batchLive;
}
/** Questions a student can be served: status live (its hint reviewed), version A, batch live. */
function livePool_() {
  var live = batchLive_();
  return questionRows_().filter(function (r) {
    return clean_(r.status || 'live').toLowerCase() === 'live' && clean_(r.version || 'A').toUpperCase() !== 'B' && live[clean_(r.batch)];
  });
}

/* ---------------- skills (Skills.gs) ---------------- */
var _skillIdx = null;
function skillIdx_() {
  if (_skillIdx) return _skillIdx;
  var o = { topic: {}, skill: {}, sub: {}, subOf: {}, order: {} };
  dataRows_(TAB.SKILLS).forEach(function (r, i) {
    var t = clean_(r.topic), s = clean_(r.skill), u = clean_(r.subskill);
    o.topic[t] = clean_(r.topic_name); o.skill[s] = clean_(r.skill_name);
    if (u) { o.sub[u] = clean_(r.subskill_name); o.subOf[u] = s; o.order[u] = Number(r.order) || i + 1; }
  });
  return (_skillIdx = o);
}
function subskillName_(id) { return skillIdx_().sub[String(id)] || String(id || ''); }
function skillName_(id) { return skillIdx_().skill[String(id)] || String(id || ''); }

/* ---------------- sync: library → Batches + Questions, skill map → Skills ---------------- */

function questionRowFromFile_(batch, q) {
  var t = q.tags || {}, a = q.answer || {};
  var st = clean_(q.status || 'keep').toLowerCase(), hs = clean_(q.hint_status || (q.hint_html ? 'draft' : 'none')).toLowerCase();
  var status = st === 'excluded' ? 'excluded' : st === 'candidate' ? 'candidate' : (hs === 'draft' ? 'hold' : 'live');
  return {
    qid: q.qid, batch: batch, version: q.version || 'A', version_of: q.version_of || '', type: (q.type || 'mcq') === 'mcq' ? 'mcq' : 'num',
    topic: txt_(t.topic || ''), skill: txt_(t.skill || ''), subskill: txt_(t.subskill || ''), difficulty: t.difficulty || '', level: t.level || '',
    key: txt_(q.key), accepted: txt_((q.accepted || []).join('|')), round: txt_(a.round || ''), unit: txt_(a.unit || ''),
    hint_status: hs, template: q.params ? 'Yes' : '', code: txt_(q.code || ''), status: status, added_at: nowIso_(),
    note: hs === 'draft' ? 'hint not reviewed yet' : ''
  };
}
var FILE_OWNED_ = ['batch', 'version', 'version_of', 'type', 'topic', 'skill', 'subskill', 'difficulty', 'level', 'round', 'unit', 'hint_status', 'template', 'code'];

/** Library → Sheet (SAT rules): new qids get a row; file-owned columns follow the file; a key Minh typed stays; a qid
 *  that left its file → excluded. Status live ↔ hold follows the hint review (unreviewed hints never go live). */
function syncLibrary_() {
  _libIdx = null; try { CacheService.getScriptCache().remove('msb_lib_idx'); } catch (e) {}
  var idx = libIndex_(true), batches = Object.keys(idx).sort();
  if (!batches.length) return 'library: no batch files on Drive yet';
  var qt = dataTable_(TAB.QUESTIONS), have = {}, fileRow = {}, read = {}, add = [], counts = {}, failed = 0;
  qt.rows.forEach(function (r) { have[clean_(r.qid)] = r; });
  batches.forEach(function (b) {
    var data;
    try { data = libBatch_(b); } catch (e) { console.error('LIBRARY ' + b + ': ' + e.message); failed++; return; }
    if (!data) return;
    read[b] = 1;
    counts[b] = { title: data.title || b, source_type: data.source_type || '', n: 0, live_default: isYes_(data.live_default) ? 'Yes' : 'No' };
    (data.questions || []).forEach(function (q) {
      if (!q || !q.qid) return;
      counts[b].n++;
      var row = questionRowFromFile_(b, q);
      fileRow[q.qid] = row;
      if (!have[q.qid]) { row.key_file = row.key; row.accepted_file = row.accepted; add.push(row); have[q.qid] = row; }
    });
  });
  var changed = 0, kept = [];
  qt.rows.forEach(function (r) {
    var o = {}; qt.headers.forEach(function (h) { if (h) o[h] = r[h]; });
    var f = fileRow[clean_(r.qid)], ch = false;
    if (f) {
      FILE_OWNED_.forEach(function (k) { if (k in o && clean_(o[k]) !== clean_(f[k])) { o[k] = f[k]; ch = true; } });
      [['key', 'key_file'], ['accepted', 'accepted_file']].forEach(function (p) {
        var cur = clean_(o[p[0]]), was = clean_(o[p[1]]), now = clean_(f[p[0]]);
        if (cur === was && now !== cur) { o[p[0]] = f[p[0]]; ch = true; }
        if (now !== was) { o[p[1]] = f[p[0]]; ch = true; }
      });
      var st = clean_(o.status).toLowerCase();
      if ((st === 'live' || st === 'hold' || st === 'candidate' || !st) && st !== f.status) { o.status = f.status; o.note = f.note; ch = true; }
    } else if (read[clean_(r.batch)] && clean_(o.status).toLowerCase() !== 'excluded') {
      o.status = 'excluded'; o.note = 'not in file ' + nowIso_().slice(0, 10); ch = true;
    }
    if (ch) changed++;
    kept.push(o);
  });
  if (changed) dataRewrite_(TAB.QUESTIONS, function () { return false; }, kept.map(function (o) { var x = {}; Object.keys(o).forEach(function (k) { x[k] = keepCell_(o[k]); }); return x; }));
  dataAppend_(TAB.QUESTIONS, add);
  _qrows = null;
  var nLive = {};
  dataRows_(TAB.QUESTIONS).forEach(function (r) { if (clean_(r.status) === 'live') nLive[clean_(r.batch)] = (nLive[clean_(r.batch)] || 0) + 1; });
  var bRows = {}, newB = [];
  dataRows_(TAB.BATCHES).forEach(function (r) { bRows[clean_(r.batch)] = r; });
  Object.keys(counts).forEach(function (b) {
    var c = counts[b], f = { batch: b, title: c.title, source_type: c.source_type, n_items: c.n, n_live: nLive[b] || 0,
                             uploaded_at: fmtDate_(new Date(Number(idx[b].split('|')[1])), 'yyyy-MM-dd HH:mm'), file_id: idx[b].split('|')[0] };
    if (bRows[b]) dataUpdate_(TAB.BATCHES, bRows[b]._row, f);
    else { f.live = c.live_default; f.note = c.live_default === 'Yes' ? 'sample batch: live from the start' : 'new batch: set live = Yes to serve it'; newB.push(f); }
  });
  dataAppend_(TAB.BATCHES, newB);
  _batchLive = null;
  return 'library: ' + batches.length + ' batch file(s), questions added: ' + add.length + ', rows refreshed: ' + changed +
         (newB.length ? ', new batches: ' + newB.map(function (x) { return x.batch + ' (live ' + x.live + ')'; }).join(' ') : '') + (failed ? ', ' + failed + ' unreadable (log)' : '');
}

/** Skills tab = Skills.gs (SKILLMAP_). Safe to re-run: Minh's `active` and `note` are kept per sub-skill; a sub-skill that
 *  left the map stays as a row with active "No" (its attempts keep their meaning). */
function syncSkills_() {
  var map = typeof SKILLMAP_ !== 'undefined' ? SKILLMAP_ : { version: '', rows: [] };
  var old = {}; dataRows_(TAB.SKILLS).forEach(function (r) { old[clean_(r.subskill)] = r; });
  var seen = {}, rows = map.rows.map(function (r, i) {
    var o = old[r.subskill] || {};
    seen[r.subskill] = 1;
    return { topic: txt_(r.topic), topic_name: r.topic_name, skill: txt_(r.skill), skill_name: r.skill_name, subskill: txt_(r.subskill),
             subskill_name: r.subskill_name, prereq: txt_((r.prereq || []).join(', ')), order: i + 1,
             active: clean_(o.active) && !/not in map/.test(clean_(o.note)) ? o.active : 'Yes', map_version: txt_(map.version), note: /not in map/.test(clean_(o.note)) ? '' : (o.note || '') };
  });
  Object.keys(old).forEach(function (k) {
    if (!k || seen[k]) return;
    var o = old[k];
    rows.push({ topic: txt_(o.topic), topic_name: o.topic_name, skill: txt_(o.skill), skill_name: o.skill_name, subskill: txt_(k), subskill_name: o.subskill_name,
                prereq: txt_(o.prereq), order: rows.length + 1, active: 'No', map_version: txt_(o.map_version), note: 'not in map ' + clean_(map.version) });
  });
  dataRewrite_(TAB.SKILLS, function () { return false; }, rows);
  _skillIdx = null;
  return 'skills: ' + map.rows.length + ' sub-skills from map ' + map.version + (rows.length > map.rows.length ? ', ' + (rows.length - map.rows.length) + ' old row(s) kept as active = No' : '');
}
