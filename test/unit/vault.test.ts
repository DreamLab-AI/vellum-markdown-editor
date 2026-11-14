import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyEdits, Vault } from '../../src/links/vault';

const files = [
  { path: 'Project.md', text: '# Project\nSee [[Plan]] and [[Missing note]].\n' },
  { path: 'Plan.md', text: 'Back to [[Project#Goals|the project]].\n' },
  { path: 'notes/Review.md', text: 'Line one\n[md](../Project.md) and Project mentioned here.\n' },
  { path: 'notes/Plan.md', text: 'A second plan, linked to nothing.\n' },
  { path: 'Lonely.md', text: 'Nobody links here. `[[Project]]` is code.\n' },
];
const vault = () => new Vault(files);

test('vault: find accepts paths, case variants and wikilink targets', () => {
  const v = vault();
  assert.equal(v.find('Project.md'), 'Project.md');
  assert.equal(v.find('./project.MD'), 'Project.md');
  assert.equal(v.find('Review'), 'notes/Review.md');
  assert.equal(v.find('notes/Plan'), 'notes/Plan.md');
  assert.equal(v.find('Plan'), 'Plan.md', 'the shallower note wins from the root');
  assert.equal(v.find('nope'), undefined);
  assert.equal(v.find(''), undefined);
});

test('vault: backlinks, outgoing and unresolved match the link index', () => {
  const v = vault();
  assert.deepEqual(v.backlinks('Project.md').map((b) => [b.source, b.link.line]), [['notes/Review.md', 1], ['Plan.md', 0]]);
  assert.deepEqual(v.outgoing('Project.md').map((o) => o.target ?? null), ['Plan.md', null]);
  assert.deepEqual(v.unresolved('Project.md'), ['Missing note']);
  assert.equal(v.resolve('Plan', 'notes/Review.md'), 'Plan.md', 'a full path from the root beats a same-folder name');
});

test('vault: unlinked mentions skip links and code', () => {
  const m = vault().unlinkedMentions('Project.md');
  assert.deepEqual(m.map((x) => [x.source, x.line]), [['notes/Review.md', 1]]);
});

test('vault: edges, orphans and link text', () => {
  const v = vault();
  assert.deepEqual(v.edges(), [
    { from: 'notes/Review.md', to: 'Project.md' },
    { from: 'Plan.md', to: 'Project.md' },
    { from: 'Project.md', to: 'Plan.md' },
  ]);
  assert.deepEqual(v.orphans(), ['Lonely.md', 'notes/Plan.md']);
  assert.equal(v.linkText('notes/Plan.md'), 'notes/Plan');
  assert.equal(v.linkText('notes/Review.md'), 'Review');
});

test('vault: context is the Backlinks panel text', () => {
  const text = vault().context('Project.md');
  assert.match(text, /^Note: @Project\.md$/m);
  assert.match(text, /@notes\/Review\.md#2/);
  assert.match(text, /@Plan\.md#1/);
  assert.match(text, /Links to \(1\):\n- @Plan\.md/);
  assert.match(text, /\[\[Missing note\]\]/);
});

test('vault: renaming a note or folder plans edits that apply cleanly', () => {
  const v = vault();
  const renames = v.renames('Project.md', 'archive/Roadmap.md');
  assert.deepEqual([...renames], [['Project.md', 'archive/Roadmap.md']]);
  const edits = v.renameEdits(renames);
  const plan = applyEdits(files[1].text, edits.filter((e) => e.path === 'Plan.md'));
  assert.equal(plan, 'Back to [[Roadmap#Goals|the project]].\n');
  const review = applyEdits(files[2].text, edits.filter((e) => e.path === 'notes/Review.md'));
  assert.equal(review, 'Line one\n[md](../archive/Roadmap.md) and Project mentioned here.\n');

  const folder = v.renames('notes/', 'old');
  assert.deepEqual([...folder].sort(), [['notes/Plan.md', 'old/Plan.md'], ['notes/Review.md', 'old/Review.md']]);
  assert.equal(v.renames('nothing', 'x').size, 0);
});

test('applyEdits keeps CRLF line endings', () => {
  assert.equal(applyEdits('a [[X]]\r\nb', [{ path: 'n', line: 0, start: 4, end: 5, newText: 'Y' }]), 'a [[Y]]\r\nb');
});
