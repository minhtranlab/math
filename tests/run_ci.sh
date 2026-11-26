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
run node e2e_test.js         # browser: sign in → 3 sample questions → review → teacher Refresh; screenshots
echo "ALL SUITES PASSED"
