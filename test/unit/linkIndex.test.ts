import { test } from 'node:test';
import assert from 'node:assert/strict';
import { files, Uri } from '../stubs/vscode';
import { LinkIndex } from '../../src/links/linkIndex';

async function vault(contents: Record<string, string>) {
  files.clear();
  for (const [p, t] of Object.entries(contents)) files.set(`/ws/${p}`, t);
  const index = new LinkIndex();
  await index.whenReady();
  return index;
}
const u = (p: string) => new Uri(`/ws/${p}`) as any;
function applied(index: LinkIndex, renames: Array<[string, string]>) {
  const edit: any = index.renameEdit(renames.map(([a, b]) => ({ oldUri: u(a), newUri: u(b) })));
  const out = new Map(files);
  for (const e of (edit?.edits ?? []).sort((a: any, b: any) => b.range.l1 - a.range.l1 || b.range.c1 - a.range.c1)) {
    const lines = out.get(e.uri.path)!.split('\n');
    lines[e.range.l1] = lines[e.range.l1].slice(0, e.range.c1) + e.text + lines[e.range.l1].slice(e.range.c2);
    out.set(e.uri.path, lines.join('\n'));
  }
  return { out, count: edit?.edits.length ?? 0 };
}

test('backlinks list every linking line, grouped by source order; self-links are excluded', async () => {
  const index = await vault({
    'Hub.md': '# Hub\n[[Hub]] self',
    'a/One.md': 'first [[Hub]]\nsecond [h](../Hub.md)',
    'b/Two.md': 'see [[hub|the hub]]',
    'c/Three.md': 'nothing here, `[[Hub]]` in code',
  });
  const back = index.backlinks(u('Hub.md'));
  assert.deepEqual(back.map((b) => `${b.sourcePath}:${b.link.line}:${b.link.kind}`), ['a/One.md:0:wiki', 'a/One.md:1:md', 'b/Two.md:0:wiki']);
  assert.equal(back[0].text, 'first [[Hub]]');
  index.dispose();
});

test('unlinked mentions and unresolved targets', async () => {
  const index = await vault({
    'Atlas.md': '# Atlas',
    'Notes.md': 'The atlas project. Also [[Atlas]] and [[Nowhere]] and [[Nowhere]].',
  });
  assert.deepEqual(index.unlinkedMentions(u('Atlas.md')).map((m) => [m.sourcePath, m.line, m.start]), [['Notes.md', 0, 4]]);
  assert.deepEqual(index.unresolvedTargets(u('Notes.md')), ['Nowhere']);
  assert.equal(index.resolveTarget(u('Notes.md'), 'atlas')?.path, '/ws/Atlas.md');
  assert.equal(index.resolveTarget(u('Notes.md'), 'Nowhere'), undefined);
  index.dispose();
});

test('renaming a note produces one edit per link that would break', async () => {
  const index = await vault({ 'A.md': '[[Old]] and [m](sub/Old.md)', 'B.md': '[[Old#H|x]]', 'sub/Old.md': '', 'C.md': '[[A]]' });
  const { out, count } = applied(index, [['sub/Old.md', 'sub/New.md']]);
  assert.equal(count, 3);
  assert.equal(out.get('/ws/A.md'), '[[New]] and [m](sub/New.md)');
  assert.equal(out.get('/ws/B.md'), '[[New#H|x]]');
  index.dispose();
});

test('renaming a folder rewrites path links to every note under it', async () => {
  const index = await vault({
    'Home.md': '[[proj/Plan]] [[Plan]] [p](proj/Plan.md) [n](proj/deep/Note.md)',
    'proj/Plan.md': '[[Home]] [n](deep/Note.md)',
    'proj/deep/Note.md': '[up](../Plan.md) [home](../../Home.md)',
  });
  const { out } = applied(index, [['proj', 'work']]);
  assert.equal(out.get('/ws/Home.md'), '[[work/Plan]] [[Plan]] [p](work/Plan.md) [n](work/deep/Note.md)');
  assert.equal(out.get('/ws/proj/Plan.md'), '[[Home]] [n](deep/Note.md)', 'links inside the moved folder still resolve');
  assert.equal(out.get('/ws/proj/deep/Note.md'), '[up](../Plan.md) [home](../../Home.md)');
  index.dispose();
});

test('a rename that breaks nothing returns no edit', async () => {
  const index = await vault({ 'A.md': '[[B]]', 'B.md': '', 'C.md': '' });
  assert.equal(index.renameEdit([{ oldUri: u('C.md'), newUri: u('D.md') }]), undefined);
  assert.equal(index.renameEdit([{ oldUri: u('pic.png'), newUri: u('pic2.png') }]), undefined);
  index.dispose();
});
