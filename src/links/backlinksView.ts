// The Backlinks panel: for the note in focus, every note that links to it
// (with the line it does so on) and every plain-text mention of its name.
// A native tree view, so no webview and nothing to sanitise.
import * as vscode from 'vscode';
import { Backlink, LinkIndex, UnlinkedMention } from './linkIndex';
import { baseName } from './resolver';

type Node =
  | { kind: 'group'; id: 'linked' | 'unlinked'; label: string; files: FileNode[] }
  | FileNode
  | MentionNode;

interface FileNode {
  kind: 'file';
  group: 'linked' | 'unlinked';
  uri: vscode.Uri;
  path: string;
  mentions: MentionNode[];
}

interface MentionNode {
  kind: 'mention';
  group: 'linked' | 'unlinked';
  uri: vscode.Uri;
  line: number;
  start: number;
  end: number;
  text: string;
}

function activeNote(): vscode.Uri | undefined {
  const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
  const uri =
    input instanceof vscode.TabInputCustom || input instanceof vscode.TabInputText ? input.uri : undefined;
  return uri && /\.(md|markdown)$/i.test(uri.path) ? uri : undefined;
}

function group(items: Array<(Backlink | UnlinkedMention) & { line: number; start: number; end: number }>, kind: 'linked' | 'unlinked'): FileNode[] {
  const files = new Map<string, FileNode>();
  for (const it of items) {
    const key = it.source.toString();
    let file = files.get(key);
    if (!file) {
      file = { kind: 'file', group: kind, uri: it.source, path: it.sourcePath, mentions: [] };
      files.set(key, file);
    }
    file.mentions.push({ kind: 'mention', group: kind, uri: it.source, line: it.line, start: it.start, end: it.end, text: it.text });
  }
  return [...files.values()];
}

export class BacklinksProvider implements vscode.TreeDataProvider<Node>, vscode.Disposable {
  public static readonly viewId = 'markdownLive.backlinks';

  private readonly changed = new vscode.EventEmitter<void>();
  public readonly onDidChangeTreeData = this.changed.event;
  private readonly disposables: vscode.Disposable[] = [];
  private current: vscode.Uri | undefined;
  private view: vscode.TreeView<Node> | undefined;

  constructor(private readonly index: LinkIndex) {
    this.current = activeNote();
    this.disposables.push(
      this.changed,
      index.onDidChange(() => this.refresh()),
      vscode.window.tabGroups.onDidChangeTabs(() => this.follow()),
      vscode.window.tabGroups.onDidChangeTabGroups(() => this.follow()),
    );
  }

  public attach(view: vscode.TreeView<Node>): void {
    this.view = view;
    this.describe();
  }

  dispose(): void {
    this.disposables.forEach((d) => d.dispose());
  }

  private follow(): void {
    const next = activeNote();
    // Focus moving to a panel or a non-note tab keeps the last note on show.
    if (!next || next.toString() === this.current?.toString()) return;
    this.current = next;
    this.refresh();
  }

  public refresh(): void {
    this.describe();
    this.changed.fire();
  }

  private describe(): void {
    if (this.view) this.view.description = this.current ? baseName(this.current.path) : undefined;
  }

  getTreeItem(node: Node): vscode.TreeItem {
    if (node.kind === 'group') {
      const item = new vscode.TreeItem(node.label, vscode.TreeItemCollapsibleState.Expanded);
      const count = node.files.reduce((n, f) => n + f.mentions.length, 0);
      item.description = String(count);
      item.contextValue = `group-${node.id}`;
      return item;
    }
    if (node.kind === 'file') {
      const item = new vscode.TreeItem(baseName(node.path), vscode.TreeItemCollapsibleState.Expanded);
      item.resourceUri = node.uri;
      item.iconPath = vscode.ThemeIcon.File;
      const dir = node.path.includes('/') ? node.path.slice(0, node.path.lastIndexOf('/')) : '';
      item.description = `${dir}${dir ? ' · ' : ''}${node.mentions.length}`;
      item.command = { command: 'markdown-live.openNote', title: 'Open note', arguments: [node.uri] };
      item.contextValue = 'backlink-file';
      return item;
    }
    const text = node.text.trim();
    const lead = node.text.length - node.text.trimStart().length;
    const item = new vscode.TreeItem({
      label: text,
      highlights: [[Math.max(0, node.start - lead), Math.max(0, node.end - lead)]],
    });
    item.tooltip = `Line ${node.line + 1}`;
    item.command = { command: 'markdown-live.openNote', title: 'Open note', arguments: [node.uri] };
    item.contextValue = node.group === 'unlinked' ? 'unlinked-mention' : 'linked-mention';
    return item;
  }

  async getChildren(node?: Node): Promise<Node[]> {
    if (node?.kind === 'group') return node.files;
    if (node?.kind === 'file') return node.mentions;
    if (node) return [];
    if (!this.current) return [];
    await this.index.whenReady();
    const linked = group(
      this.index.backlinks(this.current).map((b) => ({ ...b, line: b.link.line, start: b.link.start, end: b.link.end })),
      'linked',
    );
    const unlinked = group(this.index.unlinkedMentions(this.current), 'unlinked');
    return [
      { kind: 'group', id: 'linked', label: 'Linked mentions', files: linked },
      { kind: 'group', id: 'unlinked', label: 'Unlinked mentions', files: unlinked },
    ];
  }
}

/** Turn a plain-text mention into a wikilink to `target`. */
export async function linkMention(index: LinkIndex, node: unknown, target: vscode.Uri | undefined): Promise<void> {
  const m = node as MentionNode | undefined;
  if (!m || m.kind !== 'mention' || m.group !== 'unlinked' || !target) return;
  const doc = await vscode.workspace.openTextDocument(m.uri);
  const range = new vscode.Range(m.line, m.start, m.line, m.end);
  const shown = doc.getText(range);
  // The text may have moved since the index was read.
  if (shown.toLowerCase() !== baseName(target.path).toLowerCase()) {
    void vscode.window.showWarningMessage('That mention has changed; refresh and try again.');
    return;
  }
  const name = index.linkTextFor(target, m.uri);
  const edit = new vscode.WorkspaceEdit();
  edit.replace(m.uri, range, name === shown ? `[[${name}]]` : `[[${name}|${shown}]]`);
  await vscode.workspace.applyEdit(edit);
  await doc.save();
}

export function currentBacklinkTarget(): vscode.Uri | undefined {
  return activeNote();
}
