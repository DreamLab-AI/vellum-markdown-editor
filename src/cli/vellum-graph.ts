// vellum-graph: Vellum's link graph from a terminal, for scripts and AI agents
// that cannot reach the running extension. It reads the notes under a folder
// the way the extension's LinkIndex does and answers with the same resolver.
// Node only: never imported by the extension bundle.
//
//   npm run graph -- <command> [args] [--root DIR] [--json]
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve as resolvePath, sep } from 'node:path';
import { formatReference } from '../ai/reference';
import { baseName, type LinkEdit } from '../links/resolver';
import { applyEdits, Vault } from '../links/vault';

// Kept in step with src/links/linkIndex.ts (NOTE_GLOB, EXCLUDE, MAX_NOTE_BYTES).
const NOTE_FILE = /\.(md|markdown)$/i;
const SKIP_DIRS = new Set(['node_modules', '.git', '.obsidian', '.trash']);
const MAX_NOTE_BYTES = 2_000_000;

const USAGE = `vellum-graph: query Vellum's note link graph without VS Code.

Usage: npm run graph -- <command> [args] [--root DIR] [--json]

Commands (a <note> is a path relative to the root, or a wikilink target like "Project"):
  notes                     every note the extension would index
  links <note>              links in a note and where each resolves
  backlinks <note>          links in other notes that resolve to this note
  mentions <note>           plain-text mentions of the note's name (unlinked mentions)
  unresolved [note]         wikilinks that point at no note (one note, or all)
  context <note>            the Backlinks panel's "Copy Note and Its Links as AI Context" text
  resolve <target> [--from <note>]
                            the note a wikilink target leads to, written from --from
  linktext <note>           the shortest unambiguous wikilink text for a note
  graph                     every note-to-note edge
  neighbours <note> [--depth N] [--max N]
                            the bounded neighbourhood the editor's graph view draws: notes within
                            N links (1-3, default 1) in either direction, at most --max nodes
                            (10-1000, default 150); says when the bound cut it short
  orphans                   notes with no links in or out
  rename <from> <to> [--apply]
                            the link edits that keep links working after moving a note or
                            folder; --apply rewrites the links and moves it on disk

Options:
  --root DIR   folder to treat as the workspace folder (default: current directory)
  --json       machine-readable output; lines are 1-based, columns 0-based
  -h, --help   this text

Exit status: 0 ok, 1 note or target not found, 2 usage error.`;

class UsageError extends Error {}
class NotFound extends Error {}

interface Args {
  command: string;
  positional: string[];
  root: string;
  json: boolean;
  apply: boolean;
  from?: string;
  depth?: number;
  max?: number;
}

// The most positional arguments each command takes, as the usage text
// documents. Extra arguments were silently ignored, so a mistyped option
// could quietly change the answer: `neighbours Plan depth 2` ran with the
// default depth instead of failing.
const MAX_POSITIONAL: Record<string, number> = {
  notes: 0,
  links: 1,
  backlinks: 1,
  mentions: 1,
  unresolved: 1,
  context: 1,
  resolve: 1,
  linktext: 1,
  graph: 0,
  neighbours: 1,
  orphans: 0,
  rename: 2,
};

function wholeNumber(option: string, value: string, min: number, max: number): number {
  if (!/^\d+$/.test(value)) throw new UsageError(`${option} needs a whole number`);
  const n = Number(value);
  if (n < min || n > max) throw new UsageError(`${option} must be ${min} to ${max}`);
  return n;
}

function parseArgs(argv: string[]): Args | 'help' {
  const out: Args = { command: '', positional: [], root: process.cwd(), json: false, apply: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const value = () => {
      const v = argv[++i];
      if (v === undefined) throw new UsageError(`${a} needs a value`);
      return v;
    };
    if (a === '-h' || a === '--help') return 'help';
    else if (a === '--json') out.json = true;
    else if (a === '--apply') out.apply = true;
    else if (a === '--root') out.root = value();
    else if (a === '--from') out.from = value();
    else if (a === '--depth') out.depth = wholeNumber(a, value(), 1, 3);
    else if (a === '--max') out.max = wholeNumber(a, value(), 10, 1000);
    else if (a.startsWith('--')) throw new UsageError(`unknown option ${a}`);
    else if (!out.command) out.command = a;
    else out.positional.push(a);
  }
  if (!out.command) return 'help';
  if (out.command === 'rename') {
    out.positional = out.positional.map((p) =>
      p.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, ''),
    );
  }
  return out;
}

/** Every note under `root`, as the extension would find it. Symlinked folders are not followed. */
function readNotes(root: string): Array<{ path: string; text: string }> {
  const out: Array<{ path: string; text: string }> = [];
  const walk = (dir: string, rel: string) => {
    for (const d of readdirSync(dir, { withFileTypes: true })) {
      const relPath = rel ? `${rel}/${d.name}` : d.name;
      const abs = join(dir, d.name);
      if (d.isDirectory()) {
        if (!SKIP_DIRS.has(d.name)) walk(abs, relPath);
      } else if ((d.isFile() || d.isSymbolicLink()) && NOTE_FILE.test(d.name)) {
        try {
          const st = statSync(abs);
          if (!st.isFile() || st.size > MAX_NOTE_BYTES) continue;
          out.push({ path: relPath, text: readFileSync(abs, 'utf8') });
        } catch {
          // Unreadable or a dangling link: the extension skips these too.
        }
      }
    }
  };
  walk(root, '');
  return out;
}

const ref = (path: string, line?: number) =>
  formatReference(path, line ? { start: line, end: line } : undefined);

function need(args: Args, n: number, what: string): string[] {
  if (args.positional.length < n) throw new UsageError(`${args.command} needs ${what}`);
  return args.positional;
}

function noteArg(vault: Vault, name: string): string {
  const path = vault.find(name);
  if (!path) throw new NotFound(`no note matches "${name}"`);
  return path;
}

/** Runs one command; returns what to print. */
function run(args: Args, vault: Vault): { json: unknown; text: string } {
  switch (args.command) {
    case 'notes': {
      const paths = vault.paths();
      return { json: paths, text: paths.join('\n') };
    }
    case 'links': {
      const path = noteArg(vault, need(args, 1, 'a note')[0]);
      const rows = vault.outgoing(path).map(({ link, target }) => ({
        line: link.line + 1,
        start: link.start,
        end: link.end,
        kind: link.kind,
        embed: link.embed,
        target: link.target,
        heading: link.heading || undefined,
        alias: link.alias || undefined,
        resolved: target ?? null,
      }));
      const text = rows
        .map(
          (r) =>
            `${path}:${r.line}  ${r.kind === 'wiki' ? `[[${r.target}]]` : r.target}${r.heading ? `#${r.heading}` : ''} -> ${r.resolved ?? '(no such note)'}`,
        )
        .join('\n');
      return { json: { note: path, links: rows }, text: text || `${path}: no links` };
    }
    case 'backlinks': {
      const path = noteArg(vault, need(args, 1, 'a note')[0]);
      const rows = vault.backlinks(path).map((b) => ({
        source: b.source,
        line: b.link.line + 1,
        start: b.link.start,
        end: b.link.end,
        text: b.text,
      }));
      const text = rows.map((r) => `${ref(r.source, r.line)}  ${r.text.trim()}`).join('\n');
      return { json: { note: path, backlinks: rows }, text: text || `${path}: no backlinks` };
    }
    case 'mentions': {
      const path = noteArg(vault, need(args, 1, 'a note')[0]);
      const rows = vault.unlinkedMentions(path).map((m) => ({
        source: m.source,
        line: m.line + 1,
        start: m.start,
        end: m.end,
        text: m.text,
      }));
      const text = rows.map((r) => `${ref(r.source, r.line)}  ${r.text.trim()}`).join('\n');
      return {
        json: { note: path, name: baseName(path), mentions: rows },
        text: text || `${path}: no unlinked mentions`,
      };
    }
    case 'unresolved': {
      const paths = args.positional.length ? [noteArg(vault, args.positional[0])] : vault.paths();
      const rows = paths.flatMap((p) => vault.unresolved(p).map((target) => ({ note: p, target })));
      return {
        json: rows,
        text: rows.map((r) => `${r.note}  [[${r.target}]]`).join('\n') || 'no unresolved wikilinks',
      };
    }
    case 'context': {
      const path = noteArg(vault, need(args, 1, 'a note')[0]);
      const text = vault.context(path);
      return { json: { note: path, context: text }, text };
    }
    case 'resolve': {
      const target = need(args, 1, 'a wikilink target')[0];
      const from = args.from ? noteArg(vault, args.from) : '';
      const hit = vault.resolve(target, from);
      if (!hit) throw new NotFound(`[[${target}]] resolves to no note`);
      return { json: { target, from: from || null, resolved: hit }, text: hit };
    }
    case 'linktext': {
      const path = noteArg(vault, need(args, 1, 'a note')[0]);
      const t = vault.linkText(path);
      return { json: { note: path, linkText: t }, text: `[[${t}]]` };
    }
    case 'graph': {
      const edges = vault.edges();
      return {
        json: { notes: vault.paths(), edges },
        text: edges.map((e) => `${e.from} -> ${e.to}`).join('\n'),
      };
    }
    case 'neighbours': {
      const path = noteArg(vault, need(args, 1, 'a note')[0]);
      const g = vault.neighbourhood(path, { depth: args.depth, maxNodes: args.max })!;
      const name = (id: string) => g.nodes.find((n) => n.id === id)!;
      const show = (id: string) => (name(id).missing ? `[[${name(id).label}]] (missing)` : id);
      const lines = [
        ...g.nodes.filter((n) => n.depth > 0).map((n) => `${n.depth}  ${show(n.id)}`),
        ...g.edges.map((e) => `${show(e.source)} -> ${show(e.target)}`),
      ];
      if (g.truncated)
        lines.push(
          `truncated: ${g.hidden} more within ${g.depth} link(s); raise --max (now ${g.maxNodes})`,
        );
      return { json: g, text: lines.join('\n') || 'no linked notes' };
    }
    case 'orphans': {
      const o = vault.orphans();
      return { json: o, text: o.join('\n') || 'no orphan notes' };
    }
    case 'rename': {
      const [from, to] = need(args, 2, '<from> and <to>');
      const renames = vault.renames(from, to);
      if (!renames.size) throw new NotFound(`no note at or under "${from}"`);
      const edits = vault.renameEdits(renames);
      const rows = edits.map((e) => ({
        note: e.path,
        line: e.line + 1,
        start: e.start,
        end: e.end,
        newText: e.newText,
      }));
      const moves = [...renames].map(([a, b]) => ({ from: a, to: b }));
      const text = [
        ...moves.map((m) => `move ${m.from} -> ${m.to}`),
        ...rows.map(
          (r) =>
            `edit ${r.note}:${r.line}  ${(vault.get(r.note)?.lines[r.line - 1] ?? '').slice(r.start, r.end)} -> ${r.newText}`,
        ),
      ].join('\n');
      return { json: { moves, edits: rows, applied: false }, text: text || 'nothing to change' };
    }
    default:
      throw new UsageError(`unknown command "${args.command}"`);
  }
}

/** Rewrite links, then move the note or folder. Refuses to overwrite. */
function applyRename(root: string, from: string, to: string, edits: LinkEdit[]): void {
  const src = resolvePath(root, from);
  const dst = resolvePath(root, to);
  for (const [name, path] of [
    [from, src],
    [to, dst],
  ]) {
    const rel = relative(root, path);
    if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel))
      throw new UsageError(`"${name}" is outside the root or names the root itself`);
  }
  // Reject predictable move failures before writing any link edits. lstat also
  // catches a dangling symlink, which existsSync would allow us to overwrite.
  if (lstatSync(dst, { throwIfNoEntry: false })) throw new UsageError(`"${to}" already exists`);
  if (statSync(src).isDirectory() && dst.startsWith(`${src}${sep}`))
    throw new UsageError(`cannot move "${from}" inside itself`);
  mkdirSync(dirname(dst), { recursive: true });
  const byNote = new Map<string, LinkEdit[]>();
  for (const e of edits) byNote.set(e.path, [...(byNote.get(e.path) ?? []), e]);
  for (const [note, list] of byNote) {
    const abs = join(root, note);
    writeFileSync(abs, applyEdits(readFileSync(abs, 'utf8'), list));
  }
  renameSync(src, dst);
}

function main(argv: string[]): number {
  let args: Args | 'help';
  try {
    args = parseArgs(argv);
  } catch (e) {
    console.error(`vellum-graph: ${(e as Error).message}\n\n${USAGE}`);
    return 2;
  }
  if (args === 'help') {
    console.log(USAGE);
    return 0;
  }
  try {
    const root = resolvePath(args.root);
    if (!existsSync(root) || !statSync(root).isDirectory())
      throw new UsageError(`--root ${args.root} is not a folder`);
    const maxPositional: number | undefined = MAX_POSITIONAL[args.command];
    if (maxPositional !== undefined && args.positional.length > maxPositional) {
      const what =
        maxPositional === 0
          ? 'no positional arguments'
          : `at most ${maxPositional} argument${maxPositional === 1 ? '' : 's'}`;
      throw new UsageError(`"${args.command}" takes ${what}`);
    }
    const vault = new Vault(readNotes(root));
    const result = run(args, vault);
    if (args.command === 'rename' && args.apply) {
      const out = result.json as { moves: unknown; edits: unknown[]; applied: boolean };
      const [from, to] = args.positional;
      applyRename(
        root,
        from.replace(/\/+$/, ''),
        to.replace(/\/+$/, ''),
        vault.renameEdits(vault.renames(from, to)),
      );
      out.applied = true;
      result.text += `\napplied: ${out.edits.length} link edit(s), moved ${from} -> ${to}`;
    }
    console.log(args.json ? JSON.stringify(result.json, null, 2) : result.text);
    return 0;
  } catch (e) {
    console.error(`vellum-graph: ${(e as Error).message}`);
    return e instanceof NotFound ? 1 : 2;
  }
}

process.exitCode = main(process.argv.slice(2));
