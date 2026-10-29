import { Buffer } from 'buffer';
globalThis.Buffer = globalThis.Buffer || Buffer;
globalThis.process = globalThis.process || { env: {}, platform: 'android', version: 'v20.0.0', versions: { node: '20.0.0' }, browser: true,
  nextTick: (f, ...a) => queueMicrotask(() => f(...a)), cwd: () => '/', on() {}, emitWarning() {} };
globalThis.global = globalThis;
