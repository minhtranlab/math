// Harness server (copied from SAT Math Lib, adapted): serves the Apps Script page (template tags resolved) + /rpc → the
// real src/ server code running in the Apps Script mock (gas.js), with the made-up fixture library FX1.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { createGas } = require('./gas');

const APP = process.env.APP_DIR || require('./paths').APP;
const LIB = process.env.LIB_DIR || path.join(__dirname, 'fixtures', 'library');
const LIB_ID = /LIBRARY_FOLDER_ID = '([^']+)'/.exec(fs.readFileSync(path.join(APP, 'Code.gs'), 'utf8'))[1];
const TEACHER = 'TEACH-FX-9';

/** Fresh Sheet with fixture students; the app's own update creates every other tab, seeds Skills, syncs FX1. */
function initialTabs() {
  return {
    'Sheet1': [],
    Students: [['student_code', 'name', 'active', 'classes', 'created_in', 'created_at', 'note'],
      ['FX-T01', 'Tess Test', 'Yes', '', 'sheet', '', 'fixture'], ['FX-T02', 'Locked Test', 'No', '', 'sheet', '', 'fixture'],
      ['FX-T03', 'Pat Path', 'Yes', '', 'sheet', '', 'fixture']],
    Settings: [['key', 'value', 'meaning'], ['teacher_code', TEACHER, ''], ['class_poll_sec', 1, 'fast polls in tests']],
    Paths: [['student_code', 'target_type', 'target_id', 'active', 'added_at', 'added_by', 'note'],
      ['FX-T03', 'skill', 'TRIG.RT', 'Yes', '', 'test', ''], ['FX-T03', 'subskill', 'TRIG.BR.READ', 'Yes', '', 'test', '']]
  };
}
function makeGas(opts = {}) {
  const g = createGas(APP, initialTabs(), { libDir: opts.libDir || LIB, libId: LIB_ID });
  if (!opts.quiet) g.ctx.console = { log() {}, warn() {}, error: console.error, info() {} };
  const r = g.admin('doUpdate');
  if (!/done/.test(r.status)) throw new Error('update failed: ' + JSON.stringify(r));
  return g;
}

function page(g) {
  let html = fs.readFileSync(path.join(APP, 'Index.html'), 'utf8');
  html = html.replace(/<\?!=\s*include\('(\w+)'\);?\s*\?>/g, (m, n) => {
    let s = fs.readFileSync(path.join(APP, n + '.html'), 'utf8');
    if (n === 'Api') s = MOCK_RUN + s;
    return s;
  });
  html = html.replace(/<\?!=\s*gradeClientJs_\(\);?\s*\?>/g, () => g.ctx.gradeClientJs_());
  if (/<\?/.test(html)) throw new Error('unresolved template tag in Index.html');
  return html;
}
const MOCK_RUN = `<script>
(function(){
  function runner(succ, fail){ return new Proxy({}, { get: function(_, name){
    if (name === 'withSuccessHandler') return function(f){ return runner(f, fail); };
    if (name === 'withFailureHandler') return function(f){ return runner(succ, f); };
    return function(){ var args = Array.prototype.slice.call(arguments);
      fetch('/rpc', { method: 'POST', body: JSON.stringify({ fn: name, args: args }) })
        .then(function(r){ if (!r.ok) throw new Error('NetworkError: ' + r.status); return r.json(); })
        .then(function(j){ setTimeout(function(){ if (j.error) { fail && fail(new Error(j.error)); } else { succ && succ(j.result); } }, 0); })
        .catch(function(e){ fail && fail(e); });
    }; } }); }
  window.google = { script: { run: runner(null, null) } };
})();
</script>`;

function start(port) {
  const st = { gas: makeGas(), offline: false, rpcLog: [], latency: 0 };
  st.reset = () => { st.gas = makeGas(); st.rpcLog = []; };
  const server = http.createServer((req, res) => {
    if (req.url === '/' || req.url.startsWith('/?')) { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(page(st.gas)); return; }
    if (req.url === '/rpc' && req.method === 'POST') {
      let body = '';
      req.on('data', c => body += c);
      req.on('end', () => {
        if (st.offline) { res.writeHead(503); res.end('offline'); return; }
        const { fn, args } = JSON.parse(body);
        let out;
        try { st.gas.fresh(); out = { result: st.gas.call(fn, args) }; } catch (e) { out = { error: e.message }; if (!/^(LOGIN|SESSION)/.test(e.message)) console.error('RPC error', fn, e.stack); }
        const txt = JSON.stringify(out);
        st.rpcLog.push({ fn, req: body, res: txt });
        setTimeout(() => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(txt); }, st.latency);
      });
      return;
    }
    res.writeHead(404); res.end();
  });
  return new Promise(r => server.listen(port, () => r({ server, st })));
}

module.exports = { start, initialTabs, makeGas, page, LIB, LIB_ID, TEACHER };
if (require.main === module) start(8080).then(() => console.log('http://localhost:8080'));
