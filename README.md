# Math Skill Bank (MSB)

General-math practice app for Minh's tutoring students: a **skill map** (topic → skill → sub-skill) and a **question bank**
tagged by sub-skill. A student signs in with a code, practises the sub-skills of their **path** one question at a time
(two tries, Hint button; after the 2nd wrong try the answer is shown and the question goes to the review list).
The teacher signs in with the teacher code on the same screen. Pilot topic: Trigonometry.

Copied from [minhtranlab/satmath](https://github.com/minhtranlab/satmath) @ `db7dc1f` (v0.17.2) — **copy, then cut**, no shared
code link (first commit = the copy; second = the cut + MSB structure). Spec: `02_SPEC.md` in Minh's project folder (not here).

**This repo is PUBLIC: code only.** Question text, figures, answer keys, student data, codes and tokens never go in here
(CI `tests/no_leak_test.js` checks every file). Tests use the made-up fixture batch `FX1` only.

## Where things are
| What | Where |
|---|---|
| Web app | Apps Script bound to the Sheet "MSB – Data" (`SHEET_ID` in `src/Code.gs`, My Drive › 📚 Academics › Math Skill Bank). Script ID → `.clasp.json`, web-app deployment → `.deployment` (both filled once the script exists). |
| Nice link | https://minhtranlab.github.io/math/ (`site/`: only a full-screen frame of the app; `noindex, nofollow`; published to `gh-pages` by `tools/publish_site.sh`) |
| Question library (private) | Drive "MSB - Library" (`LIBRARY_FOLDER_ID`): `questions/<BATCH>.json` (schema `msb.q/0.1`, spec §7) |
| Skill map | generated `src/Skills.gs` (IDs + names + prerequisites only) ← `python3 tools/build_skills.py "<project>/skillmap/trigonometry.json"` |

## Code map (spec §4)
| File | Role |
|---|---|
| `src/Data.gs` | **the data layer**: `TAB` constants + every Sheet read/write (`dataRows_`, `dataFind_`, `dataAppend_`, `dataUpdate_`, `dataRewrite_`, …), cache snapshots. Nothing else touches `SpreadsheetApp` (`tests/structure_test.js`). |
| `src/Api.html` | **api.js**: the only place the browser calls the server (`API.*`). |
| `src/Grade.gs` | grading rules (numeric rounding, units, MCQ) — the same functions are sent to the page for the instant ✓/✗; `encKey_` for the one open question |
| `src/Practice.gs` | student calls: `homeData`, `nextQuestion`, `submitTry` (server re-grades every try), `useHint`, `reviewList` |
| `src/Teacher.gs` + `TeacherPage.html` | teacher overview with **Refresh** (students, wrong twice, hint use, recent answers) |
| `src/Auth.gs` | sign-in + lock-out (from SAT/Test Zone) |
| `src/Library.gs` | Drive library, `Questions`/`Batches` sync, `Skills` seed (safe to re-run) |
| `src/Setup.gs`, `Update.gs`, `SheetText.gs` | tabs + columns, per-deploy update (`?update=1`), README/Dictionary texts |
| `src/Index.html`, `Styles.html`, `Client.html` | page, look (light only, teal accent), student screens |

## How to ship
Push to `main` → GitHub Action: tests → `clasp push --force` → new version of the same deployment (`.deployment`) →
`<web app>?update=1` (Sheet update once per commit: tabs, settings, texts, time norms, skills seed, library sync, check).
`.deployment` empty or secret `CLASPRC_JSON` missing = tests only, nothing deployed. Deploy by hand / login: see
`tools/clasp_login.mjs` (two-step Google login, token never printed) — same as SAT Math Lib's README.

## Add or change content (no code change)
- New skill map / IDs changed: `python3 tools/build_skills.py <json…>` → commit `src/Skills.gs` → the next deploy re-seeds the Skills tab (Minh's `active`/`note` kept; removed IDs stay as `active = No`).
- New question batch: put `questions/<BATCH>.json` in "MSB - Library" → next deploy (or editor → `syncLibrary`) adds Questions rows; set `Batches.live = Yes`. Items whose hint is not reviewed (`hint_status: draft`) stay `hold`.
