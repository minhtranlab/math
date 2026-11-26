#!/usr/bin/env bash
# Harness inputs (git-ignored): MathJax (npm). Uses only the made-up fixture library (tests/fixtures/library).
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p .work
[ -d node_modules/mathjax ] || npm install --no-audit --no-fund >/dev/null
echo "harness ready"
