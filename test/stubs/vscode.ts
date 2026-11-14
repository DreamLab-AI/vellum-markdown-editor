// A minimal in-memory stand-in for the parts of the VS Code API the link
// index uses, so it can be exercised under `node --test`.
export class Uri {
  constructor(public readonly path: string) {}
  static parse(s: string): Uri { return new Uri(s.replace(/^file:\/\//, '')); }
  static file(p: string): Uri { return new Uri(p); }
  static joinPath(base: Uri, ...parts: string[]): Uri { return new Uri([base.path, ...parts].join('/').replace(/\/+/g, '/')); }
  toString(): string { return `file://${this.path}`; }
}
export class Range { constructor(public l1: number, public c1: number, public l2: number, public c2: number) {} }
export class WorkspaceEdit {
  edits: Array<{ uri: Uri; range: Range; text: string }> = [];
  replace(uri: Uri, range: Range, text: string) { this.edits.push({ uri, range, text }); }
}
export class EventEmitter<T> {
  private ls: Array<(e: T) => void> = [];
  event = (l: (e: T) => void) => { this.ls.push(l); return { dispose() {} }; };
  fire(e: T) { this.ls.forEach((l) => l(e)); }
  dispose() {}
}
export const files = new Map<string, string>();
const ROOT = new Uri('/ws');
const noop = () => ({ dispose() {} });
export const workspace = {
  textDocuments: [] as unknown[],
  getWorkspaceFolder: (u: Uri) => (u.path.startsWith('/ws/') ? { uri: ROOT } : undefined),
  asRelativePath: (u: Uri) => u.path.replace(/^\/ws\//, ''),
  findFiles: async () => [...files.keys()].filter((p) => /\.(md|markdown)$/.test(p)).map((p) => new Uri(p)),
  fs: { readFile: async (u: Uri) => { const t = files.get(u.path); if (t === undefined) throw new Error('ENOENT'); return new TextEncoder().encode(t); } },
  createFileSystemWatcher: () => ({ onDidCreate: noop, onDidChange: noop, onDidDelete: noop, dispose() {} }),
  onDidChangeTextDocument: noop,
  onDidChangeWorkspaceFolders: noop,
};

export class TreeItem { constructor(public label: unknown, public collapsibleState?: number) {} }
export const TreeItemCollapsibleState = { None: 0, Collapsed: 1, Expanded: 2 } as const;
export const ThemeIcon = { File: 'file' } as const;

// ── What the graph panel needs: tabs, a webview panel, commands, settings ──
export class TabInputText { constructor(public readonly uri: Uri) {} }
export class TabInputCustom { constructor(public readonly uri: Uri, public readonly viewType = 'markdownLive.editor') {} }
export const ViewColumn = { One: 1, Two: 2, Beside: -2 } as const;
/** Test controls: the tab in focus, what the panel posted, what it executed. */
export const stage = {
  input: undefined as unknown,
  column: 1,
  tabsChanged: new EventEmitter<void>(),
  posted: [] as any[],
  executed: [] as any[][],
  settings: {} as Record<string, unknown>,
  panels: [] as any[],
  reset() {
    this.input = undefined; this.column = 1; this.posted = []; this.executed = []; this.settings = {};
    for (const p of [...this.panels]) p.dispose();
  },
};
export const window = {
  tabGroups: {
    get activeTabGroup() { return { activeTab: stage.input ? { input: stage.input } : undefined, viewColumn: stage.column }; },
    onDidChangeTabs: stage.tabsChanged.event,
    onDidChangeTabGroups: noop,
  },
  createWebviewPanel: (viewType: string, title: string, show: unknown, options: unknown) => {
    const received = new EventEmitter<unknown>();
    const closed = new EventEmitter<void>();
    const viewState = new EventEmitter<void>();
    const panel = {
      viewType, title, show, options, revealed: 0, disposed: false, visible: true,
      onDidChangeViewState: viewState.event,
      /** Hide or show the panel as VS Code would when its tab is covered or uncovered. */
      setVisible(visible: boolean) { panel.visible = visible; viewState.fire(); },
      webview: {
        html: '',
        cspSource: 'vscode-webview://test',
        asWebviewUri: (u: Uri) => new Uri(`/webview${u.path}`),
        postMessage: async (m: unknown) => { stage.posted.push(m); return true; },
        onDidReceiveMessage: received.event,
      },
      onDidDispose: closed.event,
      reveal() { panel.revealed++; },
      dispose() { if (panel.disposed) return; panel.disposed = true; stage.panels.splice(stage.panels.indexOf(panel), 1); closed.fire(); },
      /** Deliver a message as the webview would. */
      receive: (m: unknown) => received.fire(m),
    };
    stage.panels.push(panel);
    return panel;
  },
};
export const commands = {
  executeCommand: async (...args: any[]) => { stage.executed.push(args); },
};
(workspace as any).getConfiguration = () => ({ get: (key: string) => stage.settings[key] });
