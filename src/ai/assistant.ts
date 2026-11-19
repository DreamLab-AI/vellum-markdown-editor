// Getting a selection, or a note's link context, from the live editor to an
// AI assistant.
//
// The live editor is a custom editor, so while it has focus VS Code has no
// active text editor and assistants that read "the open file and selection"
// see nothing. Everything here closes that gap with documented mechanisms: a
// file reference with a line range, the real text editor showing the same
// selection, and Claude Code's URI handler.
import * as vscode from 'vscode';
import { activeNote } from '../links/backlinksView';
import type { LinkIndex } from '../links/linkIndex';
import {
  buildLinkContext,
  chooseTarget,
  claudeOpenParts,
  CLAUDE_EXTENSION_ID,
  MAX_LINK_PROMPT,
  formatReference,
  locateLines,
  SelectionInfo,
} from './reference';

const MAX_TEXT = 200_000;
const relative = (uri: vscode.Uri) =>
  vscode.workspace.asRelativePath(uri, false).replace(/\\/g, '/');
const line = (v: unknown) =>
  typeof v === 'number' && Number.isInteger(v) && v > 0 && v < 10_000_000 ? v : undefined;
const short = (v: unknown) => (typeof v === 'string' ? v.slice(0, 400) : '');

/** Validate a selection message from the webview. */
export function selectionFromMessage(e: Record<string, unknown>): SelectionInfo {
  return {
    text: typeof e.text === 'string' ? e.text.slice(0, MAX_TEXT) : '',
    startLine: line(e.startLine),
    endLine: line(e.endLine),
    fpStart: short(e.fpStart),
    fpEnd: short(e.fpEnd),
  };
}

function located(document: vscode.TextDocument, info: SelectionInfo): vscode.Range | undefined {
  const r = locateLines(document.getText(), info);
  if (!r) return undefined;
  const last = Math.min(r.end, document.lineCount) - 1;
  const first = Math.min(r.start - 1, last);
  // No selected text: a cursor on the line. Otherwise whole lines.
  return info.text
    ? new vscode.Range(first, 0, last, document.lineAt(last).text.length)
    : new vscode.Range(first, 0, first, 0);
}

function referenceFor(document: vscode.TextDocument, info: SelectionInfo): string {
  const range = info.text ? located(document, info) : undefined;
  return formatReference(
    relative(document.uri),
    range && { start: range.start.line + 1, end: range.end.line + 1 },
  );
}

/**
 * Show the note in a real text editor beside the live one, with the same
 * lines selected. Anything that reads the active editor's selection, Claude
 * Code included, then sees it.
 */
export async function revealSelection(
  document: vscode.TextDocument,
  info: SelectionInfo,
): Promise<vscode.TextEditor> {
  const open = vscode.window.visibleTextEditors.find(
    (ed) => ed.document.uri.toString() === document.uri.toString(),
  );
  return vscode.window.showTextDocument(document, {
    viewColumn: open?.viewColumn ?? vscode.ViewColumn.Beside,
    selection: located(document, info),
    preserveFocus: false,
    preview: true,
  });
}

/** Copy `@path#start-end` for the selection (or `@path` with nothing selected). */
export async function copyReference(
  document: vscode.TextDocument,
  info: SelectionInfo,
): Promise<void> {
  const reference = referenceFor(document, info);
  await vscode.env.clipboard.writeText(reference);
  vscode.window.setStatusBarMessage(`Copied ${reference}`, 4000);
}

/** Returns false when the prompt is too long for a link; it is on the clipboard either way. */
async function openInClaude(prompt: string): Promise<boolean> {
  if (prompt.length > MAX_LINK_PROMPT) {
    void vscode.window.showInformationMessage(
      'That is too long to pre-fill. It is on the clipboard: paste it into Claude Code.',
    );
    return false;
  }
  return vscode.env.openExternal(vscode.Uri.from(claudeOpenParts(prompt)));
}

const hasClaude = () => !!vscode.extensions.getExtension(CLAUDE_EXTENSION_ID);

/** "Send Selection to AI Assistant". */
export async function sendToAssistant(
  document: vscode.TextDocument,
  info: SelectionInfo,
): Promise<void> {
  const config = vscode.workspace.getConfiguration('markdownLive');
  const commands = await vscode.commands.getCommands(true);
  const target = chooseTarget(config.get<string>('aiTarget'), {
    claude: hasClaude(),
    antigravity: commands.includes('antigravity.addContext'),
  });
  const reference = referenceFor(document, info);

  if (target === 'claude') {
    await vscode.env.clipboard.writeText(reference);
    const delivery = config.get<string>('claudeDelivery', 'selection');
    if (delivery === 'newTab') {
      await openInClaude(`${reference} `);
      return;
    }
    if (delivery === 'selection') {
      await revealSelection(document, info);
      // Claude Code's "Insert @-Mention Reference" works on the focused text
      // editor. Its command ID is not documented, so it is looked up by name
      // and its absence is not an error: the selection is visible to Claude
      // either way, and the reference is on the clipboard.
      const mention = commands.find((c) => /^claude-(vscode|code)\.insertAtMention/i.test(c));
      if (mention) {
        try {
          await vscode.commands.executeCommand(mention);
          vscode.window.setStatusBarMessage(`Sent ${reference} to Claude Code`, 4000);
          return;
        } catch {
          /* fall through to the message below */
        }
      }
      vscode.window.setStatusBarMessage(
        `Selection shown to Claude Code; ${reference} copied`,
        5000,
      );
      return;
    }
    vscode.window.setStatusBarMessage(`Copied ${reference}`, 4000);
    return;
  }

  if (target === 'antigravity') {
    try {
      const name = document.uri.path.split('/').pop() || 'note.md';
      await vscode.commands.executeCommand('antigravity.addContext', {
        uri: document.uri,
        name,
        label: `Selection from ${name}`,
        text: info.text,
        content: info.text,
        value: info.text,
        type: 'file',
        kind: 'file',
      });
      return;
    } catch {
      /* fall through to the clipboard */
    }
  }

  const payload = info.text ? `${reference}\n\n${info.text}` : reference;
  await vscode.env.clipboard.writeText(payload);
  if (target === 'chat') {
    try {
      await vscode.commands.executeCommand('workbench.action.chat.open', info.text || reference);
      return;
    } catch {
      /* no chat view in this host */
    }
  }
  vscode.window.setStatusBarMessage(`Copied ${reference}`, 4000);
}

/**
 * Copy the note in focus together with its place in the link graph, as file
 * references an assistant can open: the note, what links to it, what it links
 * to and which links point nowhere.
 */
export async function copyLinkContext(index: LinkIndex): Promise<void> {
  const note = activeNote();
  if (!note) {
    void vscode.window.showInformationMessage('Open a Markdown note first.');
    return;
  }
  await index.whenReady();
  const backlinks = index
    .backlinks(note)
    .map((b) => ({ path: b.sourcePath, line: b.link.line + 1 }));
  const outgoing = index.outgoing(note).flatMap((o) => (o.target ? [relative(o.target)] : []));
  const text = buildLinkContext({
    note: relative(note),
    backlinks,
    outgoing,
    unresolved: index.unresolvedTargets(note),
  });
  await vscode.env.clipboard.writeText(text);

  const summary = `Copied link context: ${new Set(backlinks.map((b) => b.path)).size} linking, ${new Set(outgoing).size} linked.`;
  if (!hasClaude()) {
    vscode.window.setStatusBarMessage(summary, 5000);
    return;
  }
  const open = 'Open in Claude Code';
  if ((await vscode.window.showInformationMessage(summary, open)) === open)
    await openInClaude(`${text}\n\n`);
}
