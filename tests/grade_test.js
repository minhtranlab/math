// Grading rules (Grade.gs): numeric rounding / precision, units, MCQ; the browser gets the very same functions.
const { makeGas } = require('./server');
const g = makeGas();
const G = g.ctx;
let fails = 0, n = 0;
function t(spec, ans, want) { n++; const got = G.msbGrade_(spec, ans); if (got !== want) { fails++; console.log('  ✗ FAIL', JSON.stringify(spec), JSON.stringify(ans), '→', got, 'want', want); } }
const sf3 = { t: 'num', k: ['6.88'], r: '3sf' }, dp1 = { t: 'num', k: ['29.7'], r: '1dp' }, ex = { t: 'num', k: ['7'], r: 'exact' };
[['6.88', true], ['6.883', true], ['6.8829', true], ['6.88 cm', true], ['x = 6.88', true], ['6,88', true], [' 6.88 ', true],
 ['6.9', false], ['6.89', false], ['6.875', true], ['6.8849', true], ['6.885', false], ['7', false], ['', false], ['abc', false], ['6.88 kg', false], ['6.88cm', true]]
  .forEach(([a, w]) => t(sf3, a, w));
[['29.7', true], ['29.74', true], ['29.7448', true], ['29.7°', true], ['29.7 degrees', true], ['30', false], ['29.8', false], ['29.65', true], ['29.64', false]]
  .forEach(([a, w]) => t(dp1, a, w));
[['7', true], ['7.0', true], ['7.00001', false], ['14/2', true], ['-7', false]].forEach(([a, w]) => t(ex, a, w));
t({ t: 'num', k: ['5.00'], r: '3sf' }, '5', true);          // exactly the key value counts even with fewer figures
t({ t: 'num', k: ['5.00'], r: '3sf' }, '5.0', true);
t({ t: 'num', k: ['5.00'], r: '3sf' }, '5.01', false);
t({ t: 'num', k: ['0.0456'], r: '3sf' }, '0.04563', true);
t({ t: 'num', k: ['1200'], r: '3sf' }, '1203', true);
t({ t: 'num', k: ['-5.14'], r: '3sf' }, '−5.14', true);
t({ t: 'num', k: ['12'], r: 'int' }, '12.4', true);
t({ t: 'num', k: ['12'], r: 'int' }, '12.6', false);
t({ t: 'mcq', k: ['B'] }, 'b', true); t({ t: 'mcq', k: ['B'] }, 'A', false); t({ t: 'mcq', k: ['B'] }, '', false);
// the page gets the same text
const js = G.gradeClientJs_();
['msbParseNum_', 'msbRoundSf_', 'msbRoundDp_', 'msbNumMatch_', 'msbGrade_'].forEach(f => { n++; if (!js.includes('function ' + f + '(')) { fails++; console.log('  ✗ FAIL page misses', f); } });
const vm = require('vm'), box = {}; vm.createContext(box); vm.runInContext(js, box);
n++; if (box.msbGrade_(sf3, '6.883') !== true || box.msbGrade_(sf3, '6.9') !== false) { fails++; console.log('  ✗ FAIL browser copy differs'); }
console.log(`grade_test: ${n - fails}/${n} passed`);
process.exit(fails ? 1 : 0);
