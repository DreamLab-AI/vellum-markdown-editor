// The neighbourhood of one note in the link graph, bounded for display. Pure:
// the extension (LinkIndex) and the CLI (Vault) both build their graph view
// here, so they give the same answer. Paths are relative to one root, with `/`.
import { NoteLink } from './parser';
import { baseName, createResolver, normalisePath, stripExt } from './resolver';

export const GRAPH_DEPTH = { min: 1, max: 3, default: 1 } as const;
export const GRAPH_NODES = { min: 10, max: 1000, default: 150 } as const;

export interface GraphNote {
  path: string;
  links: readonly NoteLink[];
}

export interface NoteGraphNode {
  /** A note's path, or `/?` followed by a missing note's wikilink target, normalised as resolution
   * normalises it and in lower case (no path starts with `/`). */
  id: string;
  label: string;
  /** Present for a note that exists. */
  path?: string;
  /** A wikilink target that points at no note. Not a file, and never a fact about one. */
  missing: boolean;
  /** Links to and from other notes in the whole root, not only those shown. */
  degree: number;
  /** Hops from the centre. */
  depth: number;
}

export interface NoteGraph {
  centre: string;
  nodes: NoteGraphNode[];
  /** One per pair and direction, between nodes that are shown. */
  edges: Array<{ source: string; target: string }>;
  /** True when the node bound cut the neighbourhood short. */
  truncated: boolean;
  /** Notes and missing notes within `depth` links that the bound left out. */
  hidden: number;
  depth: number;
  maxNodes: number;
}

export interface GraphBounds {
  depth?: number;
  maxNodes?: number;
}

const clampInt = (value: unknown, range: { min: number; max: number; default: number }): number => {
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : range.default;
  return Math.min(range.max, Math.max(range.min, n));
};

/** Bounds as the graph will apply them: integers inside the supported ranges. */
export function graphBounds(bounds: GraphBounds = {}): { depth: number; maxNodes: number } {
  return {
    depth: clampInt(bounds.depth, GRAPH_DEPTH),
    maxNodes: clampInt(bounds.maxNodes, GRAPH_NODES),
  };
}

// `[[Foo]]`, `[[foo.md]]` and `[[./Foo]]` name one missing note, as they would name one note.
const missingId = (target: string): string =>
  `/?${(normalisePath(stripExt(target.trim())) || target.trim()).toLowerCase()}`;

/**
 * Every note-to-note link in a root, and every wikilink that points at nothing.
 * A link resolves the way it does everywhere else in Vellum: `createResolver`
 * gives `resolveLink`'s answers from an index built once per call.
 */
function adjacency(notes: readonly GraphNote[]): {
  out: Map<string, Set<string>>;
  labels: Map<string, string>;
} {
  const paths = notes.map((n) => n.path);
  const resolve = createResolver(paths);
  const out = new Map<string, Set<string>>(paths.map((p) => [p, new Set<string>()]));
  const labels = new Map<string, string>();
  for (const note of notes) {
    const targets = out.get(note.path)!;
    for (const link of note.links) {
      // An empty wikilink target (`[[#Heading]]`) is the note itself.
      if (!link.target.trim()) continue;
      const target = resolve(link, note.path);
      if (target) {
        if (target !== note.path) targets.add(target);
      } else if (link.kind === 'wiki') {
        const id = missingId(link.target);
        targets.add(id);
        // The shortest spelling, then the first in order: the same whichever note is read first.
        const label = link.target.trim();
        const held = labels.get(id);
        if (
          held === undefined ||
          label.length < held.length ||
          (label.length === held.length && label < held)
        )
          labels.set(id, label);
      }
    }
  }
  return { out, labels };
}

/**
 * The notes within `depth` links of `centre`, in either direction, with the
 * links among them. Nearer notes are kept first when `maxNodes` is reached, and
 * the result says so. Undefined when `centre` is not one of `notes`.
 */
export function noteNeighbourhood(
  notes: readonly GraphNote[],
  centre: string,
  bounds: GraphBounds = {},
): NoteGraph | undefined {
  if (!notes.some((n) => n.path === centre)) return undefined;
  const { depth, maxNodes } = graphBounds(bounds);
  const { out, labels } = adjacency(notes);

  const both = new Map<string, Set<string>>();
  const touch = (id: string) => both.get(id) ?? both.set(id, new Set()).get(id)!;
  for (const [from, targets] of out) {
    touch(from);
    for (const to of targets) {
      touch(from).add(to);
      touch(to).add(from);
    }
  }

  // Everything within `depth` links, nearest first; within one distance, existing notes
  // before missing ones, then by path. The bound keeps the head of that order, so the cut
  // is stable and every note kept is linked to one kept a step nearer the centre.
  const reach = new Map<string, number>([[centre, 0]]);
  let frontier = [centre];
  for (let hop = 1; hop <= depth && frontier.length; hop++) {
    const reached = new Set<string>();
    for (const id of frontier)
      for (const next of both.get(id) ?? []) if (!reach.has(next)) reached.add(next);
    frontier = [...reached].sort(
      (a, b) => Number(labels.has(a)) - Number(labels.has(b)) || a.localeCompare(b),
    );
    for (const id of frontier) reach.set(id, hop);
  }
  const hidden = Math.max(0, reach.size - maxNodes);
  const depths = new Map([...reach].slice(0, maxNodes));

  const shown = [...depths.keys()];
  const names = new Map<string, number>();
  for (const id of shown)
    if (!labels.has(id))
      names.set(baseName(id).toLowerCase(), (names.get(baseName(id).toLowerCase()) ?? 0) + 1);
  const nodes: NoteGraphNode[] = shown.map((id) => {
    const missing = labels.has(id);
    const node: NoteGraphNode = {
      id,
      // Two shown notes with one name are told apart by their folders.
      label: missing
        ? labels.get(id)!
        : names.get(baseName(id).toLowerCase())! > 1
          ? stripExt(id)
          : baseName(id),
      missing,
      degree: both.get(id)?.size ?? 0,
      depth: depths.get(id)!,
    };
    if (!missing) node.path = id;
    return node;
  });
  const edges: NoteGraph['edges'] = [];
  for (const source of shown) {
    for (const target of out.get(source) ?? [])
      if (depths.has(target)) edges.push({ source, target });
  }
  edges.sort((a, b) => a.source.localeCompare(b.source) || a.target.localeCompare(b.target));
  return { centre, nodes, edges, truncated: hidden > 0, hidden, depth, maxNodes };
}
