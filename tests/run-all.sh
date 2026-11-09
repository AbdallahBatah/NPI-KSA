#!/usr/bin/env bash
# Builds index.html from src/ and runs every end-to-end test at laptop and phone sizes.
set -e
cd "$(dirname "$0")"
python3 ../tools/build.py ../src/npi-projects.html ../index.html
mkdir -p out out6
fail=0
run(){ echo "=== $*"; node "$@" 2>&1 | grep -E "^FAIL|FAILS|TOTAL|ERRORS|ISSUES" || true; }
for t in t1 t2 t3 t4 t5 t6 t10; do run $t.js; done
run t7.js; run t7.js 390 844
run t9.js; run t9.js 390 844
run t8.js; run t8.js 390 844
