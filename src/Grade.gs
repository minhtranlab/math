/**
 * MSB — grading. ONE source for server and browser: the functions in GRADE_SHARED_ are sent to the page as text
 * (gradeClientJs_, written into Index.html), so the instant ✓/✗ in the browser uses exactly the server's rules. The server
 * still re-grades every try (Practice.gs submitTry) and only that is stored.
 *
 * Answer spec of one question (server only, except encoded for the ONE open question):
 *   { t: 'mcq' | 'num', k: [keys], r: rounding rule, u: unit }
 *   mcq: k = ['B'] (letter). num: k = ['7.88', …] (accepted values), r = '3sf' | '2sf' | '1dp' | '2dp' | 'int' | 'exact'.
 * Numeric rule (BRAIN §5 Questions): the question always states the rounding; an answer is right when, rounded the way the
 * question asks, it equals the key, and it is at least that precise ("more precise answers are accepted": 7.884 for 3 s.f.
 * key 7.88 ✓; 7.9 ✗). A unit or "x =" typed around the number is ignored ("7.88 cm", "35°", "x = 4").
 */

function msbParseNum_(s) {
  var t = String(s === undefined || s === null ? '' : s).trim().toLowerCase().replace(/−/g, '-').replace(/\s+/g, ' ');
  t = t.replace(/^[a-zθ]{1,6}\s*=\s*/, '');                                   // "x = 4", "angle = 35"
  if (/^-?\d+,\d+$/.test(t.split(' ')[0])) t = t.replace(',', '.');          // 7,88 → 7.88 (one comma, no dot)
  var m = /^([+-]?)(\d+)\/(\d+)(.*)$/.exec(t);
  var rest, v, dec, sf;
  if (m) {
    if (Number(m[3]) === 0) return null;
    v = (m[1] === '-' ? -1 : 1) * Number(m[2]) / Number(m[3]); dec = 99; sf = 99; rest = m[4];
  } else {
    m = /^([+-]?)(\d*)(?:\.(\d*))?(.*)$/.exec(t);
    if (!m || !(m[2] + (m[3] || '')).length) return null;
    var ip = m[2] || '', fp = m[3] || '';
    v = (m[1] === '-' ? -1 : 1) * Number((ip || '0') + '.' + (fp || '0'));
    dec = fp.length;
    var digits = (ip + fp).replace(/^0+/, '');
    sf = digits.length || 1;
    rest = m[4];
  }
  rest = String(rest || '').trim();
  if (rest && !/^(°|º|deg|degrees?|cm|mm|m|km|cm²|m²|km²|mm²|cm\^2|m\^2|km\^2|mm\^2|cm2|m2|units?|square units)\.?$/.test(rest)) return null;
  return { v: v, dec: dec, sf: sf };
}

function msbRoundSf_(x, n) {
  if (x === 0) return 0;
  var p = n - 1 - Math.floor(Math.log(Math.abs(x)) / Math.LN10);
  var f = Math.pow(10, p);
  return Math.round(x * f + (x > 0 ? 1e-9 : -1e-9)) / f;
}
function msbRoundDp_(x, n) { var f = Math.pow(10, n); return Math.round(x * f + (x > 0 ? 1e-9 : -1e-9)) / f; }

function msbNumMatch_(answer, key, rule) {
  var a = msbParseNum_(answer), k = msbParseNum_(key);
  if (!a || !k) return false;
  var tiny = Math.abs(a.v - k.v) <= 1e-9 * Math.max(1, Math.abs(k.v));
  if (tiny) return true;
  var r = String(rule || 'exact').toLowerCase(), m = /^(\d)(sf|dp)$/.exec(r);
  if (r === 'int') m = ['0dp', '0', 'dp'];
  if (!m) return false;                                                       // 'exact' and not equal
  var n = Number(m[1]);
  if (m[2] === 'sf') return a.sf >= n && msbRoundSf_(a.v, n) === msbRoundSf_(k.v, n);
  return a.dec >= n && msbRoundDp_(a.v, n) === msbRoundDp_(k.v, n);
}

/** true / false for one answer against an answer spec {t, k, r}. */
function msbGrade_(spec, answer) {
  if (!spec || answer === undefined || answer === null || String(answer).trim() === '') return false;
  var keys = Array.isArray(spec.k) ? spec.k : [spec.k];
  if (spec.t === 'mcq') return keys.some(function (k) { return String(k).trim().toUpperCase() === String(answer).trim().toUpperCase(); });
  return keys.some(function (k) { return msbNumMatch_(answer, k, spec.r); });
}

var GRADE_SHARED_ = [msbParseNum_, msbRoundSf_, msbRoundDp_, msbNumMatch_, msbGrade_];
/** Source text of the shared grading functions, for the page (Index.html). */
function gradeClientJs_() { return GRADE_SHARED_.map(function (f) { return f.toString(); }).join('\n'); }

/** Answer spec of a library question (Sheet key wins over the file, see Library.gs libQuestions_). */
function answerSpec_(q) {
  var t = (q.type || 'mcq') === 'mcq' ? 'mcq' : 'num';
  var k = Array.isArray(q.key) ? q.key.slice() : (q.key === undefined || q.key === null || q.key === '' ? [] : [q.key]);
  (q.accepted || []).forEach(function (a) { if (k.indexOf(a) < 0) k.push(a); });
  var a = q.answer || {};
  return { t: t, k: k.map(String), r: a.round || (t === 'num' ? 'exact' : ''), u: a.unit || '' };
}
/** What the student sees after the 2nd wrong try: the correct answer (no solution). */
function answerText_(q) {
  var s = answerSpec_(q);
  if (s.t === 'mcq') {
    var ch = (q.choices || []).filter(function (c) { return String(c.label).toUpperCase() === String(s.k[0]).toUpperCase(); })[0];
    return { label: s.k[0], html: ch ? ch.html : '' };
  }
  return { label: '', html: s.k[0] + (s.u ? (s.u === '°' ? '°' : ' ' + s.u) : '') };
}

/** SAT Math Lib #43: a key for the browser, never plain: JSON → UTF-8 → XOR with the salt (attempt|qid) + position → hex.
 *  Only ever for the ONE question the student has open. Obfuscation only — the server re-grades everything that counts. */
function encKey_(obj, salt) {
  var t = unescape(encodeURIComponent(JSON.stringify(obj))), out = '';
  salt = String(salt || 'msb');
  for (var i = 0; i < t.length; i++) { var c = (t.charCodeAt(i) ^ salt.charCodeAt(i % salt.length) ^ (37 + i * 11) % 251) & 255; out += (c < 16 ? '0' : '') + c.toString(16); }
  return out;
}
