import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseNote } from '../../src/links/parser';
import { planRenameEdits, resolveLink } from '../../src/links/resolver';
import { applyEdits, Vault } from '../../src/links/vault';

// An image whose click opens a note, as CommonMark writes it.
const imageLink = '[![alt](img.png)](dir/Note.md)';

test('md links: an image wrapped in a link to a note is one link to the note', () => {
  const { links, lines } = parseNote(imageLink);
  assert.equal(links.length, 1);
  const l = links[0];
  assert.equal(l.kind, 'md');
  assert.equal(l.embed, false);
  assert.equal(l.alias, '![alt](img.png)');
  assert.equal(l.target, 'dir/Note.md');
  assert.equal(lines[0].slice(l.targetStart, l.targetEnd), 'dir/Note.md');
  assert.equal(lines[0].slice(l.start, l.end), imageLink);
  assert.equal(resolveLink(l, 'root.md', ['root.md', 'dir/Note.md']), 'dir/Note.md');
});

test('md links: renaming the note behind an image link rewrites only the path', () => {
  const notes = [
    { path: 'root.md', ...parseNote(imageLink) },
    { path: 'dir/Note.md', ...parseNote('') },
  ];
  const edits = planRenameEdits(notes, new Map([['dir/Note.md', 'other/Note.md']]));
  assert.deepEqual(edits, [
    { path: 'root.md', line: 0, start: 18, end: 29, newText: 'other/Note.md' },
  ]);
  const text = applyEdits(imageLink, edits);
  assert.equal(text, '[![alt](img.png)](other/Note.md)');
  const after = parseNote(text).links;
  assert.equal(after.length, 1);
  assert.equal(resolveLink(after[0], 'root.md', ['root.md', 'other/Note.md']), 'other/Note.md');
});

test('md links: an image-wrapped link is a backlink', () => {
  const vault = new Vault([
    { path: 'root.md', text: imageLink },
    { path: 'dir/Note.md', text: 'Nothing here.' },
  ]);
  assert.deepEqual(vault.backlinks('dir/Note.md').map((b) => b.source), ['root.md']);
});

test('md links: escaped brackets and spaced forms keep their exact spans', () => {
  const { links } = parseNote('[a\\]b](peer.md) [c]( <d e.md> )');
  assert.deepEqual(
    links.map((l) => [l.alias, l.target, l.targetStart, l.targetEnd]),
    [
      ['a\\]b', 'peer.md', 7, 14],
      ['c', 'd e.md', 22, 28],
    ],
  );
});
