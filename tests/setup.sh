#!/usr/bin/env bash
# Harness inputs (git-ignored): MathJax, MathQuill + jQuery, html2canvas (npm; served in place of the CDN). Uses only the made-up fixture library (tests/fixtures/library).
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p .work
[ -d node_modules/mathjax ] && [ -d node_modules/mathquill ] && [ -d node_modules/html2canvas ] || npm install --no-audit --no-fund >/dev/null
echo "harness ready"
