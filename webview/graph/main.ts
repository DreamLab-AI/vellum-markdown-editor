// The note graph webview. Draws the graph the extension sends with Ontomark's
// shared renderer and arranges it with the vowl-wasm force layout, both bundled
// here. It reads no files and makes no requests; it can ask the extension for
// three things only (see src/graph/messages.ts).
import { mountGraph } from '@dreamlab-ai/ontomark-graph';
import type { GraphData, GraphNode, GraphView } from '@dreamlab-ai/ontomark-graph';
import { createLayout, vowlEngine } from '@dreamlab-ai/ontomark-graph/layout';
import type { Layout } from '@dreamlab-ai/ontomark-graph/layout';
import init, * as vowl from '@dreamlab-ai/vowl-wasm';
import wasmBytes from '@dreamlab-ai/vowl-wasm/vowl_wasm_bg.wasm';
import type { GraphPayload, GraphRequest } from '../../src/graph/messages';
import type { NoteGraph } from '../../src/links/graph';

declare function acquireVsCodeApi(): { postMessage(message: GraphRequest): void };

(() => {
  // Private to this closure: nothing else in the page can reach the extension.
  const vscode = acquireVsCodeApi();
  const root = document.getElementById('graph-root');
  if (!root) return;

  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  };

  // ── Page ───────────────────────────────────────────────────────────────
  const bar = el('div', 'bar');
  const title = el('span', 'title', 'Note Graph');
  const search = el('input');
  search.type = 'search';
  search.placeholder = 'Find a note…';
  search.setAttribute('aria-label', 'Find a note in the graph');
  const depthLabel = el('label', '', 'Links away ');
  const depth = el('select');
  depth.setAttribute('aria-label', 'How many links away from this note to show');
  depthLabel.append(depth);
  const fit = el('button', '', 'Fit');
  fit.type = 'button';
  bar.append(title, search, depthLabel, fit);

  const notice = el('div', 'notice');
  notice.hidden = true;
  notice.setAttribute('role', 'status');
  const noticeText = el('span');
  const more = el('button', '', 'Show more');
  more.type = 'button';
  notice.append(noticeText, more);

  const surface = el('div', 'surface');
  const empty = el('div', 'empty', 'Loading the link index…');
  surface.hidden = true;

  const listBox = el('details');
  const listSummary = el('summary', '', 'Notes in this graph');
  const list = el('div', 'list');
  listBox.append(listSummary, list);
  listBox.hidden = true;

  const foot = el('div', 'foot');
  foot.setAttribute('role', 'status');
  foot.setAttribute('aria-live', 'polite');
  root.append(bar, notice, surface, empty, listBox, foot);

  // ── State ──────────────────────────────────────────────────────────────
  let view: GraphView | null = null;
  let layout: Layout | null = null;
  let layoutNote = 'Arranging…';
  let current: Extract<GraphPayload, { type: 'graph' }> | null = null;
  let data: GraphData = { nodes: [], edges: [] };
  /** True from a new centre until the layout settles or the reader moves the view. */
  let autoFit = false;

  const theme = () => {
    const style = getComputedStyle(document.documentElement);
    const pick = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
    return {
      background: pick('--vscode-editor-background', '#ffffff'),
      foreground: pick('--vscode-editor-foreground', '#333333'),
      note: pick('--vscode-charts-blue', '#3794ff'),
      centre: pick('--vscode-charts-orange', '#d18616'),
      missing: pick('--vscode-disabledForeground', '#8a8a8a'),
      edge: pick('--vscode-descriptionForeground', '#8a8a8a'),
    };
  };

  function toData(graph: NoteGraph): GraphData {
    const t = theme();
    return {
      nodes: graph.nodes.map((n) => ({
        id: n.id,
        label: n.label,
        degree: n.degree,
        // Shape as well as colour: a missing note is a diamond, a note a circle.
        shape: n.missing ? 'diamond' : 'circle',
        color: n.missing ? t.missing : n.id === graph.centre ? t.centre : t.note,
      })),
      edges: graph.edges.map((e) => ({ source: e.source, target: e.target, color: t.edge })),
    };
  }

  const missing = (id: string) => current?.graph.nodes.find((n) => n.id === id)?.missing ?? true;

  function activate(node: GraphNode): void {
    if (!current) return;
    if (missing(node.id)) {
      foot.textContent = `"${node.label}" does not exist yet. Follow the link in a note to create it.`;
      return;
    }
    vscode.postMessage({ type: 'open', generation: current.generation, id: node.id });
  }

  function describe(): void {
    if (!current) return;
    const g = current.graph;
    const notes = g.nodes.filter((n) => !n.missing).length;
    const absent = g.nodes.length - notes;
    foot.textContent =
      `${notes} note${notes === 1 ? '' : 's'}` +
      (absent ? `, ${absent} missing (diamonds)` : '') +
      `, ${g.edges.length} link${g.edges.length === 1 ? '' : 's'}. ` +
      `Double-click a note, or select it and press Enter, to open it. ${layoutNote}`;
  }

  function ensureView(): GraphView {
    if (view) return view;
    const t = theme();
    view = mountGraph(surface, data, {
      background: t.background,
      foreground: t.foreground,
      onActivate: activate,
      onDragStart: (n, p) => { autoFit = false; layout?.pin(n.id, p.x, p.y); },
      onDrag: (n, p) => { layout?.pin(n.id, p.x, p.y); },
      onDragEnd: (n) => { layout?.unpin(n.id); },
    });
    // Once the reader pans or zooms, the view stops re-fitting itself.
    for (const type of ['pointerdown', 'wheel'] as const) surface.addEventListener(type, () => { autoFit = false; }, { passive: true });
    return view;
  }

  function renderList(graph: NoteGraph): void {
    list.replaceChildren(
      ...graph.nodes.map((n) => {
        const b = el('button', '', n.missing ? `${n.label} (missing)` : n.label);
        b.type = 'button';
        b.disabled = n.missing;
        b.addEventListener('click', () => activate({ id: n.id, label: n.label }));
        return b;
      }),
    );
    listSummary.textContent = `Notes in this graph (${graph.nodes.length})`;
  }

  function show(payload: Extract<GraphPayload, { type: 'graph' }>): void {
    const recentred = current?.graph.centre !== payload.graph.centre || current?.title !== payload.title;
    current = payload;
    const g = payload.graph;
    data = toData(g);
    title.textContent = payload.title;

    depth.replaceChildren();
    for (let d = payload.limits.depth.min; d <= payload.limits.depth.max; d++) {
      const option = el('option', '', String(d));
      option.value = String(d);
      option.selected = d === g.depth;
      depth.append(option);
    }
    notice.hidden = !g.truncated;
    noticeText.textContent = `Showing ${g.nodes.length} notes. ${g.hidden} more within ${g.depth} link${g.depth === 1 ? '' : 's'} are hidden.`;
    more.disabled = g.maxNodes >= payload.limits.maxNodes;

    empty.hidden = true;
    surface.hidden = false;
    listBox.hidden = false;
    const v = ensureView();
    v.setOptions({
      ariaLabel:
        `Links of ${payload.title}: ${g.nodes.length} notes. Drag a note to move it, drag the background to pan, scroll to zoom. ` +
        'Arrow keys select notes; Enter opens the selected note.',
    });
    // Renderer first, then the layout, with the same node order.
    v.setGraph(data, { preserveViewport: !recentred, preservePositions: true });
    v.setSelection(g.centre);
    if (recentred) autoFit = true;
    layout?.setGraph(data);
    renderList(g);
    describe();
  }

  function showEmpty(message: string): void {
    current = null;
    title.textContent = 'Note Graph';
    notice.hidden = true;
    surface.hidden = true;
    listBox.hidden = true;
    empty.hidden = false;
    empty.textContent = message;
    foot.textContent = '';
  }

  // ── Controls ───────────────────────────────────────────────────────────
  fit.addEventListener('click', () => view?.fit());
  depth.addEventListener('change', () => {
    if (current) vscode.postMessage({ type: 'bounds', depth: Number(depth.value), maxNodes: current.graph.maxNodes });
  });
  more.addEventListener('click', () => {
    if (!current) return;
    const maxNodes = Math.min(current.limits.maxNodes, current.graph.maxNodes * 2);
    vscode.postMessage({ type: 'bounds', depth: current.graph.depth, maxNodes });
  });
  const firstMatch = () => {
    const query = search.value.trim().toLocaleLowerCase();
    return query ? data.nodes.find((n) => n.label.toLocaleLowerCase().includes(query)) : undefined;
  };
  search.addEventListener('input', () => {
    const hit = firstMatch();
    if (hit) view?.setSelection(hit.id);
    if (search.value.trim()) foot.textContent = hit ? `Selected "${hit.label}". Press Enter to open it.` : 'No note in this graph matches.';
    else describe();
  });
  search.addEventListener('keydown', (e) => {
    const hit = e.key === 'Enter' ? firstMatch() : undefined;
    if (hit) activate(hit);
  });

  // A colour theme change restyles the graph without moving anything.
  new MutationObserver(() => {
    if (!view || !current) return;
    const t = theme();
    data = toData(current.graph);
    view.setOptions({ background: t.background, foreground: t.foreground });
    view.setGraph(data, { preserveViewport: true, preservePositions: true });
    view.setSelection(current.graph.centre);
  }).observe(document.body, { attributes: true, attributeFilter: ['class'] });

  window.addEventListener('message', (event: MessageEvent<GraphPayload>) => {
    const payload = event.data;
    // A payload older than the one on screen lost a race in the extension.
    if (!payload || (current && payload.generation < current.generation)) return;
    if (payload.type === 'graph') show(payload);
    else if (payload.type === 'empty') showEmpty(payload.message);
  });

  // ── Layout engine ──────────────────────────────────────────────────────
  // Compiled asynchronously from bytes in this bundle: no fetch, no worker.
  // If it cannot start, the graph still draws, on the renderer's seed positions.
  const unavailable = (error: unknown) => {
    layout?.destroy();
    layout = null;
    layoutNote = 'The layout engine is unavailable, so notes are not arranged.';
    console.warn('Vellum graph layout unavailable:', error);
    describe();
  };
  init({ module_or_path: wasmBytes })
    .then(() => {
      layout = createLayout(vowlEngine(vowl), {
        onPositions: (xy) => {
          view?.setPositions(xy);
          if (autoFit) view?.fit();
        },
        onSettled: () => {
          autoFit = false;
          layoutNote = '';
          describe();
        },
        onError: unavailable,
      });
      layoutNote = 'Arranging…';
      if (current) layout.setGraph(data);
    })
    .catch(unavailable);

  window.addEventListener('unload', () => {
    layout?.destroy();
    view?.destroy();
  });
  vscode.postMessage({ type: 'ready' });
})();
