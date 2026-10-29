export function isIP(s) { return /^(\d{1,3}\.){3}\d{1,3}$/.test(String(s)) ? 4 : /^[0-9a-f:]+$/i.test(String(s)) && String(s).includes(':') ? 6 : 0; }
export default { isIP };
