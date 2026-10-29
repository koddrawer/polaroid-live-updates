// Emulates the Android shell (ContentServer + Java bridge) in Chromium to test the web layer.
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const WS = require('/home/claude/polaroid/android-engine/node_modules/ws');
const OUT = process.argv[2] || '/tmp/aout'; const SCEN = process.argv[3] || 'basic';
fs.mkdirSync(OUT, { recursive: true });
const CONTENT = '/home/claude/polaroid/app/content', ANDROID = '/home/claude/polaroid/android/app/src/main/assets/android';
const USER = path.join(OUT, 'user'); fs.mkdirSync(USER, { recursive: true });
const PORT = 8123, BASE = `http://127.0.0.1:${PORT}`;
const mime = (p) => ({ '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.glb': 'model/gltf-binary', '.wav': 'audio/wav', '.ttf': 'font/ttf' })[path.extname(p).toLowerCase()] || 'application/octet-stream';
const rewrite = (s) => s.split('app://content/').join(BASE + '/content/').split('app://user/').join(BASE + '/user/');
http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, BASE).pathname), f = null;
  if (p.startsWith('/content/')) f = path.join(CONTENT, p.slice(9));
  else if (p.startsWith('/user/')) f = path.join(USER, p.slice(6));
  else if (p.startsWith('/android/')) f = path.join(ANDROID, p.slice(9));
  if (!f || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  const m = mime(f);
  let body = fs.readFileSync(f);
  if (/^text\/|javascript|json/.test(m)) { let s = rewrite(body.toString('utf8')); if (m === 'text/html') s = s.replace('<head>', `<head><script src="${BASE}/android/api.js"></script>`); body = Buffer.from(s); }
  res.writeHead(200, { 'Content-Type': m, 'Access-Control-Allow-Origin': '*' }); res.end(body);
}).listen(PORT);
// echo ws server for the WebSocket shim test
const echo = new WS.WebSocketServer({ port: 8124 });
echo.on('connection', (s, req) => { s.send(Buffer.from('hello:' + (req.headers.cookie || ''))); s.on('message', (d) => s.send(Buffer.concat([Buffer.from('echo:'), d]))); });

let settings = {}; const state = {}; const pages = {}; const engineReqs = new Map(); let rseq = 0; const sockets = new Map();
const deepMerge = (a, b) => { if (Array.isArray(b) || typeof b !== 'object' || b === null) return b; const o = { ...(a && typeof a === 'object' && !Array.isArray(a) ? a : {}) }; for (const k of Object.keys(b)) o[k] = deepMerge(o[k], b[k]); return o; };
const ev = (role, code) => pages[role] && pages[role].evaluate(code).catch(() => {});
const resolve = (role, id, ok, json) => ev(role, `window.__nativeResolve&&__nativeResolve(${JSON.stringify(id)},${ok},${JSON.stringify(json ?? 'null')})`);
const emit = (role, ch, json) => ev(role, `window.__nativeEvent&&__nativeEvent(${JSON.stringify(ch)},${JSON.stringify(json ?? 'null')})`);
const log = (...a) => fs.appendFileSync(path.join(OUT, 'harness.log'), a.join(' ') + '\n');
async function handle(role, id, method, args) {
  log(role, 'call', method, JSON.stringify(args).slice(0, 200));
  switch (method) {
    case 'settings:get': return rewrite(JSON.stringify(settings));
    case 'settings:set': settings = deepMerge(settings, args[0] || {}); { const s = JSON.stringify(settings); emit('display', 'settings:changed', s); emit('control', 'settings:changed', s); return s; }
    case 'settings:replace': settings[args[0]] = args[1]; { const s = JSON.stringify(settings); emit('display', 'settings:changed', s); emit('control', 'settings:changed', s); return s; }
    case 'image:fetch': return JSON.stringify(args[0] && args[0].startsWith('http') ? args[0] : args[0]);
    case 'state:load': return JSON.stringify(state[args[0]] ?? null);
    case 'state:save': state[args[0]] = args[1]; return 'true';
    case 'app:info': return JSON.stringify({ version: 'test', shell: 'android-test', platform: 'android' });
    case 'update:check': return JSON.stringify({ status: 'latest', version: 'test' });
    case 'file:pick': return 'null';
    case 'net:http': {
      const [m, url, headers, body] = args;
      try {
        const r = await fetch(url, { method: m, headers, body: body ? Buffer.from(body, 'base64') : undefined, redirect: 'follow' });
        const h = {}; r.headers.forEach((v, k) => { (h[k] = h[k] || []).push(v); });
        const b = Buffer.from(await r.arrayBuffer());
        return JSON.stringify({ status: r.status, statusText: r.statusText, url: r.url, headers: h, body: b.toString('base64') });
      } catch (e) { throw new Error(String(e.cause?.message || e.message)); }
    }
    default:
      if (method.startsWith('tiktok:')) { const rid = 'r' + (++rseq); engineReqs.set(rid, [role, id]); ev('engine', `__engineCall(${JSON.stringify(rid)},${JSON.stringify(method)},${JSON.stringify(JSON.stringify(args))})`); return undefined; }
      throw new Error('unknown ' + method);
  }
}
async function native(source, role, op, a) {
  if (op === 'call') {
    const [id, method, argsJson] = a;
    try { const r = await handle(role, id, method, JSON.parse(argsJson || '[]')); if (r !== undefined) resolve(role, id, true, r); }
    catch (e) { resolve(role, id, false, JSON.stringify({ message: e.message })); }
  } else if (op === 'send') {
    const [ch, json] = a; log(role, 'send', ch, String(json).slice(0, 300));
    if (ch === 'display:command') emit('display', ch, json);
    else if (ch === 'display:report') emit('control', ch, json);
    else if (ch === 'live:event' || ch === 'tiktok:status') { emit('display', ch, json); emit('control', ch, json); }
  } else if (op === 'engineReply') {
    const [rid, ok, json] = a; const r = engineReqs.get(rid); engineReqs.delete(rid); if (r) resolve(r[0], r[1], ok, json);
  } else if (op === 'wsOpen') {
    const [wsId, url, headers] = a; log('wsOpen', url, headers);
    const s = new WS(url, { headers: JSON.parse(headers) }); sockets.set(wsId, s);
    const fire = (t, p, n) => ev(role, `__wsEvent(${JSON.stringify(wsId)},${JSON.stringify(t)},${JSON.stringify(p)},${n})`);
    s.on('open', () => fire('open', '', 0)); s.on('message', (d, bin) => fire('message', Buffer.from(d).toString('base64'), bin ? 1 : 0));
    s.on('close', (c, r) => fire('close', String(r), c)); s.on('error', (e) => fire('error', e.message, 0));
  } else if (op === 'wsSend') { const s = sockets.get(a[0]); if (s) s.send(Buffer.from(a[1], 'base64')); }
  else if (op === 'wsClose') { const s = sockets.get(a[0]); if (s) s.close(a[1], a[2]); }
  else if (op === 'wsTerminate') { const s = sockets.get(a[0]); if (s) s.terminate(); }
}
const nativeShim = (role) => `window.Native = { role: () => '${role}',
  call: (...a) => { window.__nb('call', a); }, send: (...a) => { window.__nb('send', a); }, engineReply: (...a) => { window.__nb('engineReply', a); },
  wsOpen: (...a) => { window.__nb('wsOpen', a); }, wsSend: (...a) => { window.__nb('wsSend', a); return true; }, wsClose: (...a) => { window.__nb('wsClose', a); }, wsTerminate: (...a) => { window.__nb('wsTerminate', a); } };`;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true });
  for (const role of ['engine', 'control', 'display']) {
    const pg = await ctx.newPage(); pages[role] = pg;
    await pg.exposeBinding('__nb', (src, op, a) => native(src, role, op, a));
    await pg.addInitScript(nativeShim(role));
    pg.on('console', m => log(`[${role}] ${m.type()} ${m.text()}`)); pg.on('pageerror', e => log(`[${role}] PAGEERROR ${e.message}`));
  }
  await pages.engine.goto(BASE + '/android/engine.html');
  await pages.control.goto(BASE + '/content/control.html');
  await pages.display.goto(BASE + '/content/display.html');
  for (let i = 0; i < 240; i++) { if (await pages.display.evaluate('!!window.__ready').catch(() => false)) break; await sleep(500); }
  await sleep(4000);
  await pages.display.screenshot({ path: path.join(OUT, 'display_idle.png') });
  if (SCEN === 'basic') {
    await pages.control.click('[data-tab=test]'); await sleep(300);
    await pages.control.click('[data-test="40"]');
    for (const t of [3000, 6000, 12000]) { await sleep(t === 3000 ? 3000 : t === 6000 ? 3000 : 6000); await pages.display.screenshot({ path: path.join(OUT, `display_${t}.png`) }); }
    await pages.control.click('[data-tab=view]'); await sleep(400); await pages.control.screenshot({ path: path.join(OUT, 'control_view.png') });
    // TikTok connect through the engine (network is blocked here → expect a clean error status)
    const r = await pages.control.evaluate(`api.connect({ username: 'someone' })`).catch(e => 'ERR ' + e.message);
    log('connect result', JSON.stringify(r));
    await pages.control.click('[data-tab=live]'); await sleep(500); await pages.control.screenshot({ path: path.join(OUT, 'control_live.png') });
    // WebSocket shim round trip
    const wsr = await pages.engine.evaluate(`new Promise((res) => { const out = []; const s = new __NativeWS('ws://127.0.0.1:8124/', { headers: { Cookie: 'a=1' } });
      s.on('open', () => { out.push('open'); s.send(Buffer.from([1,2,3])); });
      s.on('message', (d, bin) => { out.push(d.toString('utf8') + '|' + bin); if (out.length >= 3) s.close(); });
      s.on('close', (c) => { out.push('close ' + c); res(out); }); setTimeout(() => res(out), 5000); })`);
    log('ws class', wsr);
  }
  await browser.close(); process.exit(0);
})().catch(e => { log('FATAL', e.stack); process.exit(1); });
