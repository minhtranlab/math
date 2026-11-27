#!/usr/bin/env bash
# Every suite (made-up fixtures only) = what the GitHub Action runs before deploying. Stops at the first failure.
set -euo pipefail
cd "$(dirname "$0")"
bash setup.sh
run() { echo "::group::$*"; env "$@"; echo "::endgroup::"; }
run node no_leak_test.js     # public repo holds no question data / keys / codes / secrets
run node structure_test.js   # one data layer + TAB constants, one api.js, light only, site noindex
run node grade_test.js       # numeric + MCQ rules, browser copy = server code
run node server_test.js      # update + skills seed (re-runnable), login, one question, 2 tries, re-grade, review, hints, step, path, teacher
run node progress_test.js    # #7 levels E→M→H→Solid (replay), picking by level, home next, assign path, grid, override, My skills, final-answer time + away log
run node teacher_session_test.js  # #9 v2 Practise with teacher: assign, scope + level, begin, 3 tries, Live on demand, typing cache, Assign next once, close
run node teacher_e2e_test.js      # #9 v2 browser: assign → top card → Live + Refresh (no auto) → Show answer, pen, More space, Snapshot, calculator, notes → Assign next
run node homework_test.js         # #8 assignments: builder pick (E/M/H spread, new first, fill, swap queue), publish, card, autosave + live copy, submit = First Try, step credit, Review, fix (MCQ 3 total, typed unlimited, lock), history, ask (set + practice), inbox, go over priority, tagging, class target, close / delete
run node homework_e2e_test.js     # #8 browser: build + swap + publish → set (navigation, autosave, reload, ask, Check Your Work, submit) → result → fix (instant) → history → open; teacher list, go over (Show answer, tag), asked inbox
run node e2e_test.js         # browser: sign in → 3 sample questions → review → teacher Refresh; screenshots
echo "ALL SUITES PASSED"
