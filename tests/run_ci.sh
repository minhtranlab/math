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
run node class_test.js       # #9 Class mode rules: 2 students, queue, push all/one, typing cache, pause, message, reveal, tries live, mastery, summary
run node class_e2e_test.js   # #9 browser: teacher + 2 student windows, live panel, pause cover, message, reveal, open on my screen + pen, result
run node e2e_test.js         # browser: sign in → 3 sample questions → review → teacher Refresh; screenshots
echo "ALL SUITES PASSED"
