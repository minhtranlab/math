# Test harness (copied from SAT Math Lib, cut)
Runs the real `src/` server code in an in-memory Apps Script + Sheet mock (`gas.js`) and the real page in Chromium (`h.js`, `server.js`).
Library = `fixtures/library` (made-up batch FX1, regenerate with `python3 make_fixtures.py`). `bash run_ci.sh` = everything CI runs.
Screenshots go to `tests/.work/shots` (or `SHOTS=<dir>`). Locally without a project install: `NODE_PATH=$(npm root -g) bash tests/run_ci.sh`.
