/**
 * MSB — sign-in (copied from SAT Math Lib / Test Zone): a student types their code; the teacher types Settings.teacher_code
 * on the same box (never stored on the device). Lock-out: 10 wrong codes in 15 min → that code and that device wait 15 min;
 * 30 wrong codes in 15 min from anywhere → every sign-in waits 5 min.
 */

function findStudent_(code) {
  code = normCode_(code);
  if (!code) return null;
  return dataFind_(TAB.STUDENTS, function (r) { return normCode_(r.student_code) === code; });
}

function requireStudent_(code) {
  var keys = loginKeys_(code, '');
  var st = findStudent_(code);
  if (!st && loginLockedAll_()) throw new Error('LOGIN: ' + LOCK_ALL_MSG);
  if (loginLocked_(keys)) throw new Error('LOGIN: ' + LOCK_MSG);
  if (!st) loginFailed_(keys);
  if (!st || !isYes_(st.active)) throw new Error('LOGIN: This code is not valid or is locked. Ask your teacher.');
  return st;
}

var LOGIN_MAX_FAILS = 10, LOGIN_WINDOW_MS = 15 * 60 * 1000;
var LOCK_MSG = 'Too many wrong codes. Wait 15 minutes, then try again.';
function loginKeys_(code, deviceId) {
  var c = String(code || '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '_').slice(0, 60);
  var d = String(deviceId || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 60);
  var k = ['msb_lf_c_' + c];
  if (d) k.push('msb_lf_d_' + d);
  return k;
}
function failTimes_(cache, key, now) {
  var v = []; try { v = JSON.parse(cache.get(key) || '[]'); } catch (e) {}
  return (Array.isArray(v) ? v : []).filter(function (t) { return now - Number(t) < LOGIN_WINDOW_MS; });
}
var LOGIN_ALL_MAX = 30, LOGIN_ALL_WAIT_MS = 5 * 60 * 1000, ALL_KEY = 'msb_lf_all', ALL_LOCK_KEY = 'msb_lf_all_lock';
var LOCK_ALL_MSG = 'Too many wrong codes were tried. Sign-in is paused for 5 minutes. Please try again later.';
function loginLockedAll_() { return Date.now() < (Number(CacheService.getScriptCache().get(ALL_LOCK_KEY)) || 0); }
function loginLocked_(keys) {
  var cache = CacheService.getScriptCache(), now = Date.now();
  return keys.some(function (k) { return failTimes_(cache, k, now).length >= LOGIN_MAX_FAILS; });
}
function loginFailed_(keys) {
  var cache = CacheService.getScriptCache(), now = Date.now();
  var all = failTimes_(cache, ALL_KEY, now); all.push(now);
  try { cache.put(ALL_KEY, JSON.stringify(all.slice(-(LOGIN_ALL_MAX + 5))), 1800); } catch (e) {}
  if (all.length >= LOGIN_ALL_MAX) { try { cache.put(ALL_LOCK_KEY, String(now + LOGIN_ALL_WAIT_MS), 600); cache.put(ALL_KEY, '[]', 1800); } catch (e) {} }
  keys.forEach(function (k) { var t = failTimes_(cache, k, now); t.push(now); try { cache.put(k, JSON.stringify(t.slice(-50)), 1800); } catch (e) {} });
}

function isTeacherCode_(code) {
  var t = String(getSettings_().teacher_code || '').trim().toUpperCase();
  return !!t && t.length >= 4 && String(code || '').trim().toUpperCase() === t;
}
function requireTeacher_(code) { if (!isTeacherCode_(code)) throw new Error('LOGIN: Teacher code not valid.'); }

/** Browser call. Student → {ok, student, home}; teacher → {ok, teacher: true}. */
function login(code, deviceId, withHome) {
  cachedReads_();
  var keys = loginKeys_(code, deviceId);
  if (loginLockedAll_()) return { ok: false, locked: true, msg: LOCK_ALL_MSG };
  if (loginLocked_(keys)) return { ok: false, locked: true, msg: LOCK_MSG };
  if (isTeacherCode_(code)) return { ok: true, teacher: true, app_name: getSettings_().app_name, version: APP_VERSION };
  var st = findStudent_(code);
  if (!st) {
    loginFailed_(keys);
    return { ok: false, msg: loginLockedAll_() ? LOCK_ALL_MSG : loginLocked_(keys) ? LOCK_MSG : 'Code not found. Check it or ask your teacher.' };
  }
  if (!isYes_(st.active)) return { ok: false, msg: 'This code is locked. Ask your teacher.' };
  var home = null; if (withHome) { try { home = homeData(code); } catch (e) { home = null; } }
  return { ok: true, student: { code: normCode_(st.student_code), name: String(st.name || '') },
           app_name: getSettings_().app_name, version: APP_VERSION, home: home };
}
