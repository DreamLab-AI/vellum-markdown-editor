// Turning a selection in the rendered editor into something an AI assistant
// can use: a file reference with a line range. Pure: no VS Code or DOM imports.

/** What the webview reports about the current selection. Lines are 1-based. */
export interface SelectionInfo {
  text: string;
  /** Estimated source lines, from serialising the document up to the selection. */
  startLine?: number;
  endLine?: number;
  /** Letters and digits of the source line up to the selection's start / end. */
  fpStart?: string;
  fpEnd?: string;
}

/** Letters and digits only, lower-cased: stable across Markdown re-formatting. */
export function fingerprint(line: string): string {
  return line.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
}

function nearest(lines: readonly string[], estimate: number, fp: string, from = 1): number {
  const clamp = (n: number) => Math.min(Math.max(n, from), Math.max(lines.length, from));
  const est = clamp(estimate);
  if (!fp) return est;
  const hit = (n: number) =>
    n >= from && n <= lines.length && fingerprint(lines[n - 1]).startsWith(fp);
  for (let d = 0; d <= lines.length; d++) {
    if (hit(est - d)) return est - d;
    if (hit(est + d)) return est + d;
  }
  return est;
}

/**
 * Pin an estimated line range to the real document. The editor's own
 * serialisation can differ from the file on disk (collapsed blank lines, list
 * markers), so each end is moved to the nearest line whose fingerprint begins
 * with the reported one. Returns 1-based, inclusive lines, or undefined when
 * the selection carried no position.
 */
export function locateLines(
  source: string,
  info: SelectionInfo,
): { start: number; end: number } | undefined {
  if (!Number.isInteger(info.startLine) || !Number.isInteger(info.endLine)) return undefined;
  const lines = source.split(/\r?\n/);
  const start = nearest(lines, info.startLine as number, info.fpStart ?? '');
  const span = Math.max(0, (info.endLine as number) - (info.startLine as number));
  const end = nearest(lines, start + span, info.fpEnd ?? '', start);
  return { start, end };
}

/** `@path#5-10`, `@path#5` or `@path`: the form Claude Code's prompt box accepts. */
export function formatReference(path: string, range?: { start: number; end: number }): string {
  const p = path.replace(/\\/g, '/');
  if (!range) return `@${p}`;
  return range.start === range.end ? `@${p}#${range.start}` : `@${p}#${range.start}-${range.end}`;
}

export interface LinkContextInput {
  note: string;
  /** Notes that link to this one, with the 1-based line of each link. */
  backlinks: ReadonlyArray<{ path: string; line: number }>;
  /** Notes this one links to. */
  outgoing: readonly string[];
  /** Wikilink targets in this note that do not exist. */
  unresolved: readonly string[];
}

/**
 * A prompt fragment that hands an assistant a note together with its place in
 * the link graph, as file references it can open itself.
 * Every list is capped at `limit` entries and says how many were left out.
 */
export function buildLinkContext(input: LinkContextInput, limit = 40): string {
  const uniq = <T>(xs: readonly T[]) => [...new Set(xs)];
  const out = [`Note: ${formatReference(input.note)}`];
  const back = uniq(
    input.backlinks.map((b) => formatReference(b.path, { start: b.line, end: b.line })),
  );
  if (back.length) {
    out.push('', `Linked from (${back.length}):`, ...back.slice(0, limit).map((r) => `- ${r}`));
    if (back.length > limit) out.push(`- … and ${back.length - limit} more`);
  }
  const fwd = uniq(input.outgoing.filter((p) => p !== input.note).map((p) => formatReference(p)));
  if (fwd.length) {
    out.push('', `Links to (${fwd.length}):`, ...fwd.slice(0, limit).map((r) => `- ${r}`));
    if (fwd.length > limit) out.push(`- … and ${fwd.length - limit} more`);
  }
  const missing = uniq(input.unresolved);
  if (missing.length) {
    const list = missing
      .slice(0, limit)
      .map((t) => `[[${t}]]`)
      .join(', ');
    const overflow =
      missing.length > limit ? `, … and ${missing.length - limit} more` : '';
    out.push('', `Links to notes that do not exist yet: ${list}${overflow}`);
  }
  return out.join('\n');
}

export const CLAUDE_EXTENSION_ID = 'anthropic.claude-code';

/**
 * The parts of the link that opens a new Claude Code tab with the prompt
 * pre-filled (not submitted). The query is encoded here and must be handed to
 * `vscode.Uri.from` as-is: VS Code decodes a URI's query once on the way in,
 * so parsing the finished string instead would strip this encoding and a
 * prompt containing `&`, `+` or `%` would be split or garbled.
 */
export function claudeOpenParts(prompt: string): {
  scheme: string;
  authority: string;
  path: string;
  query: string;
} {
  return {
    scheme: 'vscode',
    authority: CLAUDE_EXTENSION_ID,
    path: '/open',
    query: `prompt=${encodeURIComponent(prompt)}`,
  };
}

/** The same link as text, as Claude Code documents it (for display and tests). */
export function claudeOpenUri(prompt: string): string {
  const p = claudeOpenParts(prompt);
  return `${p.scheme}://${p.authority}${p.path}?${p.query}`;
}

/** Longest prompt sent through a link; longer ones stay on the clipboard. */
export const MAX_LINK_PROMPT = 6000;

/**
 * Inside a table row a wikilink's pipe must be written `\|`, or it splits the
 * cell. Escapes the unescaped ones; leaves everything else alone.
 */
export function escapeWikilinkPipesInTables(markdown: string): string {
  if (!markdown.includes('[[')) return markdown;
  return markdown
    .split('\n')
    .map((line) =>
      /^\s*\|/.test(line)
        ? line.replace(/\[\[[^[\]\n]*\]\]/g, (link) => link.replace(/(?<!\\)\|/g, '\\|'))
        : line,
    )
    .join('\n');
}

export type AiTarget = 'claude' | 'antigravity' | 'chat' | 'clipboard';

/** Which assistant "Send to AI" should use. */
export function chooseTarget(
  setting: string | undefined,
  has: { claude: boolean; antigravity: boolean },
): AiTarget {
  if (
    setting === 'claude' ||
    setting === 'antigravity' ||
    setting === 'chat' ||
    setting === 'clipboard'
  )
    return setting;
  if (has.claude) return 'claude';
  if (has.antigravity) return 'antigravity';
  return 'chat';
}

/**
 * The 1-based source line a serialised prefix of the document ends on, and the
 * fingerprint of that (possibly cut-off) last line. Used by the webview: it
 * serialises the document up to each end of the selection.
 */
export function endOfPrefix(
  markdownPrefix: string,
  frontmatterLines = 0,
): { line: number; fp: string } {
  const lines = markdownPrefix.replace(/\s+$/, '').split('\n');
  return { line: lines.length + frontmatterLines, fp: fingerprint(lines[lines.length - 1] ?? '') };
}

/**
 * Where to put the cursor and scroll after the document was replaced by an
 * external edit: the same position, clamped to the new document's size.
 */
export function clampPosition(pos: number, newSize: number): number {
  return Math.max(0, Math.min(pos, newSize));
}
