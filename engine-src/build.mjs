import * as esbuild from 'esbuild';
import path from 'node:path';
const S = (f) => path.resolve('shims', f);
await esbuild.build({
  entryPoints: ['engine.js'], bundle: true, format: 'iife', platform: 'browser', target: ['chrome90'],
  outfile: process.argv[2] || 'dist/tiktok-engine.js', minify: true, legalComments: 'none',
  inject: [S('globals.js')],
  alias: {
    'got': S('got.js'), 'ws': S('ws.js'), 'axios': S('axios.js'),
    'node:zlib': S('zlib.js'), 'zlib': S('zlib.js'), 'node:util': S('util.js'), 'util': S('util.js'),
    'node:net': S('net.js'), 'net': S('net.js'), 'node:events': 'events', 'node:buffer': 'buffer',
  },
  define: { 'process.env.NODE_ENV': '"production"' },
  logLevel: 'warning',
});
console.log('built');
