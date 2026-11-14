// The note graph: the note in focus and the notes linked to it, drawn in a
// webview beside the editor. Opened by a command; nothing here runs until then.
// The graph comes from the link index, so it is never crawled or parsed again.
import * as vscode from 'vscode';
import { LinkIndex } from '../links/linkIndex';
import { activeNote } from '../links/backlinksView';
import { GRAPH_DEPTH, GRAPH_NODES, graphBounds } from '../links/graph';
import { baseName } from '../links/resolver';
import { escapeHtml, newNonce } from '../security';
import { GraphPayload, parseGraphRequest } from './messages';

export class GraphPanel implements vscode.Disposable {
  public static readonly viewType = 'markdownLive.graph';
  private static current: GraphPanel | undefined;

  /** Open the graph beside the editor, or bring the open one forward. Focus stays in the editor. */
  public static show(extensionUri: vscode.Uri, index: LinkIndex): void {
    if (GraphPanel.current) {
      GraphPanel.current.panel.reveal(undefined, true);
      GraphPanel.current.follow();
      return;
    }
    GraphPanel.current = new GraphPanel(extensionUri, index);
  }

  private readonly panel: vscode.WebviewPanel;
  private readonly disposables: vscode.Disposable[] = [];
  private note: vscode.Uri | undefined;
  /** Where the followed note is shown, so a note opened from the graph lands there. */
  private noteColumn: vscode.ViewColumn | undefined;
  private bounds: { depth: number; maxNodes: number };
  private generation = 0;
  /** IDs of the graph last sent, with the note each one opens. */
  private uris = new Map<string, vscode.Uri>();
  private last: GraphPayload | undefined;
  private disposed = false;
  /** The index or the note changed while the panel was hidden. */
  private stale = false;

  private constructor(extensionUri: vscode.Uri, private readonly index: LinkIndex) {
    const dist = vscode.Uri.joinPath(extensionUri, 'dist');
    this.bounds = graphBounds({
      depth: vscode.workspace.getConfiguration('markdownLive').get<number>('graph.depth'),
    });
    this.capture();
    this.panel = vscode.window.createWebviewPanel(
      GraphPanel.viewType,
      'Note Graph',
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
      { enableScripts: true, localResourceRoots: [dist] },
    );
    this.panel.webview.html = this.html(vscode.Uri.joinPath(dist, 'graph.js'));
    this.disposables.push(
      this.panel.onDidDispose(() => this.dispose()),
      this.panel.webview.onDidReceiveMessage((raw) => this.receive(raw)),
      vscode.window.tabGroups.onDidChangeTabs(() => this.follow()),
      vscode.window.tabGroups.onDidChangeTabGroups(() => this.follow()),
      this.index.onDidChange(() => void this.refresh()),
      // A hidden panel does no work; it catches up when it is shown again.
      this.panel.onDidChangeViewState(() => { if (this.panel.visible && this.stale) void this.refresh(); }),
    );
    void this.refresh();
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (GraphPanel.current === this) GraphPanel.current = undefined;
    this.disposables.forEach((d) => d.dispose());
    this.uris.clear();
    this.panel.dispose();
  }

  /** Take the note in focus, if there is one. The graph's own tab is not a note, so it changes nothing. */
  private capture(): boolean {
    const uri = activeNote();
    if (!uri) return false;
    this.noteColumn = vscode.window.tabGroups.activeTabGroup.viewColumn;
    if (uri.toString() === this.note?.toString()) return false;
    this.note = uri;
    return true;
  }

  private follow(): void {
    if (this.capture()) void this.refresh();
  }

  private async refresh(): Promise<void> {
    if (!this.panel.visible) {
      this.stale = true;
      return;
    }
    this.stale = false;
    const generation = ++this.generation;
    await this.index.whenReady();
    // A newer refresh started, or the panel closed, while the index was loading.
    if (this.disposed || generation !== this.generation) return;
    this.send(this.payload(generation));
  }

  private payload(generation: number): GraphPayload {
    this.uris = new Map();
    if (!this.note) return { type: 'empty', generation, message: 'Open a Markdown note to see the notes it links to.' };
    const name = baseName(this.note.path);
    if (!vscode.workspace.getWorkspaceFolder(this.note)) {
      return { type: 'empty', generation, message: `"${name}" is outside the workspace folders, so its links are not indexed.` };
    }
    const found = this.index.neighbourhood(this.note, this.bounds);
    if (!found) return { type: 'empty', generation, message: `"${name}" is not in the link index. It may have been deleted, excluded or be too large.` };
    this.uris = found.uris;
    return {
      type: 'graph',
      generation,
      title: name,
      graph: found.graph,
      limits: { depth: { min: GRAPH_DEPTH.min, max: GRAPH_DEPTH.max }, maxNodes: GRAPH_NODES.max },
    };
  }

  private send(payload: GraphPayload): void {
    this.last = payload;
    void this.panel.webview.postMessage(payload);
  }

  private receive(raw: unknown): void {
    const request = parseGraphRequest(raw);
    if (!request) return;
    switch (request.type) {
      case 'ready':
        // The webview (re)loaded: it has nothing, so give it the current graph again.
        if (this.last) void this.panel.webview.postMessage(this.last);
        return;
      case 'bounds':
        this.bounds = graphBounds(request);
        void this.refresh();
        return;
      case 'open': {
        // Only a note in the graph now on screen can be opened; a missing note has no URI.
        if (request.generation !== this.generation) return;
        const uri = this.uris.get(request.id);
        if (!uri) return;
        void vscode.commands.executeCommand('vscode.openWith', uri, 'markdownLive.editor', {
          viewColumn: this.noteColumn ?? vscode.ViewColumn.One,
          preserveFocus: false,
        });
        return;
      }
    }
  }

  private html(script: vscode.Uri): string {
    // One nonce'd script and one nonce'd style sheet. 'wasm-unsafe-eval' lets the
    // bundled layout module compile; it does not allow eval() or new Function().
    // No img-src, connect-src, font-src or worker-src: the view loads nothing else.
    const nonce = newNonce();
    const src = escapeHtml(this.panel.webview.asWebviewUri(script).toString());
    const csp = `default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}' 'wasm-unsafe-eval';`;
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Note Graph</title>
<style nonce="${nonce}">
  html, body { height: 100%; margin: 0; padding: 0; }
  #graph-root { display: flex; flex-direction: column; height: 100%; }
  body { color: var(--vscode-foreground); background: var(--vscode-editor-background); font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); }
  .bar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 6px 10px; border-bottom: 1px solid var(--vscode-panel-border, transparent); }
  .bar .title { font-weight: 600; margin-right: auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  input, select, button { font: inherit; color: var(--vscode-input-foreground); background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border, transparent); border-radius: 2px; padding: 2px 6px; }
  button { color: var(--vscode-button-secondaryForeground); background: var(--vscode-button-secondaryBackground); cursor: pointer; }
  button:hover:not(:disabled) { background: var(--vscode-button-secondaryHoverBackground); }
  button:disabled { opacity: 0.6; cursor: default; }
  :focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: 1px; }
  .notice { padding: 4px 10px; display: flex; align-items: center; gap: 8px; background: var(--vscode-inputValidation-infoBackground, transparent); border-bottom: 1px solid var(--vscode-inputValidation-infoBorder, transparent); }
  .notice[hidden], .empty[hidden], .surface[hidden] { display: none; }
  .surface { flex: 1 1 auto; min-height: 260px; }
  .empty { flex: 1 1 auto; display: flex; align-items: center; justify-content: center; padding: 24px; text-align: center; color: var(--vscode-descriptionForeground); }
  .foot { padding: 4px 10px; color: var(--vscode-descriptionForeground); border-top: 1px solid var(--vscode-panel-border, transparent); }
  details { padding: 4px 10px; border-top: 1px solid var(--vscode-panel-border, transparent); }
  .list { display: flex; flex-wrap: wrap; gap: 4px; padding: 6px 0; max-height: 9em; overflow: auto; }
</style>
</head>
<body>
<div id="graph-root"></div>
<script nonce="${nonce}" src="${src}"></script>
</body>
</html>`;
  }
}
