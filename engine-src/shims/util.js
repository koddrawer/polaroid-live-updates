export function promisify(fn) { return (...a) => new Promise((res, rej) => fn(...a, (e, v) => e ? rej(e) : res(v))); }
export function inspect(v) { try { return JSON.stringify(v); } catch { return String(v); } }
export default { promisify, inspect };
