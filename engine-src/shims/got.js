// Minimal `got` replacement on top of the native HTTP bridge (only what tiktok-live-connector uses).
import { Buffer } from 'buffer';
import { nativeHttp } from './native.js';

class HTTPError extends Error {
  constructor(response) { super(`Response code ${response.statusCode} (${response.statusMessage || ''})`); this.name = 'HTTPError'; this.response = response; this.code = 'ERR_NON_2XX_3XX_RESPONSE'; }
}
function flatHeaders(h) {
  const out = {};
  for (const [k, v] of Object.entries(h || {})) out[k] = k === 'set-cookie' ? v : (Array.isArray(v) ? v.join(', ') : v);
  return out;
}
function create(defaults) {
  const inst = async (url, options = {}) => {
    const o = { ...defaults, ...options };
    let u = String(url);
    if (o.searchParams) {
      const sp = new URLSearchParams(o.searchParams instanceof URLSearchParams ? o.searchParams : Object.entries(o.searchParams).filter(([, v]) => v !== undefined));
      const s = sp.toString(); if (s) u += (u.includes('?') ? '&' : '?') + s;
    }
    const headers = {};
    for (const [k, v] of Object.entries(o.headers || {})) if (v !== undefined && v !== null) headers[k] = String(v);
    const jar = o.cookieJar;
    if (jar && typeof jar.getCookieString === 'function') {
      const c = await jar.getCookieString(u);
      if (c) {
        const key = Object.keys(headers).find(k => k.toLowerCase() === 'cookie');
        if (key) headers[key] = headers[key] + '; ' + c; else headers.Cookie = c;
      }
    }
    let body = o.body;
    if (o.json !== undefined) { body = JSON.stringify(o.json); if (!Object.keys(headers).some(k => k.toLowerCase() === 'content-type')) headers['Content-Type'] = 'application/json'; }
    if (o.form !== undefined) { body = new URLSearchParams(o.form).toString(); headers['Content-Type'] = 'application/x-www-form-urlencoded'; }
    const r = await nativeHttp(String(o.method || 'GET').toUpperCase(), u, headers, body);
    const hdrs = flatHeaders(r.headers);
    if (jar && typeof jar.setCookie === 'function') for (const c of (r.headers['set-cookie'] || [])) { try { await jar.setCookie(c, r.url || u); } catch {} }
    const raw = Buffer.from(r.bytes);
    let parsed;
    const type = o.responseType || 'text';
    if (type === 'buffer') parsed = raw;
    else if (type === 'json') { const t = raw.toString('utf8'); try { parsed = t ? JSON.parse(t) : undefined; } catch (e) { const err = new Error('Unexpected token in JSON: ' + t.slice(0, 80)); err.name = 'ParseError'; throw err; } }
    else parsed = raw.toString('utf8');
    const response = { statusCode: r.status, statusMessage: r.statusText, headers: hdrs, body: parsed, rawBody: raw, url: r.url || u, ok: r.status >= 200 && r.status < 300, requestUrl: new URL(u) };
    if (o.throwHttpErrors !== false && (r.status < 200 || r.status >= 400)) throw new HTTPError(response);
    return response;
  };
  inst.extend = (more = {}) => create({ ...defaults, ...more });
  inst.get = (u, o) => inst(u, { ...o, method: 'GET' });
  inst.post = (u, o) => inst(u, { ...o, method: 'POST' });
  inst.defaults = { options: defaults };
  return inst;
}
const got = create({});
export default got;
export { HTTPError };
