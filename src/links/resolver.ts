// Resolves links to notes the way Obsidian does, and plans the edits that keep
// links working across a rename. Pure: paths are workspace-relative, with `/`.
import { NoteLink } from './parser';

const EXT = /\.(md|markdown)$/i;

export const stripExt = (p: string): string => p.replace(EXT, '');
export const baseName = (p: string): string => stripExt(p.slice(p.lastIndexOf('/') + 1));
export const dirName = (p: string): string => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '');

/** Collapse `.` and `..`; returns null if the path climbs out of the root. */
export function normalisePath(path: string): string | null {
  const out: string[] = [];
  for (const seg of path.replace(/\\/g, '/').split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') {
      if (!out.length) return null;
      out.pop();
    } else out.push(seg);
  }
  return out.join('/');
}

function closest(candidates: string[], source: string): string | null {
  if (!candidates.length) return null;
  const dir = dirName(source);
  const depth = (p: string) => p.split('/').length;
  return [...candidates].sort((a, b) => {
    const sameA = dirName(a) === dir ? 0 : 1;
    const sameB = dirName(b) === dir ? 0 : 1;
    return sameA - sameB || depth(a) - depth(b) || a.localeCompare(b);
  })[0];
}

/** Every note a wikilink target could mean, from the strongest matching tier. */
export function wikiCandidates(target: string, notes: readonly string[]): string[] {
  const t = normalisePath(stripExt(target.trim()));
  if (!t) return [];
  const want = t.toLowerCase();
  const keyed = notes.map((n) => [n, stripExt(n).toLowerCase()] as const);
  const exact = keyed.filter(([, k]) => k === want).map(([n]) => n);
  if (exact.length) return exact;
  return keyed.filter(([, k]) => k.endsWith(`/${want}`)).map(([n]) => n);
}

/**
 * Resolve a wikilink target. An exact path wins, then a path suffix, then the
 * note name alone. Among several matches: the source's own folder first, then
 * the shallowest path. Matching is case-insensitive, as in Obsidian.
 */
export function resolveWiki(target: string, source: string, notes: readonly string[]): string | null {
  if (!target.trim()) return source;
  return closest(wikiCandidates(target, notes), source);
}

/** Resolve a relative (or root-relative) Markdown link path. */
export function resolveMd(href: string, source: string, notes: readonly string[]): string | null {
  const joined = href.startsWith('/') ? href : `${dirName(source)}/${href}`;
  const path = normalisePath(joined);
  if (path === null) return null;
  if (notes.includes(path)) return path;
  const lower = path.toLowerCase();
  return notes.find((n) => n.toLowerCase() === lower) ?? null;
}

export function resolveLink(link: NoteLink, source: string, notes: readonly string[]): string | null {
  return link.kind === 'wiki' ? resolveWiki(link.target, source, notes) : resolveMd(link.target, source, notes);
}

/**
 * `resolveLink` for many links against one set of notes. The set is indexed
 * once, so each lookup costs the size of its answer, not of the vault. It
 * returns exactly what `resolveLink(link, source, notes)` returns.
 */
export function createResolver(notes: readonly string[]): (link: NoteLink, source: string) => string | null {
  const exact = new Map<string, string[]>();
  const suffix = new Map<string, string[]>();
  const anyCase = new Map<string, string>();
  const present = new Set(notes);
  const add = (map: Map<string, string[]>, key: string, note: string) => {
    const list = map.get(key);
    if (list) list.push(note);
    else map.set(key, [note]);
  };
  for (const note of notes) {
    const key = stripExt(note).toLowerCase();
    add(exact, key, note);
    // Every tail that starts at a folder boundary: what `endsWith('/' + target)` accepts.
    for (let at = key.indexOf('/'); at !== -1; at = key.indexOf('/', at + 1)) add(suffix, key.slice(at + 1), note);
    const lower = note.toLowerCase();
    if (!anyCase.has(lower)) anyCase.set(lower, note);
  }
  return (link, source) => {
    if (link.kind === 'wiki') {
      if (!link.target.trim()) return source;
      const t = normalisePath(stripExt(link.target.trim()));
      if (!t) return null;
      const want = t.toLowerCase();
      return closest(exact.get(want) ?? suffix.get(want) ?? [], source);
    }
    const joined = link.target.startsWith('/') ? link.target : `${dirName(source)}/${link.target}`;
    const path = normalisePath(joined);
    if (path === null) return null;
    return present.has(path) ? path : (anyCase.get(path.toLowerCase()) ?? null);
  };
}

/**
 * The shortest wikilink text that means `note` and nothing else. A name shared
 * by two notes is qualified with folders until it is unambiguous.
 */
export function linkTextFor(note: string, _source: string, notes: readonly string[]): string {
  const segs = stripExt(note).split('/');
  for (let i = segs.length - 1; i >= 0; i--) {
    const candidate = segs.slice(i).join('/');
    const found = wikiCandidates(candidate, notes);
    if (found.length === 1 && found[0] === note) return candidate;
  }
  return stripExt(note);
}

/** A relative Markdown link path from one note to another, URL-encoded. */
export function relativeHref(source: string, note: string): string {
  const from = dirName(source).split('/').filter(Boolean);
  const to = note.split('/');
  let i = 0;
  while (i < from.length && i < to.length - 1 && from[i] === to[i]) i++;
  const rel = [...from.slice(i).map(() => '..'), ...to.slice(i)].join('/');
  return rel.split('/').map((s) => (s === '..' ? s : encodeURIComponent(s))).join('/');
}

export interface LinkEdit {
  /** The note to edit, by its path BEFORE the rename. */
  path: string;
  line: number;
  start: number;
  end: number;
  newText: string;
}

/**
 * The edits that keep every link pointing at the same note after `renames`
 * (old path -> new path) are applied. A link is rewritten only when it would
 * otherwise stop resolving to its note.
 */
export function planRenameEdits(
  notes: ReadonlyArray<{ path: string; links: readonly NoteLink[] }>,
  renames: ReadonlyMap<string, string>,
): LinkEdit[] {
  const before = notes.map((n) => n.path);
  const moved = (p: string) => renames.get(p) ?? p;
  const after = before.map(moved);
  const edits: LinkEdit[] = [];

  for (const note of notes) {
    const sourceAfter = moved(note.path);
    for (const link of note.links) {
      if (link.kind === 'wiki' && !link.target) continue; // [[#heading]] is always the note itself
      const dest = resolveLink(link, note.path, before);
      if (!dest) continue;
      const destAfter = moved(dest);
      if (link.kind === 'wiki') {
        if (resolveWiki(link.target, sourceAfter, after) === destAfter && dest === destAfter) continue;
        if (resolveWiki(link.target, sourceAfter, after) === destAfter && baseName(dest) === baseName(destAfter)) continue;
        const newText = link.target.includes('/') && dest !== destAfter && resolveWiki(stripExt(destAfter), sourceAfter, after) === destAfter
          ? stripExt(destAfter)
          : linkTextFor(destAfter, sourceAfter, after);
        if (newText !== link.target) {
          edits.push({ path: note.path, line: link.line, start: link.targetStart, end: link.targetEnd, newText });
        }
      } else {
        if (resolveMd(link.target, sourceAfter, after) === destAfter) continue;
        const rooted = link.target.startsWith('/');
        const newText = rooted ? `/${destAfter.split('/').map(encodeURIComponent).join('/')}` : relativeHref(sourceAfter, destAfter);
        edits.push({ path: note.path, line: link.line, start: link.targetStart, end: link.targetEnd, newText });
      }
    }
  }
  return edits;
}

/** A file name for a note created from a link target; null if unusable. */
export function safeNoteName(target: string): string | null {
  const path = normalisePath(stripExt(target.trim()));
  if (!path) return null;
  const segs = path.split('/');
  if (segs.some((s) => /[<>:"|?*\u0000-\u001f]/.test(s) || /^\.+$/.test(s) || s.length > 120)) return null;
  return `${segs.join('/')}.md`;
}
