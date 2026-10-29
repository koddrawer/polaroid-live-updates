// Promise wrapper around the Java bridge (window.Native) for the engine page.
let seq = 0;
const pend = new Map();
const prevResolve = globalThis.__nativeResolve;
globalThis.__nativeResolve = (id, ok, json) => {
  const p = pend.get(id);
  if (!p) { if (prevResolve) prevResolve(id, ok, json); return; }
  pend.delete(id);
  let v = null; try { v = json ? JSON.parse(json) : null; } catch { v = json; }
  ok ? p.res(v) : p.rej(new Error((v && v.message) || 'native error'));
};
export function nativeCall(method, ...args) {
  return new Promise((res, rej) => { const id = 'e' + (++seq); pend.set(id, { res, rej }); globalThis.Native.call(id, method, JSON.stringify(args)); });
}
export function b64FromBytes(u8) {
  let s = ''; const CH = 0x8000;
  for (let i = 0; i < u8.length; i += CH) s += String.fromCharCode.apply(null, u8.subarray(i, i + CH));
  return btoa(s);
}
export function bytesFromB64(b64) {
  const s = atob(b64 || ''); const u = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
  return u;
}
export function toBytes(body) {
  if (body == null) return null;
  if (typeof body === 'string') return new TextEncoder().encode(body);
  if (body instanceof ArrayBuffer) return new Uint8Array(body);
  if (ArrayBuffer.isView(body)) return new Uint8Array(body.buffer, body.byteOffset, body.byteLength);
  if (body instanceof URLSearchParams) return new TextEncoder().encode(body.toString());
  return new TextEncoder().encode(JSON.stringify(body));
}
/** native HTTP request → { status, statusText, url, headers: {name: [values]}, bytes } */
export async function nativeHttp(method, url, headers, body) {
  // Android blocks cleartext HTTP; TikTok redirects http→https anyway
  if (/^http:\/\//i.test(url) && !/^http:\/\/(localhost|127\.|\[::1\])/i.test(url)) url = 'https://' + url.slice(7);
  const bytes = toBytes(body);
  const r = await nativeCall('net:http', method || 'GET', url, headers || {}, bytes ? b64FromBytes(bytes) : null);
  return { ...r, bytes: bytesFromB64(r.body) };
}
