/**
 * MSB — texts written into the Sheet on every deploy: README (one line per tab), Dictionary (tab · column · meaning),
 * Settings meanings. English (the app is English; chats with Minh are Vietnamese).
 */

var SETTING_MEANINGS_ = {
  app_name: 'Name shown in the app.',
  teacher_code: 'Teacher sign-in code (type it here; never in any file). At least 4 characters.',
  max_tries: 'Tries per question. After the last wrong try the answer is shown and the question goes to the review list.',
  right_fast_credit: 'Step credit: right on the 1st try and in time (time ≤ slow_above_sec of Time_Norms).',
  right_slow_credit: 'Step credit: right on the 1st try but slow.',
  right_try2_credit: 'Step credit: right on the 2nd try (0 = stay).',
  wrong_credit: 'Step credit: wrong twice (0 = stay; never moves down).',
  steps_to_move_up: 'Steps needed at a level (E or M) to move up one level.',
  steps_to_solid: 'Steps needed at H for the sub-skill to be "Solid".',
  start_level: 'Level a new sub-skill starts at (E / M / H).',
  hint_counts: 'No = a hint never changes the step (every hint is still logged in Hints).',
  fallback_target_sec: 'Target seconds when Time_Norms has no row for a question.',
  slow_ratio: 'With fallback_target_sec: slow = above target × this.',
  round_length: 'Default rounding for lengths in template questions (the question always states it).',
  round_angle: 'Default rounding for angles in template questions.',
  review_after: 'When a question goes to the review list.',
  away_min_sec: 'Leaving the window shorter than this is not logged.',
  away_flag_sec: 'Leaving the window at least this long is shown to the teacher (students are never told).',
  ms_window_days: 'My skills: first-try % counts the answers of the last n days.',
  class_max_tries: 'Practise with teacher: tries before the answer is shown.',
  desmos_api_key: 'Desmos calculator API key (empty = the Desmos demo key). Type it here only.',
  code_version: 'Code version the Sheet was last updated for.'
};

var TAB_TEXT_ = [
  ['README', 'How to read this Sheet (written by the app on every deploy).'],
  ['Settings', 'Every number the app uses. Change the value column only.'],
  ['Students', 'One row per student. student_code = the code they sign in with. active = Yes / No.'],
  ['Classes', 'One row per class (optional for the pilot).'],
  ['Skills', 'The skill map: topic → skill → sub-skill (written from the skill map on each deploy). Set active = No to hide a sub-skill.'],
  ['Paths', 'One row per tick: student_code + target_type (skill / subskill) + target_id (an ID from Skills). This is what the student practises.'],
  ['Skill_Status', 'Per student × sub-skill summary (level, steps, status, position 0–9 on the My skills ladder, history). Rebuilt after every answer from Attempts + Level_Overrides.'],
  ['Level_Overrides', 'Teacher changes of a level (E / M / H / solid) for one student × sub-skill. The latest wins from its time on.'],
  ['Attempts', 'One row per question a student opened. result: right_1 / right_2 / wrong_2. step_credit = pilot progression.'],
  ['Tries', 'One row per try (answer, right or wrong, mistake type of the chosen wrong answer, seconds).'],
  ['Hints', 'One row per press of the Hint button.'],
  ['Review', 'Questions a student got wrong twice (status open) — explain them next lesson. cleared = right on the 1st try later.'],
  ['Questions', 'One row per question of the library (NO question text). A key typed here wins over the file. status live / hold / excluded.'],
  ['Batches', 'One row per question file on Drive. live = Yes switches the whole file on.'],
  ['Item_Overrides', 'Teacher changes to one question (difficulty or status) — the files are never edited by hand.'],
  ['Time_Norms', 'Seconds per difficulty and answer type. slow_above_sec decides "in time" vs "slow".'],
  ['Teacher_Sessions', 'One row per "Practise with teacher" the teacher assigned: the student, its sub-skills, start level, where to begin, the next question the teacher chose (Assign next), open / closed.'],
  ['Dictionary', 'Every column of every tab and what it means.']
];

var DICT_ = {
  Attempts: { attempt_id: 'ID of this question opening', kind: 'practice / sample / review', scope: 'what the student chose: path, sub:<ID>, review',
              result: 'right_1 = right on try 1 · right_2 = right on try 2 · wrong_2 = wrong twice (answer shown)', pace: 'in_time / slow (try 1 right only)',
              step_credit: '1 / 0.5 / 0 (Settings)', hint_used: 'Yes if the Hint button was pressed' },
  Tries: { try_no: '1 or 2', mistake_type: 'tag of the wrong choice / wrong value (from the question file)', client_said: 'what the browser showed (Yes/No); differs from correct only if something is wrong' },
  Paths: { target_type: 'skill or subskill', target_id: 'an ID from Skills (e.g. TRIG.RT or TRIG.RT.SIDE_NUM)', active: 'No = removed from the path (row kept)' },
  Questions: { type: 'mcq / num', round: 'rounding rule of a numeric answer: 3sf, 1dp, int, exact', hint_status: 'reviewed / draft (draft = never live)' }
};

function syncSheetTexts_() {
  var lines = [APP_NAME + ' — data Sheet (private). Version ' + APP_VERSION, '', 'Tabs:'].concat(TAB_TEXT_.map(function (t) { return t[0] + ' — ' + t[1]; }))
    .concat(['', 'Rules: one row = one record · never move or rename columns (new ones are added at the end) · no formulas in data tabs ·',
             'question text and answer keys live only in the private Drive folder "MSB - Library" · after editing with another tool open <app link>?flush=1']);
  dataWriteText_(TAB.README, lines);
  var rows = [];
  TABS_.forEach(function (t) {
    if (!t[1]) return;
    var d = DICT_[t[0]] || {};
    t[1].forEach(function (c) { rows.push({ tab: t[0], column: c, meaning: d[c] || '', example: '' }); });
  });
  dataRewrite_(TAB.DICTIONARY, function () { return false; }, rows);
  return 'texts: README ' + lines.length + ' lines, Dictionary ' + rows.length + ' rows';
}
