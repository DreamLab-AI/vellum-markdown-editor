#!/usr/bin/env node
// Verifies the vendored browser assets against pinned SHA-256 digests before
// they are bundled, and with --copy places Paged.js and the graph components'
// licence notices in dist/.
//
// npm's lockfile integrity covers the tarball at install time. This covers the
// exact file that ships, at build time, and fails the build on any difference.
// npm `pele` 1.0.0 is an unrelated 2020 package: only 1.12.0 is accepted.
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PINS = [
  { pkg: 'pele', version: '1.12.0', file: 'dist/pele.js', sha256: '111172ef3cfe3ab8fd58cba28f69e2c23f1d9f08c63db306fb9eb654a77de20b' },
  { pkg: 'pagedjs', version: '0.4.3', file: 'dist/paged.polyfill.js', sha256: 'f59f361802416c770d549a647958649af2cf6601999924bc00e4f507dad5269f', copyTo: 'dist/paged.polyfill.js' },
  // The note graph (dist/graph.js): Ontomark's shared renderer and layout driver, and the
  // vowl-wasm force layout. Both come from immutable GitHub release tarballs, not the npm
  // registry. The WebAssembly module is compiled Rust, so its dependency notices ship with it.
  // Release tarballs (2026-11-23): ontomark-graph-v0.4.0 sha256 af471336194ece0cbb8b99bd0d4906cbffe99298c4b0bcd1a7d1ddbfbda287f0,
  // vowl-wasm v0.4.0 sha256 727ac72533005d2f86bfb3dceb6f7d378dffca3a9c2941aaaa45a523bab12301.
  // Against the previous pins (graph 0.3.0, vowl-wasm 0.2.3) the renderer (src/index.js) and both licences are
  // byte-identical; the layout driver, the glue, the module and the vowl-wasm notices changed.
  { pkg: '@dreamlab-ai/ontomark-graph', version: '0.4.0', file: 'src/index.js', sha256: '39a5668f8577c23e62fec539cff9c9d266259f683fd92cf4360dd841040e98e5' },
  { pkg: '@dreamlab-ai/ontomark-graph', version: '0.4.0', file: 'src/layout.js', sha256: '47ba07cb362e95c4b16fe56504d2eef8860fd5d31215b24aa05bda0f60e67147' },
  { pkg: '@dreamlab-ai/ontomark-graph', version: '0.4.0', file: 'LICENSE-MIT', sha256: '23f18e03dc49df91622fe2a76176497404e46ced8a715d9d2b67a7446571cca3', copyTo: 'dist/licenses/ontomark-graph-LICENSE-MIT' },
  { pkg: '@dreamlab-ai/ontomark-graph', version: '0.4.0', file: 'NOTICE', sha256: '8c43a70ce56c33461790b18933c6393ee640e8285753313b72a38d605935964a', copyTo: 'dist/licenses/ontomark-graph-NOTICE' },
  { pkg: '@dreamlab-ai/vowl-wasm', version: '0.4.0', file: 'vowl_wasm.js', sha256: 'c95715db128215925077f08f58a54a664e81458bd28a2f0145e92d3dd3e7187d' },
  { pkg: '@dreamlab-ai/vowl-wasm', version: '0.4.0', file: 'vowl_wasm_bg.wasm', sha256: '47c2f1d9ea333f3bbcff7c1ff33b4677f7ac7af5a526ff53433ffea70340c6af' },
  { pkg: '@dreamlab-ai/vowl-wasm', version: '0.4.0', file: 'LICENSE', sha256: '0f4fcaecb008764bb7afd316b52a77f830f3ad32594658352f51ed98b3a9c317', copyTo: 'dist/licenses/vowl-wasm-LICENSE' },
  { pkg: '@dreamlab-ai/vowl-wasm', version: '0.4.0', file: 'THIRD-PARTY-NOTICES.md', sha256: '9af37d3c83d6d47c5f3c5782cfd22e21cff344568f4cfe83be365aeee0cce776', copyTo: 'dist/licenses/vowl-wasm-THIRD-PARTY-NOTICES.md' },
];

let failed = false;
for (const pin of PINS) {
  const dir = join(root, 'node_modules', pin.pkg);
  const version = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).version;
  const actual = createHash('sha256').update(readFileSync(join(dir, pin.file))).digest('hex');
  if (version !== pin.version || actual !== pin.sha256) {
    console.error(`PIN MISMATCH ${pin.pkg}: version ${version} (want ${pin.version}), ${pin.file} sha256 ${actual} (want ${pin.sha256})`);
    failed = true;
    continue;
  }
  console.log(`ok ${pin.pkg}@${version} ${pin.file}`);
  if (process.argv.includes('--copy') && pin.copyTo) {
    mkdirSync(dirname(join(root, pin.copyTo)), { recursive: true });
    copyFileSync(join(dir, pin.file), join(root, pin.copyTo));
  }
}
process.exit(failed ? 1 : 0);
