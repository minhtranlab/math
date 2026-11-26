// BRAIN §5 structure: one data layer (server) + one api.js wrapper (browser), tab names only as TAB constants, light only.
const fs = require('fs'), path = require('path');
const SRC = path.join(__dirname, '..', 'src');
const files = fs.readdirSync(SRC);
const noComments = t => t.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const problems = [];
let n = 0;
function ok(cond, msg) { n++; if (!cond) problems.push(msg); }
const TAB_NAMES = /'(README|Dictionary|Settings|Students|Classes|Skills|Paths|Questions|Batches|Item_Overrides|Time_Norms|Attempts|Tries|Hints|Review|Skill_Status|Level_Overrides)'/;
files.filter(f => f.endsWith('.gs')).forEach(f => {
  const s = fs.readFileSync(path.join(SRC, f), 'utf8');
  if (f !== 'Data.gs') {
    ok(!/SpreadsheetApp/.test(s), f + ': SpreadsheetApp outside Data.gs');
    ok(!/\b(readTable_|readTableSheet_|sheet_|headers_|ss_)\(/.test(s), f + ': private Sheet helper used outside Data.gs');
    ok(!/data\w*_\(\s*'/.test(s), f + ': tab name as a string literal (use TAB.*)');
    s.split('\n').forEach((l, i) => { if (/data\w*_\(/.test(l) && TAB_NAMES.test(l)) problems.push(f + ':' + (i + 1) + ' tab name literal next to a data call'); });
  } else {
    ok(/var TAB = \{/.test(s), 'Data.gs: TAB constants');
  }
});
files.filter(f => f.endsWith('.html')).forEach(f => {
  const s = fs.readFileSync(path.join(SRC, f), 'utf8');
  if (f !== 'Api.html') ok(!/google\.script\.run/.test(s), f + ': google.script.run outside Api.html (use API.*)');
  ok(!/prefers-color-scheme\s*:\s*dark|data-theme|dark-mode|darkmode/i.test(s), f + ': dark theme code (LIGHT ONLY)');
});
const css = fs.readFileSync(path.join(SRC, 'Styles.html'), 'utf8'), idx = fs.readFileSync(path.join(SRC, 'Index.html'), 'utf8');
ok(/color-scheme:\s*light only/.test(css), 'Styles: color-scheme: light only');
ok(/name="color-scheme" content="light only"/.test(idx), 'Index: meta color-scheme light only');
ok(!/SAT Math Lib|College Board|Bluebook/.test(noComments(idx + css + fs.readFileSync(path.join(SRC, 'Client.html'), 'utf8') + fs.readFileSync(path.join(SRC, 'TeacherPage.html'), 'utf8'))), 'no SAT names in the UI (comments aside)');
ok(/Math Skill Bank/.test(idx), 'app name in the UI');
const site = noComments(fs.readFileSync(path.join(__dirname, '..', 'site', 'index.html'), 'utf8'));
ok(/<meta name="robots" content="noindex, nofollow">/.test(site), 'site: noindex, nofollow');
ok(/color-scheme" content="light only"/.test(site), 'site: light only');
ok(!/satmath|SAT Math/.test(site), 'site: no SAT names / links');
console.log(`structure_test: ${n - problems.length}/${n} checks`);
if (problems.length) { console.log('FAIL\n  ' + problems.join('\n  ')); process.exit(1); }
console.log('PASS: one data layer, one api.js, TAB constants, light only');
