// Finds the links in a Markdown note. Pure.
import { WIKILINK_SOURCE, parseWikilinkInner } from './wikilink';

export interface NoteLink {
  kind: 'wiki' | 'md';
  embed: boolean;
  /** Wiki: the note name or path as written. Md: the decoded path, no fragment. */
  target: string;
  heading: string;
  alias: string;
  line: number;
  /** Columns of the whole link on its line. */
  start: number;
  end: number;
  /** Columns of the part a rename rewrites: the wiki target, or the md path. */
  targetStart: number;
  targetEnd: number;
}

export interface ParsedNote {
  links: NoteLink[];
  /** The note's lines. */
  lines: string[];
  /** The same lines with code and front matter blanked, column for column. */
  masked: string[];
}

// The text of a link can hold an image (`[![alt](img.png)](note.md)`) or an
// escaped bracket (`[a\]b](note.md)`); both contain `]`, so they are matched
// as whole units and never end the text early.
const MD_LINK =
  /(!?)\[((?:\\.|!?\[[^\]\n]*\]\((?:<[^>\n]+>|[^)\s]*)\)|[^\]\n])*)\]\(\s*(<[^>\n]+>|[^)\s]+)(?:\s+"[^"\n]*")?\s*\)/g;
const EXTERNAL = /^([a-z][a-z0-9+.-]*:|\/\/|#)/i;

function blank(s: string): string {
  return s.replace(/[^\n]/g, ' ');
}

/** Blank fenced code, inline code and leading YAML front matter. */
export function maskLines(lines: string[]): string[] {
  const out: string[] = [];
  let fence: string | null = null;
  let inFrontMatter = lines[0]?.trim() === '---';
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (inFrontMatter) {
      out.push(blank(line));
      if (i > 0 && /^(---|\.\.\.)\s*$/.test(line)) inFrontMatter = false;
      continue;
    }
    const f = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
    if (fence) {
      out.push(blank(line));
      if (
        f &&
        f[1][0] === fence[0] &&
        f[1].length >= fence.length &&
        /^\s{0,3}[`~]+\s*$/.test(line)
      )
        fence = null;
      continue;
    }
    if (f) {
      fence = f[1];
      out.push(blank(line));
      continue;
    }
    // Inline code: a run of backticks up to the next run of the same length.
    out.push(line.replace(/(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/g, (m) => blank(m)));
  }
  return out;
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** Parse a note's text into its links and its (masked) lines. */
export function parseNote(text: string): ParsedNote {
  const lines = text.split(/\r?\n/);
  const masked = maskLines(lines);
  const links: NoteLink[] = [];

  masked.forEach((line, lineNo) => {
    const wiki = new RegExp(WIKILINK_SOURCE, 'g');
    let m: RegExpExecArray | null;
    const taken: Array<[number, number]> = [];
    while ((m = wiki.exec(line)) !== null) {
      const parts = parseWikilinkInner(m[2], m[1] === '!');
      if (!parts.target && !parts.heading) continue;
      const innerStart = m.index + m[1].length + 2;
      const rawTarget = m[2].split(/\\?\||#/)[0];
      const lead = rawTarget.length - rawTarget.trimStart().length;
      links.push({
        kind: 'wiki',
        ...parts,
        line: lineNo,
        start: m.index,
        end: m.index + m[0].length,
        targetStart: innerStart + lead,
        targetEnd: innerStart + lead + parts.target.length,
      });
      taken.push([m.index, m.index + m[0].length]);
    }

    MD_LINK.lastIndex = 0;
    while ((m = MD_LINK.exec(line)) !== null) {
      const start = m.index;
      const end = start + m[0].length;
      if (taken.some(([a, b]) => start < b && end > a)) continue;
      let href = m[3];
      // `m[0]` is `m[1] + '[' + m[2] + '](' + ...`, so the delimiter sits
      // exactly after the text group; searching for `](` from the start of
      // the match would hit the one inside an image in the text.
      const afterText = m[1].length + 1 + m[2].length;
      const tail = m[0].slice(afterText + 2);
      let hrefStart = start + afterText + 2 + (tail.length - tail.trimStart().length);
      if (href.startsWith('<')) {
        href = href.slice(1, -1);
        hrefStart += 1;
      }
      if (EXTERNAL.test(href)) continue;
      const hash = href.indexOf('#');
      const path = hash === -1 ? href : href.slice(0, hash);
      if (!/\.(md|markdown)$/i.test(path)) continue;
      links.push({
        kind: 'md',
        embed: m[1] === '!',
        target: safeDecode(path),
        heading: hash === -1 ? '' : safeDecode(href.slice(hash + 1)),
        alias: m[2],
        line: lineNo,
        start,
        end,
        targetStart: hrefStart,
        targetEnd: hrefStart + path.length,
      });
    }
  });

  links.sort((a, b) => a.line - b.line || a.start - b.start);
  return { links, lines, masked };
}

export interface Mention {
  line: number;
  start: number;
  end: number;
}

/**
 * Plain-text occurrences of `name` in a note that are not already inside a
 * link: Obsidian's "unlinked mentions". Whole words, case-insensitive.
 */
export function findUnlinkedMentions(note: ParsedNote, name: string): Mention[] {
  const needle = name.trim();
  if (needle.length < 3) return [];
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`, 'giu');
  const out: Mention[] = [];
  note.masked.forEach((line, lineNo) => {
    const spans = note.links.filter((l) => l.line === lineNo);
    let m: RegExpExecArray | null;
    re.lastIndex = 0;
    while ((m = re.exec(line)) !== null) {
      const start = m.index;
      const end = start + m[0].length;
      if (spans.some((l) => start < l.end && end > l.start)) continue;
      // Inside the text or URL of any other Markdown link or autolink.
      const before = line.slice(0, start);
      if (/\[[^\]]*$/.test(before) && /^[^[]*\]\(/.test(line.slice(end))) continue;
      if (/\]\([^)]*$/.test(before) || /<[^>\s]*$/.test(before) || /https?:\/\/\S*$/.test(before))
        continue;
      out.push({ line: lineNo, start, end });
    }
  });
  return out;
}
