import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatWikilink, parseWikilinkInner, splitWikilinks, wikilinkLabel } from '../../src/links/wikilink';
import { findUnlinkedMentions, parseNote } from '../../src/links/parser';
import { splitTextNodes } from '../../webview/plugins/splitTextNodes';
import {
  linkTextFor, normalisePath, planRenameEdits, relativeHref, resolveMd, resolveWiki, safeNoteName,
} from '../../src/links/resolver';

test('wikilink parts: target, heading, alias, embed and the table pipe', () => {
  assert.deepEqual(parseWikilinkInner('Note'), { target: 'Note', heading: '', alias: '', embed: false });
  assert.deepEqual(parseWikilinkInner('dir/Note#Sec tion|Shown', true), { target: 'dir/Note', heading: 'Sec tion', alias: 'Shown', embed: true });
  assert.deepEqual(parseWikilinkInner('Note\\|In table').alias, 'In table');
  assert.equal(parseWikilinkInner('#Only heading').target, '');
});

test('wikilinks round-trip through format, and have a readable label', () => {
  for (const raw of ['[[Note]]', '[[a/Note#H]]', '[[Note|Alias]]', '![[Note#H|A]]']) {
    const [p] = splitWikilinks(raw) as any[];
    assert.equal(formatWikilink(p), raw);
  }
  assert.equal(wikilinkLabel(parseWikilinkInner('Note#H')), 'Note › H');
  assert.equal(wikilinkLabel(parseWikilinkInner('Note|A')), 'A');
});

test('splitWikilinks keeps the surrounding text and skips empty links', () => {
  const parts = splitWikilinks('see [[A]] and [[B|b]] or [[]] end');
  assert.equal(parts.length, 5);
  assert.equal(parts[0], 'see ');
  assert.equal((parts[1] as any).target, 'A');
  assert.equal(parts[4], ' or [[]] end');
});

const NOTE = [
  '---', 'title: "[[NotALink]]"', '---',
  'See [[Alpha]] and [[dir/Beta#Part|the beta]].',
  'Inline `[[Code]]` is ignored, as is:',
  '```md', '[[Fenced]] [x](fenced.md)', '```',
  'A [markdown link](../other/Gamma.md#sec "title") and ![embed](pic.png) and [site](https://x.dev/a.md).',
  'Encoded [d](My%20Note.md) and embed ![[Alpha]].',
].join('\n');

test('parseNote finds wiki and markdown links, not code, front matter, images or URLs', () => {
  const { links } = parseNote(NOTE);
  assert.deepEqual(links.map((l) => `${l.kind}:${l.target}`), ['wiki:Alpha', 'wiki:dir/Beta', 'md:../other/Gamma.md', 'md:My Note.md', 'wiki:Alpha']);
  assert.equal(links[1].heading, 'Part');
  assert.equal(links[1].alias, 'the beta');
  assert.equal(links[2].heading, 'sec');
  assert.equal(links[4].embed, true);
});

test('link columns point at exactly the text a rename must replace', () => {
  const { links, lines } = parseNote(NOTE);
  const cut = (l: any) => lines[l.line].slice(l.targetStart, l.targetEnd);
  assert.equal(cut(links[0]), 'Alpha');
  assert.equal(cut(links[1]), 'dir/Beta');
  assert.equal(cut(links[2]), '../other/Gamma.md');
  assert.equal(cut(links[3]), 'My%20Note.md');
  assert.equal(lines[links[1].line].slice(links[1].start, links[1].end), '[[dir/Beta#Part|the beta]]');
});

const NOTES = ['Alpha.md', 'dir/Beta.md', 'dir/Alpha.md', 'other/Gamma.md', 'deep/er/Delta.md', 'My Note.md'];

test('resolveWiki: name, path suffix, case, and the closest of several', () => {
  assert.equal(resolveWiki('Gamma', 'Alpha.md', NOTES), 'other/Gamma.md');
  assert.equal(resolveWiki('gamma.md', 'Alpha.md', NOTES), 'other/Gamma.md');
  assert.equal(resolveWiki('er/Delta', 'Alpha.md', NOTES), 'deep/er/Delta.md');
  assert.equal(resolveWiki('Alpha', 'Alpha.md', NOTES), 'Alpha.md', 'root note: exact path wins');
  assert.equal(resolveWiki('Alpha', 'dir/Beta.md', NOTES), 'Alpha.md', 'an exact path beats a same-folder name');
  assert.equal(resolveWiki('dir/Alpha', 'x.md', NOTES), 'dir/Alpha.md');
  assert.equal(resolveWiki('Missing', 'Alpha.md', NOTES), null);
  assert.equal(resolveWiki('', 'dir/Beta.md', NOTES), 'dir/Beta.md', 'heading-only link is the note itself');
  assert.equal(resolveWiki('../../etc/passwd', 'Alpha.md', NOTES), null);
});

test('resolveMd follows relative and root-relative paths and refuses to leave the root', () => {
  assert.equal(resolveMd('../other/Gamma.md', 'dir/Beta.md', NOTES), 'other/Gamma.md');
  assert.equal(resolveMd('Alpha.md', 'dir/Beta.md', NOTES), 'dir/Alpha.md');
  assert.equal(resolveMd('/Alpha.md', 'dir/Beta.md', NOTES), 'Alpha.md');
  assert.equal(resolveMd('../../x.md', 'dir/Beta.md', NOTES), null);
  assert.equal(normalisePath('a/./b/../c'), 'a/c');
});

test('linkTextFor gives the shortest text that still resolves', () => {
  assert.equal(linkTextFor('other/Gamma.md', 'Alpha.md', NOTES), 'Gamma');
  assert.equal(linkTextFor('dir/Alpha.md', 'Alpha.md', NOTES), 'dir/Alpha');
  assert.equal(linkTextFor('Alpha.md', 'dir/Beta.md', NOTES), 'Alpha');
  assert.equal(relativeHref('dir/Beta.md', 'other/My Note.md'), '../other/My%20Note.md');
  assert.equal(relativeHref('Alpha.md', 'dir/Beta.md'), 'dir/Beta.md');
});

function vault(files: Record<string, string>) {
  return Object.entries(files).map(([path, text]) => ({ path, links: parseNote(text).links, text }));
}
function apply(files: Record<string, string>, renames: Record<string, string>) {
  const v = vault(files);
  const edits = planRenameEdits(v, new Map(Object.entries(renames)));
  const out: Record<string, string> = {};
  for (const n of v) {
    const lines = n.text.split('\n');
    for (const e of edits.filter((x) => x.path === n.path).sort((a, b) => b.line - a.line || b.start - a.start)) {
      lines[e.line] = lines[e.line].slice(0, e.start) + e.newText + lines[e.line].slice(e.end);
    }
    out[renames[n.path] ?? n.path] = lines.join('\n');
  }
  return { out, edits };
}

test('renaming a note rewrites every link to it and keeps headings and aliases', () => {
  const { out } = apply(
    { 'A.md': 'x [[Old]] y [[Old#H|shown]] z [md](sub/Old.md#h) and [[Other]]', 'sub/Old.md': '# Old', 'Other.md': '[[old]]' },
    { 'sub/Old.md': 'sub/New.md' },
  );
  assert.equal(out['A.md'], 'x [[New]] y [[New#H|shown]] z [md](sub/New.md#h) and [[Other]]');
  assert.equal(out['Other.md'], '[[New]]');
});

test('moving a note to another folder leaves name-only wikilinks alone and fixes paths', () => {
  const { out, edits } = apply(
    { 'A.md': '[[Note]] [[sub/Note]] [m](sub/Note.md)', 'sub/Note.md': '[up](../A.md) [[A]]' },
    { 'sub/Note.md': 'archive/2026/Note.md' },
  );
  assert.equal(out['A.md'], '[[Note]] [[archive/2026/Note]] [m](archive/2026/Note.md)');
  assert.equal(out['archive/2026/Note.md'], '[up](../../A.md) [[A]]', "the moved note's own relative links are fixed");
  assert.equal(edits.length, 3);
});

test('a rename that makes a short name ambiguous qualifies the link', () => {
  const { out } = apply(
    { 'A.md': '[[Draft]]', 'x/Draft.md': '', 'y/Plan.md': '' },
    { 'x/Draft.md': 'x/Plan.md' },
  );
  assert.equal(out['A.md'], '[[x/Plan]]');
});

test('links that still resolve, or never did, are not touched', () => {
  const { edits } = apply({ 'A.md': '[[Keep]] [[Ghost]] [g](ghost.md)', 'Keep.md': '', 'B.md': '' }, { 'B.md': 'C.md' });
  assert.deepEqual(edits, []);
});

test('unlinked mentions: whole words, any case, not inside links or code', () => {
  const note = parseNote([
    'Project Atlas is mentioned, and atlas again.',
    'Not Atlases, not `Atlas`, not [[Atlas]] or [[X|Atlas]] or [Atlas](a.md) or https://x.dev/Atlas.',
    '```', 'Atlas', '```',
  ].join('\n'));
  const found = findUnlinkedMentions(note, 'Atlas');
  assert.deepEqual(found.map((m) => [m.line, m.start]), [[0, 8], [0, 32]]);
  assert.deepEqual(findUnlinkedMentions(note, 'At'), [], 'names under three characters are not searched');
});

test('safeNoteName accepts ordinary names and refuses traversal and device characters', () => {
  assert.equal(safeNoteName('New Idea'), 'New Idea.md');
  assert.equal(safeNoteName('area/New Idea.md'), 'area/New Idea.md');
  for (const bad of ['../x', '', '  ', 'a/../../b', 'what?', 'a:b', 'x'.repeat(200)]) assert.equal(safeNoteName(bad), null, bad);
});

test('the Markdown tree: text is split into wikilink nodes; links and code are left alone', () => {
  const tree: any = { type: 'root', children: [
    { type: 'paragraph', children: [
      { type: 'text', value: 'a [[One]] b [[Two#H|t]]' },
      { type: 'inlineCode', value: '[[Code]]' },
      { type: 'link', url: 'x', children: [{ type: 'text', value: '[[InLink]]' }] },
    ] },
    { type: 'code', value: '[[Fenced]]' },
  ] };
  splitTextNodes(tree);
  const p = tree.children[0].children;
  assert.deepEqual(p.map((n: any) => n.type), ['text', 'wikilink', 'text', 'wikilink', 'inlineCode', 'link']);
  assert.deepEqual([p[1].target, p[3].target, p[3].heading, p[3].alias], ['One', 'Two', 'H', 't']);
  assert.equal(p[5].children[0].type, 'text');
});
