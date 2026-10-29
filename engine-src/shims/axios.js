// The real axios, but every request goes through the native HTTP bridge (no CORS in the WebView).
import axios from '../node_modules/axios/index.js';
import { nativeHttp } from './native.js';

async function nativeAdapter(config) {
  const url = axios.getUri(config);
  const headers = {};
  const h = config.headers && typeof config.headers.toJSON === 'function' ? config.headers.toJSON() : (config.headers || {});
  for (const [k, v] of Object.entries(h)) if (v !== undefined && v !== null && v !== false) headers[k] = String(v);
  let data = config.data;
  const r = await nativeHttp(String(config.method || 'get').toUpperCase(), url, headers, data);
  const hdrs = {};
  for (const [k, v] of Object.entries(r.headers || {})) hdrs[k] = k === 'set-cookie' ? v : v.join(', ');
  let body;
  const rt = config.responseType || 'json';
  if (rt === 'arraybuffer') body = r.bytes.buffer.slice(r.bytes.byteOffset, r.bytes.byteOffset + r.bytes.byteLength);
  else {
    const text = new TextDecoder().decode(r.bytes);
    if (rt === 'json') { try { body = text ? JSON.parse(text) : text; } catch { body = text; } } else body = text;
  }
  const response = { data: body, status: r.status, statusText: r.statusText || '', headers: hdrs, config, request: {} };
  const ok = !config.validateStatus || config.validateStatus(r.status);
  if (ok) return response;
  throw new axios.AxiosError('Request failed with status code ' + r.status, r.status >= 500 ? 'ERR_BAD_RESPONSE' : 'ERR_BAD_REQUEST', config, {}, response);
}
axios.defaults.adapter = nativeAdapter;
export default axios;
export const AxiosError = axios.AxiosError;
export const AxiosHeaders = axios.AxiosHeaders;
export const isAxiosError = axios.isAxiosError;
