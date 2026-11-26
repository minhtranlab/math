// The repo is PUBLIC (code only): fail if question data, answer keys, figures, student codes or secrets slip in.
// Copied from SAT Math Lib (db7dc1f), adapted to MSB. Scans every file git would publish (tracked + new, not ignored).
const fs = require('fs'), path = require('path'), { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const files = execSync('git ls-files -z --cached --others --exclude-standard', { cwd: ROOT }).toString().split('\0').filter(Boolean)
  .filter(f => fs.existsSync(path.join(ROOT, f)));
const problems = [];
const bad = (f, why) => problems.push(f + ': ' + why);

for (const f of files) {
  const inFixtures = f.startsWith('tests/fixtures/');
  // 1. paths that must never be in the repo (project-folder data)
  if (/^(data|dist|library|questions|skillmap|sources|Textbook|private|qa|reports|01_Brain)\//.test(f)) bad(f, 'project-folder data path');
  if (/(^|\/)questions\/[^/]+\.json$/.test(f) && !inFixtures) bad(f, 'library batch file outside tests/fixtures');
  if (/(^|\/)(SAMPLE|TRIG|PYTH)[^/]*\.json$/.test(f)) bad(f, 'library / skill-map JSON in the repo');
  if (/\.(xlsx|xls|csv|tsv)$/i.test(f) && !inFixtures) bad(f, 'spreadsheet export');
  const siteIcon = /^site\/(icon-\d+\.png|favicon\.ico)$/.test(f) && fs.statSync(path.join(ROOT, f)).size < 20000;
  if (/\.(png|jpe?g|gif|webp|pdf|ico)$/i.test(f) && !inFixtures && !siteIcon) bad(f, 'image/PDF outside tests/fixtures');
  if (/(^|\/)\.clasprc\.json$|creds?\.json$|\.pem$|\.p12$/.test(f)) bad(f, 'credentials file');
  if (/\.(png|jpe?g|gif|webp|pdf|ico)$/i.test(f)) continue;

  const s = fs.readFileSync(path.join(ROOT, f), 'utf8');
  // 2. fixtures = made-up items only
  if (inFixtures && /\.json$/.test(f) && /"questions"/.test(s)) {
    const j = JSON.parse(s);
    if (!/^FX/.test(String(j.batch)) || (j.questions || []).some(q => !/^FX/.test(String(q.qid)))) bad(f, 'fixture batch / qids must start with FX (made-up items only)');
  }
  // real library qids / sample qids never in the repo (the SAMPLE batch is private too)
  if (/\bSMP-\d{3}\b/.test(s) && f !== 'tests/no_leak_test.js') bad(f, 'SAMPLE qid in the repo');
  // 2b. the GitHub Pages wrapper: only index.html + icons; it loads the app, it never carries data
  if (f.startsWith('site/')) {
    if (!/^site\/(index\.html|icon\.svg)$/.test(f)) bad(f, 'site/ holds only index.html + icons');
    if (/stem_html|"key"\s*:|data:image\/png/.test(s)) bad(f, 'question data / key / figure on the Pages site');
    if ((s.match(/https?:\/\/[^\s"'<>)]+/g) || []).some(u => !/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$|^http:\/\/www\.w3\.org\//.test(u))) bad(f, 'the Pages site loads something other than the app link');
  }
  // 3. source shipped to Apps Script: no embedded question data
  if (f.startsWith('src/')) {
    if (/\\?"key\\?"\s*:\s*\\?["\[]/.test(s)) bad(f, 'answer key field ("key": …) in shipped source');
    if (/"stem_html"|\\"stem_html\\"/.test(s)) bad(f, 'question stem in shipped source');
    if (/data:image\/[a-z]+;base64,[A-Za-z0-9+\/=]{2000,}/.test(s)) bad(f, 'embedded figure (base64 image)');
    if (/"example"|"sources"|qb0580/.test(s)) bad(f, 'skill-map details beyond IDs / names (examples, sources, past-paper counts)');
  }
  // 4. student codes / secrets anywhere (fixture codes start with FX-)
  if (/\b1\/\/0[A-Za-z0-9_-]{20,}/.test(s)) bad(f, 'Google refresh token');
  if (/\bya29\.[A-Za-z0-9_-]{20,}/.test(s)) bad(f, 'Google access token');
  if (/\b(ghp|gho|ghs|ghu)_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}/.test(s)) bad(f, 'GitHub token');
  if (/"refresh_token"\s*:\s*"[^"]{10,}/.test(s)) bad(f, 'refresh_token value');
  if (/GOCSPX-[A-Za-z0-9_-]{10,}/.test(s)) bad(f, 'OAuth client secret');
  if (/teacher_code['"]?\s*[:=,]\s*['"][A-Z0-9][A-Z0-9-]{3,}['"]/.test(s) && !/^tests\//.test(f)) bad(f, 'a teacher code value');
  for (const m of s.match(/\b[0-9a-f]{32}\b/g) || []) bad(f, '32-hex string (API key?) ' + m.slice(0, 6) + '…');
  if (s.length > 400 * 1024 && !inFixtures) bad(f, 'file > 400 KB');
}
// Apps Script refuses two files with the same name (Teacher.gs + Teacher.html → clasp push fails)
const srcNames = {};
fs.readdirSync(path.join(ROOT, 'src')).forEach(n => { const b = n.replace(/\.(gs|html|js)$/, ''); if (/\.(gs|html|js)$/.test(n)) { if (srcNames[b]) problems.push('src/' + n + ': same name as src/' + srcNames[b] + ' (Apps Script refuses it)'); srcNames[b] = n; } });
console.log(`no_leak_test: ${files.length} files scanned`);
if (problems.length) { console.log('FAIL\n  ' + problems.join('\n  ')); process.exit(1); }
console.log('PASS: no question data, keys, figures, codes or secrets');
