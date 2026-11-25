import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const scratch = mkdtempSync(join(tmpdir(), 'vellum-cli-test-'));
const cli = join(scratch, 'vellum-graph.mjs');
execFileSync(resolve('node_modules/.bin/esbuild'), [
  'src/cli/vellum-graph.ts',
  '--bundle',
  '--platform=node',
  '--format=esm',
  `--outfile=${cli}`,
  '--log-level=warning',
]);
after(() => rmSync(scratch, { recursive: true, force: true }));

function fixture() {
  const root = mkdtempSync(join(scratch, 'vault-'));
  const files = {
    'Index.md': 'See [[notes/Plan]].\n',
    'notes/Plan.md': '# Plan\nSee [home](../Index.md) and [[Missing]].\n',
  };
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}

const run = (root: string, ...args: string[]) =>
  spawnSync(process.execPath, [cli, ...args, '--root', root], { encoding: 'utf8' });

test('CLI queries return references, JSON, and documented exit codes', () => {
  const root = fixture();
  const backlinks = run(root, 'backlinks', 'Plan', '--json');
  assert.equal(backlinks.status, 0, backlinks.stderr);
  assert.equal(JSON.parse(backlinks.stdout).backlinks[0].line, 1);
  assert.match(run(root, 'context', 'Plan').stdout, /@Index\.md#1/);
  assert.deepEqual(JSON.parse(run(root, 'unresolved', '--json').stdout), [
    { note: 'notes/Plan.md', target: 'Missing' },
  ]);
  assert.equal(run(root, 'resolve', 'Absent').status, 1);
  assert.equal(run(root, 'rename', 'notes').status, 2);
});

test('CLI dry run leaves files intact and apply normalises backslash paths', () => {
  const root = fixture();
  const args = ['rename', 'notes\\Plan.md', 'archive\\Roadmap.md', '--json'];
  const dry = run(root, ...args);
  assert.equal(dry.status, 0, dry.stderr);
  assert.equal(JSON.parse(dry.stdout).applied, false);
  assert.equal(readFileSync(join(root, 'Index.md'), 'utf8'), 'See [[notes/Plan]].\n');
  assert.ok(existsSync(join(root, 'notes/Plan.md')));
  const applied = run(root, ...args, '--apply');
  assert.equal(applied.status, 0, applied.stderr);
  assert.equal(JSON.parse(applied.stdout).applied, true);
  assert.equal(readFileSync(join(root, 'Index.md'), 'utf8'), 'See [[archive/Roadmap]].\n');
  assert.ok(existsSync(join(root, 'archive/Roadmap.md')));
  assert.ok(!existsSync(join(root, 'notes/Plan.md')));
});

test('CLI refuses a folder move into itself before rewriting links', () => {
  const root = fixture();
  const result = run(root, 'rename', 'notes', 'notes/archive', '--apply');
  assert.equal(result.status, 2);
  assert.match(result.stderr, /inside itself/);
  assert.equal(readFileSync(join(root, 'Index.md'), 'utf8'), 'See [[notes/Plan]].\n');
  assert.ok(existsSync(join(root, 'notes/Plan.md')));
  assert.ok(!existsSync(join(root, 'notes/archive')));
});

test('CLI refuses existing files and dangling symlinks before rewriting links', () => {
  const root = fixture();
  writeFileSync(join(root, 'Taken.md'), 'Keep this.\n');
  const destinations = ['Taken.md'];
  if (process.platform !== 'win32') {
    symlinkSync('Absent.md', join(root, 'Dangling.md'));
    destinations.push('Dangling.md');
  }
  for (const target of destinations) {
    const result = run(root, 'rename', 'notes/Plan.md', target, '--apply');
    assert.equal(result.status, 2);
    assert.match(result.stderr, /already exists/);
    assert.equal(readFileSync(join(root, 'Index.md'), 'utf8'), 'See [[notes/Plan]].\n');
    assert.ok(existsSync(join(root, 'notes/Plan.md')));
  }
  assert.equal(readFileSync(join(root, 'Taken.md'), 'utf8'), 'Keep this.\n');
});

test('CLI refuses a destination outside the root before rewriting links', () => {
  const root = fixture();
  const result = run(root, 'rename', 'notes/Plan.md', '../Outside.md', '--apply');
  assert.equal(result.status, 2);
  assert.match(result.stderr, /outside the root/);
  assert.equal(readFileSync(join(root, 'Index.md'), 'utf8'), 'See [[notes/Plan]].\n');
  assert.ok(existsSync(join(root, 'notes/Plan.md')));
});

test('CLI neighbours prints the graph view\'s neighbourhood and validates its bounds', () => {
  const root = fixture();
  const json = run(root, 'neighbours', 'Plan', '--depth', '2', '--json');
  assert.equal(json.status, 0, json.stderr);
  const g = JSON.parse(json.stdout);
  assert.equal(g.centre, 'notes/Plan.md');
  assert.deepEqual(g.nodes.map((n: { id: string; missing: boolean }) => [n.id, n.missing]), [
    ['notes/Plan.md', false],
    ['Index.md', false],
    ['/?missing', true],
  ]);
  assert.equal(g.depth, 2);
  assert.equal(g.truncated, false);
  const text = run(root, 'neighbours', 'Index').stdout;
  assert.match(text, /^1 {2}notes\/Plan\.md$/m);
  assert.match(text, /^Index\.md -> notes\/Plan\.md$/m);
  assert.match(run(root, 'neighbours', 'Plan').stdout, /\[\[Missing\]\] \(missing\)/);
  assert.equal(run(root, 'neighbours', 'Absent').status, 1);
  assert.equal(run(root, 'neighbours', 'Plan', '--depth', 'two').status, 2);
  assert.equal(run(root, 'neighbours').status, 2);
});

test('CLI rejects extra arguments and out-of-range options instead of ignoring them', () => {
  const root = fixture();
  // "depth 2" without -- used to be ignored, answering with the default depth.
  assert.equal(run(root, 'neighbours', 'Plan', 'depth', '2').status, 2);
  assert.equal(run(root, 'notes', 'extra').status, 2);
  assert.equal(run(root, 'unresolved', 'Plan', 'extra').status, 2);
  assert.equal(run(root, 'rename', 'notes/Plan.md', 'archive/Roadmap.md', 'extra').status, 2);
  assert.equal(run(root, 'neighbours', 'Plan', '--depth', '5').status, 2);
  assert.equal(run(root, 'neighbours', 'Plan', '--max', '5').status, 2);
  assert.equal(run(root, 'neighbours', 'Plan', '--depth', '3', '--max', '1000').status, 0);
  assert.equal(readFileSync(join(root, 'Index.md'), 'utf8'), 'See [[notes/Plan]].\n');
  assert.ok(existsSync(join(root, 'notes/Plan.md')));
});
