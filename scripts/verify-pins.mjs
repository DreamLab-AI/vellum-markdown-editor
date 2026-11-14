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
  { pkg: '@dreamlab-ai/ontomark-graph', version: '0.3.0', file: 'src/index.js', sha256: '39a5668f8577c23e62fec539cff9c9d266259f683fd92cf4360dd841040e98e5' },
  { pkg: '@dreamlab-ai/ontomark-graph', version: '0.3.0', file: 'src/layout.js', sha256: 'e3e60ab03aa72361abda35e5ccb78812a2dec7d370393e04a81cc2cc18ac96f2' },
  { pkg: '@dreamlab-ai/ontomark-graph', version: '0.3.0', file: 'LICENSE-MIT', sha256: '23f18e03dc49df91622fe2a76176497404e46ced8a715d9d2b67a7446571cca3', copyTo: 'dist/licenses/ontomark-graph-LICENSE-MIT' },
  { pkg: '@dreamlab-ai/ontomark-graph', version: '0.3.0', file: 'NOTICE', sha256: '8c43a70ce56c33461790b18933c6393ee640e8285753313b72a38d605935964a', copyTo: 'dist/licenses/ontomark-graph-NOTICE' },
  { pkg: '@dreamlab-ai/vowl-wasm', version: '0.2.3', file: 'vowl_wasm.js', sha256: 'c0e1fa8eff008d813e788fd3a8a916f3c353a060347908fcbacbc2f85302aad3' },
  { pkg: '@dreamlab-ai/vowl-wasm', version: '0.2.3', file: 'vowl_wasm_bg.wasm', sha256: 'e056639c75d2063371b3b8e24f25588f07ff4ec85cf311642c99858333b8da0a' },
  { pkg: '@dreamlab-ai/vowl-wasm', version: '0.2.3', file: 'LICENSE', sha256: '0f4fcaecb008764bb7afd316b52a77f830f3ad32594658352f51ed98b3a9c317', copyTo: 'dist/licenses/vowl-wasm-LICENSE' },
  { pkg: '@dreamlab-ai/vowl-wasm', version: '0.2.3', file: 'THIRD-PARTY-NOTICES.md', sha256: 'cd168dca86c09653390296532cd6ba02660665cad6e612714b085a8728d2a8fe', copyTo: 'dist/licenses/vowl-wasm-THIRD-PARTY-NOTICES.md' },
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
