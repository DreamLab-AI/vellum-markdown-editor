// The messages between the graph panel and its webview. Pure. Everything the
// webview sends is validated here before the extension acts on it.
import { GRAPH_DEPTH, GRAPH_NODES, NoteGraph } from '../links/graph';

/** What the extension sends: a graph to draw, or the reason there is none. */
export type GraphPayload =
  | {
      type: 'graph';
      /** Rises with every payload. The webview echoes it; the extension ignores an old one. */
      generation: number;
      title: string;
      graph: NoteGraph;
      limits: { depth: { min: number; max: number }; maxNodes: number };
    }
  | { type: 'empty'; generation: number; message: string };

/** What the webview may ask for. Nothing else is accepted. */
export type GraphRequest =
  | { type: 'ready' }
  | { type: 'open'; generation: number; id: string }
  | { type: 'bounds'; depth: number; maxNodes: number };

const MAX_ID_LENGTH = 4096;
const wholeIn = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;

/**
 * A request from the webview, or undefined for anything else. A node is named
 * by the opaque ID the extension sent, never by a path or URI of its own; the
 * extension looks the ID up in the graph it last sent.
 */
export function parseGraphRequest(raw: unknown): GraphRequest | undefined {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined;
  const m = raw as Record<string, unknown>;
  switch (m.type) {
    case 'ready':
      return { type: 'ready' };
    case 'open':
      if (!wholeIn(m.generation, 0, Number.MAX_SAFE_INTEGER)) return undefined;
      if (typeof m.id !== 'string' || !m.id || m.id.length > MAX_ID_LENGTH) return undefined;
      return { type: 'open', generation: m.generation, id: m.id };
    case 'bounds':
      if (!wholeIn(m.depth, GRAPH_DEPTH.min, GRAPH_DEPTH.max)) return undefined;
      if (!wholeIn(m.maxNodes, GRAPH_NODES.min, GRAPH_NODES.max)) return undefined;
      return { type: 'bounds', depth: m.depth, maxNodes: m.maxNodes };
    default:
      return undefined;
  }
}
