// The link graph of a set of notes held in memory: the same queries as
// LinkIndex, without VS Code. Used by the headless CLI (src/cli) so tools and
// agents outside the editor get the extension's own answers. Pure: paths are
// relative to one root, with `/`. Lines in results are 0-based, like NoteLink.
import { findUnlinkedMentions, NoteLink, parseNote, ParsedNote } from './parser';
import {
  baseName,
  LinkEdit,
  linkTextFor,
  planRenameEdits,
  resolveLink,
  resolveWiki,
} from './resolver';
import { buildLinkContext } from '../ai/reference';
import { GraphBounds, NoteGraph, noteNeighbourhood } from './graph';

export interface VaultNote extends ParsedNote {
  path: string;
}

export interface VaultBacklink {
  source: string;
  link: NoteLink;
  text: string;
}

export interface VaultMention {
  source: string;
  line: number;
  start: number;
  end: number;
  text: string;
}

export interface VaultOutgoing {
  link: NoteLink;
  /** The note the link resolves to; absent when it points at nothing. */
  target?: string;
}

export class Vault {
  private readonly notes = new Map<string, VaultNote>();

  constructor(files: Iterable<{ path: string; text: string }> = []) {
    for (const f of files) this.set(f.path, f.text);
  }

  set(path: string, text: string): void {
    this.notes.set(path, { path, ...parseNote(text) });
  }

  paths(): string[] {
    return [...this.notes.keys()].sort((a, b) => a.localeCompare(b));
  }

  get(path: string): VaultNote | undefined {
    return this.notes.get(path);
  }

  /**
   * A note named on a command line: an exact path, a path that differs only in
   * case, or anything a wikilink could say (`Note`, `dir/Note`).
   */
  find(name: string): string | undefined {
    const clean = name.replace(/\\/g, '/').replace(/^\.\//, '');
    if (!clean) return undefined;
    if (this.notes.has(clean)) return clean;
    const lower = clean.toLowerCase();
    const ci = this.paths().find((p) => p.toLowerCase() === lower);
    return ci ?? resolveWiki(clean, '', this.paths()) ?? undefined;
  }

  /** Where `target`, written as a wikilink in `from`, would lead. */
  resolve(target: string, from = ''): string | undefined {
    return resolveLink({ kind: 'wiki', target } as NoteLink, from, this.paths()) ?? undefined;
  }

  outgoing(path: string): VaultOutgoing[] {
    const note = this.notes.get(path);
    if (!note) return [];
    const paths = this.paths();
    return note.links.map((link) => {
      const target = resolveLink(link, path, paths);
      return target ? { link, target } : { link };
    });
  }

  backlinks(path: string): VaultBacklink[] {
    if (!this.notes.has(path)) return [];
    const paths = this.paths();
    const out: VaultBacklink[] = [];
    for (const n of this.notes.values()) {
      if (n.path === path) continue;
      for (const link of n.links) {
        if (resolveLink(link, n.path, paths) === path)
          out.push({ source: n.path, link, text: n.lines[link.line] ?? '' });
      }
    }
    return out.sort((a, b) => a.source.localeCompare(b.source) || a.link.line - b.link.line);
  }

  unlinkedMentions(path: string): VaultMention[] {
    if (!this.notes.has(path)) return [];
    const name = baseName(path);
    const out: VaultMention[] = [];
    for (const n of this.notes.values()) {
      if (n.path === path) continue;
      for (const m of findUnlinkedMentions(n, name))
        out.push({ source: n.path, ...m, text: n.lines[m.line] ?? '' });
    }
    return out.sort((a, b) => a.source.localeCompare(b.source) || a.line - b.line);
  }

  /** Wikilink targets in `path` that point at no note. */
  unresolved(path: string): string[] {
    const out = new Set<string>();
    for (const o of this.outgoing(path)) {
      if (o.link.kind === 'wiki' && o.link.target && !o.target) out.add(o.link.target);
    }
    return [...out];
  }

  /** Every link between two notes, once per note pair and direction. */
  edges(): Array<{ from: string; to: string }> {
    const seen = new Set<string>();
    const out: Array<{ from: string; to: string }> = [];
    for (const from of this.paths()) {
      for (const o of this.outgoing(from)) {
        if (!o.target || o.target === from) continue;
        const key = `${from}\u0000${o.target}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ from, to: o.target });
      }
    }
    return out;
  }

  /** The bounded neighbourhood the extension's graph view draws for `path`. */
  neighbourhood(path: string, bounds?: GraphBounds): NoteGraph | undefined {
    return noteNeighbourhood([...this.notes.values()], path, bounds);
  }

  /** Notes with no links to or from any other note. */
  orphans(): string[] {
    const linked = new Set(this.edges().flatMap((e) => [e.from, e.to]));
    return this.paths().filter((p) => !linked.has(p));
  }

  /** The shortest unambiguous wikilink text for `path`. */
  linkText(path: string): string {
    return linkTextFor(path, '', this.paths());
  }

  /** The text the Backlinks panel's "Copy Note and Its Links as AI Context" produces. */
  context(path: string, limit?: number): string {
    return buildLinkContext(
      {
        note: path,
        backlinks: this.backlinks(path).map((b) => ({ path: b.source, line: b.link.line + 1 })),
        outgoing: this.outgoing(path).flatMap((o) => (o.target ? [o.target] : [])),
        unresolved: this.unresolved(path),
      },
      limit,
    );
  }

  /**
   * The old-path -> new-path map for renaming a note, or every note under a
   * folder. Empty when `from` matches nothing.
   */
  renames(from: string, to: string): Map<string, string> {
    const strip = (p: string) => p.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '');
    const a = strip(from);
    const b = strip(to);
    const out = new Map<string, string>();
    for (const p of this.paths()) {
      if (p === a) out.set(p, b);
      else if (p.startsWith(`${a}/`)) out.set(p, b + p.slice(a.length));
    }
    return out;
  }

  /** The link edits that keep every link working after `renames`. */
  renameEdits(renames: ReadonlyMap<string, string>): LinkEdit[] {
    return planRenameEdits([...this.notes.values()], renames);
  }
}

/** Apply edits (all for one note, same coordinates as LinkEdit) to its text. */
export function applyEdits(text: string, edits: readonly LinkEdit[]): string {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = text.split(/\r?\n/);
  const sorted = [...edits].sort((x, y) => y.line - x.line || y.start - x.start);
  for (const e of sorted) {
    const l = lines[e.line];
    if (l === undefined) continue;
    lines[e.line] = l.slice(0, e.start) + e.newText + l.slice(e.end);
  }
  return lines.join(eol);
}
