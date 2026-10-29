// `ws`-compatible WebSocket on top of the native OkHttp WebSocket (custom headers, binary frames).
import { EventEmitter } from 'events';
import { Buffer } from 'buffer';
import { b64FromBytes } from './native.js';

const sockets = new Map();
let seq = 0;
const prev = globalThis.__wsEvent;
globalThis.__wsEvent = (id, type, payload, num) => {
  const s = sockets.get(id);
  if (!s) { if (prev) prev(id, type, payload, num); return; }
  s._event(type, payload, num);
};

export class WebSocket extends EventEmitter {
  static CONNECTING = 0; static OPEN = 1; static CLOSING = 2; static CLOSED = 3;
  constructor(url, options = {}) {
    super();
    this.url = String(url);
    this.readyState = 0;
    this._id = 'ws' + (++seq);
    sockets.set(this._id, this);
    const headers = {};
    for (const [k, v] of Object.entries(options.headers || {})) if (v !== undefined && v !== null && v !== '') headers[k] = String(v);
    // let listeners attach first (same as ws: connection happens asynchronously)
    setTimeout(() => globalThis.Native.wsOpen(this._id, this.url, JSON.stringify(headers)), 0);
  }
  get CONNECTING() { return 0; } get OPEN() { return 1; } get CLOSING() { return 2; } get CLOSED() { return 3; }
  _event(type, payload, num) {
    if (type === 'open') { this.readyState = 1; this.emit('open'); }
    else if (type === 'message') { this.emit('message', Buffer.from(payload || '', 'base64'), num === 1); }
    else if (type === 'unexpected-response') { let info = {}; try { info = JSON.parse(payload); } catch {} this.emit('unexpected-response', null, { statusCode: info.statusCode, headers: { 'handshake-msg': info['handshake-msg'] } }); }
    else if (type === 'error') { if (this.listenerCount('error')) this.emit('error', new Error(payload || 'WebSocket error')); }
    else if (type === 'close') {
      if (this.readyState === 3) return;
      this.readyState = 3; sockets.delete(this._id);
      this.emit('close', num || 1005, Buffer.from(payload || ''));
    }
  }
  send(data, opts, cb) {
    if (typeof opts === 'function') { cb = opts; }
    const u8 = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data.buffer ? data.buffer : data, data.byteOffset || 0, data.byteLength ?? data.length);
    const ok = this.readyState === 1 && globalThis.Native.wsSend(this._id, b64FromBytes(u8));
    if (cb) cb(ok ? undefined : new Error('WebSocket is not open'));
  }
  ping() {} pong() {}
  close(code = 1000, reason = '') {
    if (this.readyState >= 2) return;
    if (this.readyState === 0) { this.terminate(); return; }
    this.readyState = 2;
    globalThis.Native.wsClose(this._id, code || 1000, String(reason || ''));
  }
  terminate() {
    if (this.readyState === 3) return;
    globalThis.Native.wsTerminate(this._id);
    this._event('close', '', 1006);
  }
}
export default WebSocket;
