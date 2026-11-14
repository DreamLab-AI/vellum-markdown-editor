import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildLinkContext, chooseTarget, clampPosition, claudeOpenUri, endOfPrefix, fingerprint, formatReference, locateLines,
} from '../../src/ai/reference';

test('formatReference matches the form Claude Code documents (@app.ts#5-10)', () => {
  assert.equal(formatReference('app.ts', { start: 5, end: 10 }), '@app.ts#5-10');
  assert.equal(formatReference('notes/a b.md', { start: 7, end: 7 }), '@notes/a b.md#7');
  assert.equal(formatReference('dir\\x.md'), '@dir/x.md');
});

test('fingerprint ignores Markdown punctuation, case and spacing', () => {
  assert.equal(fingerprint('* **Bold** item'), fingerprint('- bold  item'));
  assert.equal(fingerprint('## Über 2'), 'über2');
});

const SOURCE = ['---', 'title: T', '---', '', '# Heading', '', '', '', '*   first item', '*   second item', '', 'A paragraph with **bold** text', 'that continues here.', '', 'Repeat', '', 'Repeat'].join('\n');

test('locateLines keeps an exact estimate', () => {
  assert.deepEqual(locateLines(SOURCE, { text: '', startLine: 12, endLine: 13, fpStart: 'aparag', fpEnd: 'thatcontin' }), { start: 12, end: 13 });
});

test('locateLines corrects drift from collapsed blank lines, in either direction', () => {
  // The editor serialises three blank lines as one, so its estimate is two short.
  assert.deepEqual(locateLines(SOURCE, { text: '', startLine: 7, endLine: 8, fpStart: 'first', fpEnd: 'seconditem' }), { start: 9, end: 10 });
  assert.deepEqual(locateLines(SOURCE, { text: '', startLine: 14, endLine: 15, fpStart: 'apara', fpEnd: 'that' }), { start: 12, end: 13 });
});

test('locateLines picks the occurrence nearest the estimate, and never ends before it starts', () => {
  assert.deepEqual(locateLines(SOURCE, { text: '', startLine: 17, endLine: 17, fpStart: 'repeat', fpEnd: 'repeat' }), { start: 17, end: 17 });
  // Equally near two matches: the earlier one.
  assert.deepEqual(locateLines(SOURCE, { text: '', startLine: 16, endLine: 16, fpStart: 'repeat', fpEnd: 'repeat' }), { start: 15, end: 15 });
  assert.deepEqual(locateLines(SOURCE, { text: '', startLine: 15, endLine: 15, fpStart: 'repeat', fpEnd: 'repeat' }), { start: 15, end: 15 });
  const r = locateLines(SOURCE, { text: '', startLine: 12, endLine: 13, fpStart: 'aparagraph', fpEnd: 'heading' })!;
  assert.ok(r.end >= r.start);
});

test('locateLines clamps wild estimates and reports nothing without a position', () => {
  assert.deepEqual(locateLines('one\ntwo', { text: '', startLine: 99, endLine: 120, fpStart: '', fpEnd: '' }), { start: 2, end: 2 });
  assert.equal(locateLines(SOURCE, { text: 'x' }), undefined);
});

test('endOfPrefix: the line a serialised prefix ends on, after front matter', () => {
  assert.deepEqual(endOfPrefix('# H\n\npara one\n\n- it'), { line: 5, fp: 'it' });
  assert.deepEqual(endOfPrefix('# H\n\n', 3), { line: 4, fp: 'h' });
});

test('buildLinkContext lists the note, who links to it, what it links to and what is missing', () => {
  const text = buildLinkContext({
    note: 'Hub.md',
    backlinks: [{ path: 'a/One.md', line: 3 }, { path: 'a/One.md', line: 3 }, { path: 'b/Two.md', line: 1 }],
    outgoing: ['x/Out.md', 'Hub.md', 'x/Out.md'],
    unresolved: ['Ghost'],
  });
  assert.equal(text, [
    'Note: @Hub.md', '',
    'Linked from (2):', '- @a/One.md#3', '- @b/Two.md#1', '',
    'Links to (1):', '- @x/Out.md', '',
    'Links to notes that do not exist yet: [[Ghost]]',
  ].join('\n'));
  assert.equal(buildLinkContext({ note: 'Solo.md', backlinks: [], outgoing: [], unresolved: [] }), 'Note: @Solo.md');
});

test('buildLinkContext caps long lists and says how many were left out', () => {
  const backlinks = Array.from({ length: 5 }, (_, i) => ({ path: `n${i}.md`, line: 1 }));
  const text = buildLinkContext({ note: 'H.md', backlinks, outgoing: [], unresolved: [] }, 3);
  assert.match(text, /Linked from \(5\):/);
  assert.match(text, /… and 2 more/);
  assert.equal((text.match(/^- @n/gm) || []).length, 3);
});

test('claudeOpenUri is the documented handler with an encoded prompt', () => {
  assert.equal(claudeOpenUri('review @a b.md#1-2 & more'), 'vscode://anthropic.claude-code/open?prompt=review%20%40a%20b.md%231-2%20%26%20more');
});

test('chooseTarget: an explicit setting wins; auto prefers Claude, then Antigravity, then chat', () => {
  assert.equal(chooseTarget('clipboard', { claude: true, antigravity: true }), 'clipboard');
  assert.equal(chooseTarget('auto', { claude: true, antigravity: true }), 'claude');
  assert.equal(chooseTarget(undefined, { claude: false, antigravity: true }), 'antigravity');
  assert.equal(chooseTarget('nonsense', { claude: false, antigravity: false }), 'chat');
});

test('clampPosition keeps a cursor inside a document that shrank', () => {
  assert.equal(clampPosition(50, 20), 20);
  assert.equal(clampPosition(5, 20), 5);
  assert.equal(clampPosition(-1, 20), 0);
});

// Values the built editor reported in Chromium for a note with front matter and
// three collapsed blank lines (2026-11-14). Its estimates are two lines short;
// the host must land on the true lines.
test('end to end: selections reported by the editor resolve to the true source lines', () => {
  const filler = Array.from({ length: 40 }, (_, i) => `Filler paragraph number ${i} with some words in it.`).join('\n\n');
  const doc = ['---', 'title: Harness', 'tags: [a]', '---', '', '# Title', '', '', '', 'First paragraph with **bold** words.', '', '*   alpha item', '*   beta item with [[Link]]', '*   gamma item', '', '## Target section', '', 'The quick brown fox', 'jumps over the lazy dog.', '', filler, '', 'Last line of the note.', ''].join('\n');
  const at = (startLine: number, endLine: number, fpStart: string, fpEnd: string) => locateLines(doc, { text: 'x', startLine, endLine, fpStart, fpEnd });
  assert.deepEqual(at(8, 8, 'firstparagraphwithboldwords', 'firstparagraphwithboldwords'), { start: 10, end: 10 });
  assert.deepEqual(at(11, 12, 'betaitemwithlink', 'gammaitem'), { start: 13, end: 14 });
  assert.deepEqual(at(16, 17, 'thequickbrownfox', 'jumpsoverthelazydog'), { start: 18, end: 19 });
  assert.deepEqual(at(99, 99, 'lastlineofthenote', 'lastlineofthenote'), { start: 101, end: 101 });
  assert.equal(formatReference('notes/Harness.md', at(16, 17, 'thequickbrownfox', 'jumpsoverthelazydog')), '@notes/Harness.md#18-19');
});
