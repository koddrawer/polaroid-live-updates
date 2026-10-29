import * as pako from 'pako';
import { Buffer } from 'buffer';
export function unzip(buf, opts, cb) {
  if (typeof opts === 'function') cb = opts;
  try { cb(null, Buffer.from(pako.inflate(buf))); } catch (e) { try { cb(null, Buffer.from(pako.ungzip(buf))); } catch (e2) { cb(e2); } }
}
export const gunzip = unzip, inflate = unzip;
export default { unzip, gunzip, inflate };
