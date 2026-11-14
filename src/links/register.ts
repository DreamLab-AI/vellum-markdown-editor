// Wires the link index into VS Code: the Backlinks panel, link maintenance on
// rename, and wikilink support in the plain text editor.
import * as vscode from 'vscode';
import { BacklinksProvider, linkMention } from './backlinksView';
import { LinkIndex } from './linkIndex';
import { baseName, dirName, safeNoteName } from './resolver';
import { WIKILINK_SOURCE, parseWikilinkInner } from './wikilink';
import { maskLines } from './parser';

const MARKDOWN: vscode.DocumentSelector = [{ language: 'markdown' }];

/** Open a note in the live editor. */
export async function openNote(uri: vscode.Uri): Promise<void> {
  await vscode.commands.executeCommand('vscode.openWith', uri, 'markdownLive.editor');
}

/**
 * Follow a wikilink written in `source`. An existing note opens; a missing one
 * is created first, as in Obsidian: in `defaultNoteDirectory` when set,
 * otherwise beside the note that links to it.
 */
export async function followWikilink(index: LinkIndex, source: vscode.Uri, target: string): Promise<void> {
  await index.whenReady();
  if (!target.trim()) return;
  const existing = index.resolveTarget(source, target);
  if (existing) return openNote(existing);

  const folder = vscode.workspace.getWorkspaceFolder(source);
  const name = safeNoteName(target);
  if (!folder || !name) {
    void vscode.window.showWarningMessage(`"${target}" cannot be used as a note name.`);
    return;
  }
  const configured = vscode.workspace
    .getConfiguration('markdownLive')
    .get<string>('defaultNoteDirectory', '')
    .split(/[\\/]/)
    .filter((s) => s && s !== '.' && s !== '..');
  const sourceDir = dirName(vscode.workspace.asRelativePath(source, false).replace(/\\/g, '/')).split('/').filter(Boolean);
  // A target with folders in it is taken from the workspace root.
  const base = name.includes('/') ? [] : configured.length ? configured : sourceDir;
  const uri = vscode.Uri.joinPath(folder.uri, ...base, ...name.split('/'));
  if (vscode.workspace.getWorkspaceFolder(uri)?.uri.toString() !== folder.uri.toString()) return;
  try {
    await vscode.workspace.fs.stat(uri);
  } catch (err) {
    // Only a file that is known to be missing is created; any other failure
    // (permissions, a provider error) must not lead to an overwrite.
    if (!(err instanceof vscode.FileSystemError) || err.code !== 'FileNotFound') {
      void vscode.window.showWarningMessage(`Could not check whether "${name}" exists.`);
      return;
    }
    await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(uri, '..'));
    await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(`# ${baseName(name)}\n\n`));
  }
  await openNote(uri);
}

export function registerLinks(context: vscode.ExtensionContext): LinkIndex {
  const index = new LinkIndex();
  const backlinks = new BacklinksProvider(index);
  const view = vscode.window.createTreeView(BacklinksProvider.viewId, { treeDataProvider: backlinks, showCollapseAll: true });
  backlinks.attach(view);
  void index.whenReady();

  let target: vscode.Uri | undefined;
  const track = () => {
    const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
    const uri = input instanceof vscode.TabInputCustom || input instanceof vscode.TabInputText ? input.uri : undefined;
    if (uri && /\.(md|markdown)$/i.test(uri.path)) target = uri;
  };
  track();

  context.subscriptions.push(
    index,
    backlinks,
    view,
    vscode.window.tabGroups.onDidChangeTabs(track),
    vscode.commands.registerCommand('markdown-live.openNote', (uri?: vscode.Uri) => uri && openNote(uri)),
    vscode.commands.registerCommand('markdown-live.refreshBacklinks', () => backlinks.refresh()),
    vscode.commands.registerCommand('markdown-live.linkMention', (node: unknown) => linkMention(index, node, target)),
    vscode.commands.registerCommand('markdown-live.openMentionInText', async (node: { uri?: vscode.Uri; line?: number; start?: number; end?: number }) => {
      if (!node?.uri || typeof node.line !== 'number') return;
      const range = new vscode.Range(node.line, node.start ?? 0, node.line, node.end ?? 0);
      await vscode.window.showTextDocument(node.uri, { selection: range });
    }),

    // Keep links working when a note or folder is renamed or moved. The edit
    // is handed to VS Code to apply with the rename, so one undo reverts both.
    vscode.workspace.onWillRenameFiles((e) => {
      if (!vscode.workspace.getConfiguration('markdownLive').get<boolean>('updateLinksOnRename', true)) return;
      e.waitUntil(index.whenReady().then(() => index.renameEdit(e.files) ?? new vscode.WorkspaceEdit()));
    }),
    vscode.workspace.onDidRenameFiles(() => void index.whenReady().then(() => backlinks.refresh())),

    // Plain text editor: wikilinks are clickable…
    vscode.languages.registerDocumentLinkProvider(MARKDOWN, {
      provideDocumentLinks(doc) {
        const masked = maskLines(doc.getText().split(/\r?\n/));
        const out: vscode.DocumentLink[] = [];
        masked.forEach((line, lineNo) => {
          const re = new RegExp(WIKILINK_SOURCE, 'g');
          let m: RegExpExecArray | null;
          while ((m = re.exec(line)) !== null) {
            const parts = parseWikilinkInner(m[2]);
            if (!parts.target) continue;
            const link = new vscode.DocumentLink(
              new vscode.Range(lineNo, m.index, lineNo, m.index + m[0].length),
              vscode.Uri.parse(
                `command:markdown-live.followWikilink?${encodeURIComponent(JSON.stringify([doc.uri.toString(), parts.target]))}`,
              ),
            );
            link.tooltip = index.resolveTarget(doc.uri, parts.target) ? 'Open note' : 'Create note';
            out.push(link);
          }
        });
        return out;
      },
    }),
    vscode.commands.registerCommand('markdown-live.followWikilink', (source: string, wikiTarget: string) => {
      if (typeof source !== 'string' || typeof wikiTarget !== 'string') return;
      const uri = vscode.Uri.parse(source);
      if (!vscode.workspace.getWorkspaceFolder(uri)) return;
      return followWikilink(index, uri, wikiTarget);
    }),

    // …and `[[` completes note names.
    vscode.languages.registerCompletionItemProvider(
      MARKDOWN,
      {
        async provideCompletionItems(doc, pos) {
          const before = doc.lineAt(pos.line).text.slice(0, pos.character);
          const open = /\[\[([^\[\]|#]*)$/.exec(before);
          if (!open) return undefined;
          await index.whenReady();
          const range = new vscode.Range(pos.line, pos.character - open[1].length, pos.line, pos.character);
          return index.notes(doc.uri).map(({ uri, path }) => {
            const text = index.linkTextFor(uri, doc.uri);
            const item = new vscode.CompletionItem(text, vscode.CompletionItemKind.File);
            item.detail = path;
            item.filterText = `${text} ${path}`;
            item.range = range;
            return item;
          });
        },
      },
      '[',
    ),
  );
  return index;
}
