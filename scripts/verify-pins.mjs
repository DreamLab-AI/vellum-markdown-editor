#!/usr/bin/env node
// Verifies the two vendored browser assets against pinned SHA-256 digests
// before they are bundled, and with --copy places Paged.js in dist/.
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
