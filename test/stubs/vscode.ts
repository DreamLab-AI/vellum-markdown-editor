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
