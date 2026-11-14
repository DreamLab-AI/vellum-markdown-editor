// The workspace link index: every Markdown note, its links, and who links to
// whom. Built once, then kept current from file events and open documents.
import * as vscode from 'vscode';
import { findUnlinkedMentions, Mention, NoteLink, parseNote, ParsedNote } from './parser';
import { baseName, linkTextFor, planRenameEdits, resolveLink } from './resolver';

const NOTE_GLOB = '**/*.{md,markdown}';
const EXCLUDE = '**/{node_modules,.git,.obsidian,.trash}/**';
const MAX_NOTE_BYTES = 2_000_000;

interface Entry extends ParsedNote {
  uri: vscode.Uri;
  /** Workspace folder the note belongs to; links resolve inside it. */
  root: string;
  /** Path relative to that folder, with `/`. */
  path: string;
}

export interface Backlink {
  source: vscode.Uri;
  sourcePath: string;
  link: NoteLink;
  text: string;
}

export interface UnlinkedMention extends Mention {
  source: vscode.Uri;
  sourcePath: string;
  text: string;
}

export class LinkIndex implements vscode.Disposable {
  private readonly entries = new Map<string, Entry>();
  private readonly disposables: vscode.Disposable[] = [];
  private readonly changed = new vscode.EventEmitter<void>();
  private fireTimer: ReturnType<typeof setTimeout> | undefined;
  private ready: Promise<void> | undefined;

  /** Fires (debounced) whenever the index content changes. */
  public readonly onDidChange = this.changed.event;

  constructor() {
    const watcher = vscode.workspace.createFileSystemWatcher(NOTE_GLOB);
    this.disposables.push(
      watcher,
      this.changed,
      watcher.onDidCreate((uri) => this.loadFromDisk(uri)),
      watcher.onDidChange((uri) => {
        // An open document is the truth for its file; ignore the disk echo.
        if (!vscode.workspace.textDocuments.some((d) => d.uri.toString() === uri.toString())) this.loadFromDisk(uri);
      }),
      watcher.onDidDelete((uri) => this.remove(uri)),
      vscode.workspace.onDidChangeTextDocument((e) => {
        if (this.isNote(e.document.uri)) this.set(e.document.uri, e.document.getText());
      }),
      vscode.workspace.onDidChangeWorkspaceFolders(() => {
        this.ready = undefined;
        void this.whenReady();
      }),
    );
  }

  dispose(): void {
    if (this.fireTimer) clearTimeout(this.fireTimer);
    this.disposables.forEach((d) => d.dispose());
  }

  /** Resolves once every note in the workspace has been read. */
  public whenReady(): Promise<void> {
    this.ready ??= this.build();
    return this.ready;
  }

  private async build(): Promise<void> {
    this.entries.clear();
    const files = await vscode.workspace.findFiles(NOTE_GLOB, EXCLUDE);
    // Read in small batches: a web extension host has one thread and a vault can be large.
    for (let i = 0; i < files.length; i += 32) {
      await Promise.all(files.slice(i, i + 32).map((uri) => this.loadFromDisk(uri, true)));
    }
    this.fire();
  }

  private isNote(uri: vscode.Uri): boolean {
    return /\.(md|markdown)$/i.test(uri.path) && !!vscode.workspace.getWorkspaceFolder(uri);
  }

  private async loadFromDisk(uri: vscode.Uri, quiet = false): Promise<void> {
    if (!this.isNote(uri)) return;
    try {
      const bytes = await vscode.workspace.fs.readFile(uri);
      if (bytes.byteLength > MAX_NOTE_BYTES) return;
      this.set(uri, new TextDecoder().decode(bytes), quiet);
    } catch {
      this.remove(uri);
    }
  }

  private set(uri: vscode.Uri, text: string, quiet = false): void {
    const folder = vscode.workspace.getWorkspaceFolder(uri);
    if (!folder) return;
    this.entries.set(uri.toString(), {
      uri,
      root: folder.uri.toString(),
      path: vscode.workspace.asRelativePath(uri, false).replace(/\\/g, '/'),
      ...parseNote(text),
    });
    if (!quiet) this.fire();
  }

  private remove(uri: vscode.Uri): void {
    if (this.entries.delete(uri.toString())) this.fire();
  }

  private fire(): void {
    if (this.fireTimer) clearTimeout(this.fireTimer);
    this.fireTimer = setTimeout(() => this.changed.fire(), 150);
  }

  private inRoot(root: string): Entry[] {
    return [...this.entries.values()].filter((e) => e.root === root);
  }

  private entryFor(uri: vscode.Uri): Entry | undefined {
    return this.entries.get(uri.toString());
  }

  /** Paths of every note in the same workspace folder as `uri`. */
  public notePaths(uri: vscode.Uri): string[] {
    const root = vscode.workspace.getWorkspaceFolder(uri)?.uri.toString();
    return root ? this.inRoot(root).map((e) => e.path) : [];
  }

  /** Every note in the same workspace folder as `uri`. */
  public notes(uri: vscode.Uri): Array<{ uri: vscode.Uri; path: string }> {
    const root = vscode.workspace.getWorkspaceFolder(uri)?.uri.toString();
    return root ? this.inRoot(root).map(({ uri: u, path }) => ({ uri: u, path })) : [];
  }

  private uriOf(root: string, path: string): vscode.Uri | undefined {
    return this.inRoot(root).find((e) => e.path === path)?.uri;
  }

  /** The note a wikilink written in `source` points at, if it exists. */
  public resolveTarget(source: vscode.Uri, target: string): vscode.Uri | undefined {
    const root = vscode.workspace.getWorkspaceFolder(source)?.uri.toString();
    if (!root) return undefined;
    const sourcePath = vscode.workspace.asRelativePath(source, false).replace(/\\/g, '/');
    const link = { kind: 'wiki', target } as NoteLink;
    const path = resolveLink(link, sourcePath, this.inRoot(root).map((e) => e.path));
    return path ? this.uriOf(root, path) : undefined;
  }

  /** The shortest unambiguous wikilink text for `note`, written from `source`. */
  public linkTextFor(note: vscode.Uri, source: vscode.Uri): string {
    const entry = this.entryFor(note);
    const path = entry?.path ?? vscode.workspace.asRelativePath(note, false).replace(/\\/g, '/');
    const sourcePath = vscode.workspace.asRelativePath(source, false).replace(/\\/g, '/');
    return linkTextFor(path, sourcePath, this.notePaths(note));
  }

  /** Wikilink targets in `uri` that point at no existing note. */
  public unresolvedTargets(uri: vscode.Uri): string[] {
    const entry = this.entryFor(uri);
    if (!entry) return [];
    const paths = this.inRoot(entry.root).map((e) => e.path);
    const out = new Set<string>();
    for (const link of entry.links) {
      if (link.kind === 'wiki' && link.target && !resolveLink(link, entry.path, paths)) out.add(link.target);
    }
    return [...out];
  }

  /** Links in `uri`, each with the note it resolves to (if any). */
  public outgoing(uri: vscode.Uri): Array<{ link: NoteLink; target?: vscode.Uri }> {
    const entry = this.entryFor(uri);
    if (!entry) return [];
    const paths = this.inRoot(entry.root).map((e) => e.path);
    return entry.links.map((link) => {
      const path = resolveLink(link, entry.path, paths);
      return { link, target: path ? this.uriOf(entry.root, path) : undefined };
    });
  }

  /** Every link in another note that resolves to `uri`. */
  public backlinks(uri: vscode.Uri): Backlink[] {
    const target = this.entryFor(uri);
    if (!target) return [];
    const all = this.inRoot(target.root);
    const paths = all.map((e) => e.path);
    const out: Backlink[] = [];
    for (const e of all) {
      if (e.path === target.path) continue;
      for (const link of e.links) {
        if (resolveLink(link, e.path, paths) === target.path) {
          out.push({ source: e.uri, sourcePath: e.path, link, text: e.lines[link.line] ?? '' });
        }
      }
    }
    return out.sort((a, b) => a.sourcePath.localeCompare(b.sourcePath) || a.link.line - b.link.line);
  }

  /** Plain-text mentions of the note's name in other notes. */
  public unlinkedMentions(uri: vscode.Uri): UnlinkedMention[] {
    const target = this.entryFor(uri);
    if (!target) return [];
    const name = baseName(target.path);
    const out: UnlinkedMention[] = [];
    for (const e of this.inRoot(target.root)) {
      if (e.path === target.path) continue;
      for (const m of findUnlinkedMentions(e, name)) {
        out.push({ ...m, source: e.uri, sourcePath: e.path, text: e.lines[m.line] ?? '' });
      }
    }
    return out.sort((a, b) => a.sourcePath.localeCompare(b.sourcePath) || a.line - b.line);
  }

  /**
   * The edit that keeps links working when files or folders are renamed.
   * Returns undefined when nothing needs to change.
   */
  public renameEdit(files: ReadonlyArray<{ oldUri: vscode.Uri; newUri: vscode.Uri }>): vscode.WorkspaceEdit | undefined {
    const edit = new vscode.WorkspaceEdit();
    let count = 0;
    const roots = new Set([...this.entries.values()].map((e) => e.root));
    for (const root of roots) {
      const all = this.inRoot(root);
      const renames = new Map<string, string>();
      for (const { oldUri, newUri } of files) {
        const newFolder = vscode.workspace.getWorkspaceFolder(newUri);
        if (newFolder?.uri.toString() !== root) continue;
        const oldStr = oldUri.toString();
        for (const e of all) {
          const s = e.uri.toString();
          // A note itself, or any note under a renamed folder.
          if (s !== oldStr && !s.startsWith(`${oldStr}/`)) continue;
          const moved = vscode.Uri.parse(newUri.toString() + s.slice(oldStr.length));
          if (!/\.(md|markdown)$/i.test(moved.path)) continue;
          renames.set(e.path, vscode.workspace.asRelativePath(moved, false).replace(/\\/g, '/'));
        }
      }
      if (!renames.size) continue;
      for (const e of planRenameEdits(all, renames)) {
        const uri = this.uriOf(root, e.path);
        if (!uri) continue;
        edit.replace(uri, new vscode.Range(e.line, e.start, e.line, e.end), e.newText);
        count++;
      }
    }
    return count ? edit : undefined;
  }
}
