// Where the current selection sits in the Markdown source, so the host can
// build a file reference with a line range for an AI assistant.
import { editorViewCtx, serializerCtx } from '@milkdown/core';
import { endOfPrefix, fingerprint, SelectionInfo } from '../../src/ai/reference';
import { state } from '../state';

export function currentSelectionInfo(): SelectionInfo {
  // Source mode: CodeMirror holds the file as written, so lines are exact.
  if (state.isSourceMode && state.cmView) {
    const cm = state.cmView.state;
    const range = cm.selection.main;
    return {
      text: cm.sliceDoc(range.from, range.to),
      startLine: cm.doc.lineAt(range.from).number,
      endLine: cm.doc.lineAt(range.to).number,
      fpStart: '',
      fpEnd: '',
    };
  }

  let info: SelectionInfo = { text: '' };
  state.editor?.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    const { doc, selection } = view.state;
    const { from, to } = selection;
    const text = doc.textBetween(from, to, '\n');
    info = { text };
    try {
      // Serialise the document up to each end of the selection: the line that
      // prefix ends on is the source line. The host then pins both ends to the
      // file on disk, whose formatting may differ from the serialiser's.
      const serialise = ctx.get(serializerCtx);
      const size = doc.content.size;
      const upTo = (pos: number) => serialise(doc.cut(0, Math.min(Math.max(pos, 1), size)));
      const frontmatterLines = (state.currentFrontmatter.match(/\n/g) || []).length;
      const start = endOfPrefix(upTo(from + 1), frontmatterLines);
      const end = to > from ? endOfPrefix(upTo(to), frontmatterLines) : start;
      // A prefix ends part-way through its last line. Take the whole line from
      // the full serialisation when it agrees, for a stronger fingerprint.
      const full = serialise(doc).split('\n');
      const whole = (at: { line: number; fp: string }) => {
        const fp = fingerprint(full[at.line - frontmatterLines - 1] ?? '');
        return fp.startsWith(at.fp) ? fp : at.fp;
      };
      info = { text, startLine: start.line, endLine: Math.max(start.line, end.line), fpStart: whole(start), fpEnd: whole(end) };
    } catch {
      // A selection that cannot be serialised still sends its text.
    }
  });
  return info;
}
