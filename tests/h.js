// Shared Playwright helpers (copied from SAT Math Lib tests/h.js, cut to what MSB uses).
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { start } = require('./server');

const MJ = path.join(__dirname, 'node_modules/mathjax');
const SHOTS = process.env.SHOTS || require('./paths').WORK + '/shots';
fs.mkdirSync(SHOTS, { recursive: true });

async function routes(ctx) {
  await ctx.route('https://cdn.jsdelivr.net/npm/mathjax@3.2.2/**', r => {
    const rel = new URL(r.request().url()).pathname.replace('/npm/mathjax@3.2.2/', '');
    const f = path.join(MJ, rel);
    if (fs.existsSync(f)) r.fulfill({ path: f, contentType: f.endsWith('.js') ? 'application/javascript' : undefined }); else r.continue();
  });
  // the question tools' CDN files → the same versions from npm; Desmos → a small stand-in (its real script needs the network)
  const NPM = { 'mathquill@0.10.1': 'mathquill', 'jquery@3.7.1': 'jquery', 'html2canvas@1.4.1': 'html2canvas' };
  await ctx.route(/cdn\.jsdelivr\.net\/npm\/(mathquill|jquery|html2canvas)@/, r => {
    const m = /\/npm\/([^/]+)\/(.*)$/.exec(new URL(r.request().url()).pathname), f = path.join(__dirname, 'node_modules', NPM[m[1]], m[2]);
    if (fs.existsSync(f)) r.fulfill({ path: f, contentType: f.endsWith('.css') ? 'text/css' : 'application/javascript' }); else r.abort();
  });
  await ctx.route(/www\.desmos\.com\/api\//, r => r.fulfill({ contentType: 'application/javascript', body: DESMOS_STUB }));
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
}
const DESMOS_STUB = `window.DESMOS_URL = (document.currentScript || {}).src || '';
window.Desmos = { GraphingCalculator: function (el) { el.innerHTML = '<div class="desmos-stub" style="padding:20px;border:1px dashed #999;height:100%">Desmos graphing (test stand-in)</div>'; return { resize: function () {} }; },
  ScientificCalculator: function (el) { el.innerHTML = '<div class="desmos-stub">Desmos scientific (test stand-in)</div>'; return { resize: function () {} }; } };`;
async function setup(opts = {}) {
  const port = opts.port || 8090 + Math.floor(Math.random() * 800);
  const { server, st } = await start(port);
  const browser = await chromium.launch();
  const url = `http://localhost:${port}/`;
  const errors = [];
  async function newPage(device) {
    const ctxOpts = device === 'phone' ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true }
      : { viewport: { width: 1366, height: 860 }, deviceScaleFactor: 1 };
    const ctx = await browser.newContext(ctxOpts);
    await routes(ctx);
    const page = await ctx.newPage();
    page.on('pageerror', e => { errors.push(e.message); console.log('PAGEERROR', e.message); });
    page.on('console', m => { if (m.type() === 'error' && !/favicon|fonts\.g|ERR_FAILED/.test(m.text())) { errors.push(m.text()); console.log('CONSOLE', m.text()); } });
    return { ctx, page };
  }
  return { st, browser, url, newPage, errors, close: async () => { await browser.close(); server.close(); } };
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function shot(page, name) { await page.screenshot({ path: path.join(SHOTS, name + '.png'), fullPage: true }); }
async function login(page, url, code) { await page.goto(url); await page.fill('#login-code', code); await page.click('#login-btn'); }
let FAILS = 0, PASSES = 0;
function check(cond, msg) { if (cond) { PASSES++; console.log('  ✓ ' + msg); } else { FAILS++; console.log('  ✗ FAIL: ' + msg); } }
function summary() { console.log(`\n${PASSES} passed, ${FAILS} failed`); return FAILS; }
module.exports = { setup, sleep, shot, login, check, summary, SHOTS };
