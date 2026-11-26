/**
 * MSB — My skills (idea copied from SAT Math Lib My skills v3, satmath@ee1484a MySkills.gs; per SUB-SKILL here).
 * The student always sees how good they are now: for every sub-skill of their path a 9-block ladder
 *   E E E · M M M · H H H  then Solid  — position = Progress.gs replay (3 × level + steps; ½ step = half block; Solid = 9)
 * + first-try % over the last `ms_window_days` (all kinds of practice, n answers) + this week's gain = position now − position
 * at the end of the day 7 days ago (same replay, cut there; shown only when > 0). Grouped by skill with "x of y solid".
 * Only this student's rows go into the payload (no keys, no codes, nobody else).
 */

function mySkills(code) {
  cachedReads_();
  var st = requireStudent_(code);
  return mySkillsOf_(normCode_(st.student_code));
}

function mySkillsOf_(c) {
  var s = getSettings_(), now = Date.now(), win = (Number(s.ms_window_days) || 60) * 86400000;
  var weekAgo = new Date(fmtDate_(new Date(now - 7 * 86400000), 'yyyy-MM-dd') + 'T23:59:59+07:00').getTime();
  var att = dataFilter_(TAB.ATTEMPTS, function (a) { return normCode_(a.student_code) === c && clean_(a.status) === 'done'; });
  var pp = pathProgress_(c);
  var skills = pp.skills.map(function (k) { return { id: k.id, name: k.name, n: k.n, solid: k.solid, subs: [] }; }), byId = {};
  skills.forEach(function (k) { byId[k.id] = k; });
  pp.path.forEach(function (p) {
    var recent = att.filter(function (a) { return clean_(a.subskill) === p.id && now - toMs_(a.finished_at) <= win; });
    var r1 = recent.filter(function (a) { return isYes_(a.try1_correct); }).length;
    var then = progressOf_(c, p.id, weekAgo), gain = Math.round((p.position - then.position) * 2) / 2;
    byId[p.skill_id].subs.push({ id: p.id, name: p.name, level: p.level, steps: p.steps, need: p.need, solid: p.solid, position: p.position, label: p.label,
                                 status: p.status, ft_n: recent.length, ft_pct: recent.length ? Math.round(100 * r1 / recent.length) : null,
                                 gain: gain > 0 ? gain : 0, n_live: p.n_live });
  });
  var gains = pp.path.length ? skills.reduce(function (t, k) { return t + k.subs.reduce(function (u, x) { return u + x.gain; }, 0); }, 0) : 0;
  return { ok: true, skills: skills, week_gain: gains, n_solid: pp.path.filter(function (p) { return p.solid; }).length, n: pp.path.length };
}
