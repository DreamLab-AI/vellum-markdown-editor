import { test } from 'node:test';
import assert from 'node:assert/strict';
import { files, stage, TabInputCustom, Uri } from '../stubs/vscode';
import { graphBounds, noteNeighbourhood } from '../../src/links/graph';
import { createResolver, resolveLink } from '../../src/links/resolver';
import { parseNote } from '../../src/links/parser';
import { Vault } from '../../src/links/vault';
import { LinkIndex } from '../../src/links/linkIndex';
import { parseGraphRequest } from '../../src/graph/messages';
import { GraphPanel } from '../../src/graph/graphPanel';

const contents: Record<string, string> = {
  'Project.md': '# Project\nSee [[Plan]], [[Plan|again]] and [[Missing note]].\n[[#Goals]] is this note.\n',
  'Plan.md': 'Back to [[Project#Goals|the project]]. Also [[missing NOTE]].\n',
  'notes/Review.md': '[md](../Project.md) and [[Plan]] and [broken](../nowhere.md).\n',
  'notes/Plan.md': 'A second plan: [[Review]].\n',
  'Far.md': '[[notes/Plan]]\n',
  'Lonely.md': 'Nobody links here. `[[Project]]` is code.\n---\n',
  'Typed.md': '---\nsubclass-of: ["[[Project]]"]\n---\nBody.\n',
};
const notes = Object.entries(contents).map(([path, text]) => ({ path, ...parseNote(text) }));
const ids = (g: { nodes: Array<{ id: string }> }) => g.nodes.map((n) => n.id);

test('graph: one hop takes links in both directions and shows a missing note once', () => {
  const g = noteNeighbourhood(notes, 'Project.md')!;
  assert.deepEqual(ids(g), ['Project.md', 'notes/Review.md', 'Plan.md', '/?missing note']);
  assert.deepEqual(g.edges, [
    { source: 'notes/Review.md', target: 'Plan.md' },
    { source: 'notes/Review.md', target: 'Project.md' },
    { source: 'Plan.md', target: '/?missing note' },
    { source: 'Plan.md', target: 'Project.md' },
    { source: 'Project.md', target: '/?missing note' },
    { source: 'Project.md', target: 'Plan.md' },
  ]);
  const missing = g.nodes.find((n) => n.missing)!;
  assert.deepEqual([missing.label, missing.path, missing.depth], ['Missing note', undefined, 1], 'labelled as first written; not a file');
  assert.equal(g.nodes[0].depth, 0);
  assert.equal(g.truncated, false);
  assert.equal(g.hidden, 0);
});

test('graph: front matter and code are not links, a broken Markdown link is not a note, a self-link is not an edge', () => {
  const g = noteNeighbourhood(notes, 'Project.md', { depth: 3 })!;
  assert.ok(!ids(g).includes('Typed.md'), 'a front matter reference is not a navigation link');
  assert.ok(!ids(g).includes('Lonely.md'));
  assert.ok(!ids(g).some((id) => id.includes('nowhere')));
  assert.ok(!g.edges.some((e) => e.source === e.target));
});

test('graph: depth widens the neighbourhood and names clashing notes by folder', () => {
  const two = noteNeighbourhood(notes, 'Project.md', { depth: 2 })!;
  assert.deepEqual(ids(two).slice(4), ['notes/Plan.md']);
  assert.equal(two.nodes.find((n) => n.id === 'notes/Plan.md')!.depth, 2);
  assert.deepEqual(two.nodes.filter((n) => n.id.endsWith('Plan.md')).map((n) => n.label), ['Plan', 'notes/Plan']);
  assert.equal(two.nodes.find((n) => n.id === 'notes/Review.md')!.label, 'Review');
  const three = noteNeighbourhood(notes, 'Project.md', { depth: 3 })!;
  assert.ok(ids(three).includes('Far.md'));
  assert.equal(three.nodes.find((n) => n.id === 'Plan.md')!.degree, 3, 'degree counts the whole root: Project, Review and the missing note');
});

test('graph: the node bound keeps nearer notes, prefers real notes, and reports what it hid', () => {
  const hub = [
    { path: 'Hub.md', ...parseNote(Array.from({ length: 30 }, (_, i) => `[[N${String(i).padStart(2, '0')}]] [[Gone${i}]]`).join('\n')) },
    ...Array.from({ length: 30 }, (_, i) => ({ path: `N${String(i).padStart(2, '0')}.md`, ...parseNote('[[Deep]]') })),
    { path: 'Deep.md', ...parseNote('') },
  ];
  const g = noteNeighbourhood(hub, 'Hub.md', { depth: 2, maxNodes: 12 })!;
  assert.equal(g.nodes.length, 12);
  assert.deepEqual(ids(g).slice(1), Array.from({ length: 11 }, (_, i) => `N${String(i).padStart(2, '0')}.md`));
  assert.equal(g.truncated, true);
  assert.equal(g.hidden, 50, '19 notes and 30 missing notes one link away, and one note two away');
  assert.ok(g.edges.every((e) => ids(g).includes(e.source) && ids(g).includes(e.target)));
  const all = noteNeighbourhood(hub, 'Hub.md', { depth: 2, maxNodes: 1000 })!;
  assert.equal(all.nodes.length, 62);
  assert.equal(all.truncated, false);
});

test('graph: bounds are clamped to whole numbers in range, and an unknown centre has no graph', () => {
  assert.deepEqual(graphBounds(), { depth: 1, maxNodes: 150 });
  assert.deepEqual(graphBounds({ depth: 99, maxNodes: 1 }), { depth: 3, maxNodes: 10 });
  assert.deepEqual(graphBounds({ depth: 2.9, maxNodes: NaN }), { depth: 2, maxNodes: 150 });
  assert.deepEqual(graphBounds({ depth: '2' as any, maxNodes: 5000 }), { depth: 1, maxNodes: 1000 });
  assert.equal(noteNeighbourhood(notes, 'Nope.md'), undefined);
});

test('graph: the hidden count covers every level in range, not only the one that was cut', () => {
  const chain = [
    { path: 'A.md', ...parseNote(Array.from({ length: 12 }, (_, i) => `[[B${i}]]`).join(' ')) },
    ...Array.from({ length: 12 }, (_, i) => ({ path: `B${i}.md`, ...parseNote(`[[C${i}]]`) })),
    ...Array.from({ length: 12 }, (_, i) => ({ path: `C${i}.md`, ...parseNote('') })),
  ];
  const g = noteNeighbourhood(chain, 'A.md', { depth: 2, maxNodes: 10 })!;
  assert.equal(g.nodes.length, 10);
  assert.equal(g.hidden, 15, '3 one link away and 12 two links away');
  assert.ok(g.nodes.every((n) => n.depth <= 1));
});

test('graph: spellings that resolution treats alike name one missing note, with a stable label', () => {
  const a = { path: 'a.md', ...parseNote('[[./Gone]] [[gone.md]] [[Gone]] [[GONE]]') };
  const b = { path: 'b.md', ...parseNote('[[gone]] [[a]]') };
  for (const order of [[a, b], [b, a]]) {
    const g = noteNeighbourhood(order, 'a.md')!;
    assert.deepEqual(g.nodes.filter((n) => n.missing).map((n) => [n.id, n.label]), [['/?gone', 'GONE']]);
  }
});

test('graph: the indexed resolver agrees with resolveLink on every link', () => {
  const paths = ['Plan.md', 'notes/Plan.md', 'notes/deep/Plan.md', 'a/b/Note.md', 'a/Note.markdown', 'x/A B.md', 'UPPER/Mixed.md', 'a/b.md', 'b.md'];
  const targets = ['Plan', 'plan', 'notes/Plan', 'deep/plan', 'Note', 'b/Note', 'a/Note', 'A B', 'mixed', 'upper/MIXED', 'b', 'a/b', './Plan', '../Plan', 'x/../Plan',
    'Plan.md', 'Note.markdown', 'nope', '', '  ', '/', 'notes/', '/Plan', 'notes//Plan', 'lan', 's/Plan'];
  const hrefs = ['Plan.md', './Plan.md', '../Plan.md', 'deep/Plan.md', '/notes/Plan.md', '/NOTES/plan.md', 'plan.md', '../../Plan.md', 'b/Note.md', '../a/b.md', 'nope.md', '', '/'];
  const fast = createResolver(paths);
  let checked = 0;
  for (const source of paths) {
    for (const [kind, list] of [['wiki', targets], ['md', hrefs]] as const) {
      for (const target of list) {
        const link = { kind, target } as any;
        assert.equal(fast(link, source), resolveLink(link, source, paths), `${kind} "${target}" from ${source}`);
        checked++;
      }
    }
  }
  assert.equal(checked, paths.length * (targets.length + hrefs.length));
});

async function indexed() {
  files.clear();
  for (const [p, t] of Object.entries(contents)) files.set(`/ws/${p}`, t);
  const index = new LinkIndex();
  await index.whenReady();
  return index;
}
const u = (p: string) => new Uri(`/ws/${p}`) as any;

test('graph: the extension index and the CLI vault give the same graph, and only notes have URIs', async () => {
  const index = await indexed();
  const vault = new Vault(Object.entries(contents).map(([path, text]) => ({ path, text })));
  for (const bounds of [{}, { depth: 2 }, { depth: 3, maxNodes: 10 }]) {
    assert.deepEqual(index.neighbourhood(u('Project.md'), bounds)!.graph, vault.neighbourhood('Project.md', bounds));
  }
  const found = index.neighbourhood(u('Project.md'))!;
  assert.deepEqual([...found.uris.keys()], ['Project.md', 'notes/Review.md', 'Plan.md']);
  assert.equal(found.uris.get('notes/Review.md')!.toString(), 'file:///ws/notes/Review.md');
  assert.equal(found.root, 'file:///ws');
  assert.equal(index.neighbourhood(u('Absent.md')), undefined);
  index.dispose();
});

test('graph messages: only the three requests pass, with exact shapes', () => {
  assert.deepEqual(parseGraphRequest({ type: 'ready', extra: 1 }), { type: 'ready' });
  assert.deepEqual(parseGraphRequest({ type: 'open', generation: 3, id: 'Plan.md', uri: 'file:///etc/passwd' }), { type: 'open', generation: 3, id: 'Plan.md' });
  assert.deepEqual(parseGraphRequest({ type: 'bounds', depth: 2, maxNodes: 300 }), { type: 'bounds', depth: 2, maxNodes: 300 });
  for (const bad of [
    null, undefined, 'open', 7, [], [{ type: 'ready' }], {}, { type: 'command', command: 'workbench.action.files.delete' },
    { type: 'open', generation: 1 }, { type: 'open', generation: 1, id: '' }, { type: 'open', generation: 1, id: 5 },
    { type: 'open', generation: -1, id: 'a' }, { type: 'open', generation: 1.5, id: 'a' }, { type: 'open', generation: '1', id: 'a' },
    { type: 'open', generation: 1, id: 'x'.repeat(4097) },
    { type: 'bounds', depth: 0, maxNodes: 150 }, { type: 'bounds', depth: 4, maxNodes: 150 }, { type: 'bounds', depth: 1, maxNodes: 1001 },
    { type: 'bounds', depth: 1, maxNodes: 9 }, { type: 'bounds', depth: 1.5, maxNodes: 150 }, { type: 'bounds', depth: 1 },
  ]) assert.equal(parseGraphRequest(bad), undefined, JSON.stringify(bad));
});

const settle = () => new Promise((r) => setTimeout(r, 0));
async function opened(note = 'Project.md') {
  stage.reset();
  const index = await indexed();
  stage.input = new TabInputCustom(u(note));
  stage.column = 1;
  GraphPanel.show(new Uri('/ext') as any, index);
  await settle();
  const panel = stage.panels[0];
  return { index, panel, lastGraph: () => stage.posted.filter((m) => m.type === 'graph').at(-1) };
}

test('graph panel: opens beside without taking focus, under a strict policy, and sends the neighbourhood', async () => {
  const { index, panel, lastGraph } = await opened();
  assert.deepEqual(panel.show, { viewColumn: -2, preserveFocus: true });
  assert.deepEqual(panel.options.localResourceRoots.map(String), ['file:///ext/dist']);
  const csp = /Content-Security-Policy" content="([^"]+)"/.exec(panel.webview.html)![1];
  const nonce = /script-src 'nonce-([0-9a-f]+)'/.exec(csp)![1];
  assert.equal(csp, `default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}' 'wasm-unsafe-eval';`);
  assert.ok(!/unsafe-inline|'unsafe-eval'|https:|connect-src|worker-src/.test(csp));
  assert.ok(panel.webview.html.includes(`<script nonce="${nonce}" src="file:///webview/ext/dist/graph.js"></script>`));
  assert.ok(!/ on[a-z]+=|style="/.test(panel.webview.html), 'no inline handlers or style attributes');
  const sent = lastGraph();
  assert.equal(sent.title, 'Project');
  assert.equal(sent.graph.centre, 'Project.md');
  assert.equal(sent.graph.nodes.length, 4);
  panel.dispose(); index.dispose();
});

test('graph panel: opens only a note in the graph on screen, in the note\'s column', async () => {
  const { index, panel, lastGraph } = await opened();
  const generation = lastGraph().generation;
  panel.receive({ type: 'open', generation, id: 'Plan.md' });
  assert.deepEqual(stage.executed.map((a) => [a[0], String(a[1]), a[2], a[3]]), [
    ['vscode.openWith', 'file:///ws/Plan.md', 'markdownLive.editor', { viewColumn: 1, preserveFocus: false }],
  ]);
  stage.executed = [];
  panel.receive({ type: 'open', generation, id: '/?missing note' });          // not a file
  panel.receive({ type: 'open', generation, id: 'Far.md' });                  // a real note, not on screen
  panel.receive({ type: 'open', generation, id: '../../etc/passwd' });
  panel.receive({ type: 'open', generation, id: 'file:///ws/Plan.md' });
  panel.receive({ type: 'open', generation: generation - 1, id: 'Plan.md' }); // from a graph since replaced
  panel.receive({ type: 'run', command: 'workbench.action.terminal.new' });
  assert.deepEqual(stage.executed, []);
  panel.dispose(); index.dispose();
});

test('graph panel: follows the note in focus, keeps its graph when its own tab has focus, and applies bounds', async () => {
  const { index, panel, lastGraph } = await opened();
  stage.input = new TabInputCustom(u('notes/Plan.md')); stage.column = 2;
  stage.tabsChanged.fire(); await settle();
  assert.equal(lastGraph().graph.centre, 'notes/Plan.md');
  const count = stage.posted.length;
  stage.input = undefined;                       // the graph's own tab, or a non-Markdown file
  stage.tabsChanged.fire(); await settle();
  assert.equal(stage.posted.length, count, 'nothing is re-sent and the graph stays');
  panel.receive({ type: 'open', generation: lastGraph().generation, id: 'notes/Review.md' });
  assert.equal(stage.executed.at(-1)![3].viewColumn, 2, 'opens where the followed note is');
  panel.receive({ type: 'bounds', depth: 2, maxNodes: 10 }); await settle();
  assert.deepEqual([lastGraph().graph.depth, lastGraph().graph.maxNodes], [2, 10]);
  panel.receive({ type: 'bounds', depth: 9, maxNodes: 10 }); await settle();
  assert.equal(lastGraph().graph.depth, 2, 'an out-of-range request is dropped');
  const before = stage.posted.length;
  panel.receive({ type: 'ready' });
  assert.deepEqual(stage.posted.at(-1), stage.posted[before - 1], 'a reloaded webview gets the current graph again');
  panel.dispose(); index.dispose();
});

test('graph panel: a hidden panel does no work and catches up when shown', async () => {
  const { index, panel, lastGraph } = await opened();
  const count = stage.posted.length;
  panel.setVisible(false);
  stage.input = new TabInputCustom(u('Plan.md'));
  stage.tabsChanged.fire(); await settle();
  files.set('/ws/Plan.md', '[[Far]]');
  await (index as any).loadFromDisk(u('Plan.md'));       // as the file watcher would
  await new Promise((r) => setTimeout(r, 300));          // past the index's change debounce
  assert.equal(stage.posted.length, count, 'nothing is computed or sent while hidden');
  panel.setVisible(true); await settle();
  assert.equal(stage.posted.length, count + 1, 'one refresh covers everything missed');
  assert.equal(lastGraph().graph.centre, 'Plan.md');
  assert.ok(lastGraph().graph.nodes.some((n: { id: string }) => n.id === 'Far.md'));
  panel.dispose(); index.dispose();
});

test('graph panel: says why there is no graph, reuses one panel, honours the depth setting, and cleans up', async () => {
  stage.reset();
  const index = await indexed();
  stage.settings['graph.depth'] = 2;
  GraphPanel.show(new Uri('/ext') as any, index); await settle();
  assert.match(stage.posted.at(-1).message, /Open a Markdown note/);
  stage.input = new TabInputCustom(new Uri('/elsewhere/Out.md') as any);
  stage.tabsChanged.fire(); await settle();
  assert.match(stage.posted.at(-1).message, /"Out" is outside the workspace folders/);
  stage.input = new TabInputCustom(u('Unindexed.md'));
  stage.tabsChanged.fire(); await settle();
  assert.match(stage.posted.at(-1).message, /"Unindexed" is not in the link index/);
  stage.input = new TabInputCustom(u('Project.md'));
  GraphPanel.show(new Uri('/ext') as any, index); await settle();
  assert.equal(stage.panels.length, 1, 'the open panel is revealed, not duplicated');
  assert.equal(stage.panels[0].revealed, 1);
  assert.equal(stage.posted.at(-1).graph.depth, 2);
  const panel = stage.panels[0];
  panel.dispose();
  const count = stage.posted.length;
  stage.tabsChanged.fire(); await settle();
  assert.equal(stage.posted.length, count, 'a closed panel posts nothing');
  GraphPanel.show(new Uri('/ext') as any, index); await settle();
  assert.equal(stage.panels.length, 1, 'and a new one can be opened');
  stage.panels[0].dispose(); index.dispose();
});
