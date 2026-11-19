// Wikilinks as a real inline node, so `[[Note]]` survives a save byte for
// byte (as plain text the serialiser would escape the brackets) and renders
// as a link that opens, or creates, the note.
import { InputRule } from '@milkdown/prose/inputrules';
import { $inputRule, $nodeSchema, $remark, $view } from '@milkdown/utils';
import {
  formatWikilink,
  splitWikilinks,
  wikilinkLabel,
  WikilinkParts,
} from '../../src/links/wikilink';
import { MdNode, splitTextNodes } from './splitTextNodes';

const id = 'wikilink';

const remarkWikilink = $remark('remarkWikilink', () => () => (tree: unknown) => {
  splitTextNodes(tree as MdNode);
});

const attrsOf = (n: { attrs: Record<string, unknown> }): WikilinkParts => ({
  target: String(n.attrs.target ?? ''),
  heading: String(n.attrs.heading ?? ''),
  alias: String(n.attrs.alias ?? ''),
  embed: n.attrs.embed === true,
});

export const wikilinkSchema = $nodeSchema(id, () => ({
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  attrs: {
    target: { default: '' },
    heading: { default: '' },
    alias: { default: '' },
    embed: { default: false },
  },
  parseDOM: [
    {
      tag: `a[data-type="${id}"]`,
      getAttrs: (dom) => {
        if (!(dom instanceof HTMLElement)) return false;
        return {
          target: dom.dataset.target ?? '',
          heading: dom.dataset.heading ?? '',
          alias: dom.dataset.alias ?? '',
          embed: dom.dataset.embed === 'true',
        };
      },
    },
  ],
  toDOM: (node) => {
    const p = attrsOf(node);
    return [
      'a',
      {
        'data-type': id,
        'data-target': p.target,
        'data-heading': p.heading,
        'data-alias': p.alias,
        'data-embed': String(p.embed),
        class: 'wikilink',
      },
      wikilinkLabel(p),
    ];
  },
  parseMarkdown: {
    match: ({ type }) => type === id,
    runner: (state, node, type) => {
      state.addNode(type, {
        target: node.target as string,
        heading: node.heading as string,
        alias: node.alias as string,
        embed: node.embed === true,
      });
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === id,
    // An `html` node is written out verbatim: no bracket escaping.
    runner: (state, node) => {
      state.addNode('html', undefined, formatWikilink(attrsOf(node)));
    },
  },
}));

// Targets in this note that point at no existing note, sent by the host.
let unresolved = new Set<string>();
const UPDATE = 'vellum-link-state';

export function setUnresolvedTargets(targets: unknown): void {
  unresolved = new Set(
    Array.isArray(targets) ? targets.filter((t): t is string => typeof t === 'string') : [],
  );
  window.dispatchEvent(new Event(UPDATE));
}

const wikilinkView = $view(wikilinkSchema.node, () => (node) => {
  const p = attrsOf(node);
  const dom = document.createElement('a');
  dom.className = 'wikilink';
  dom.dataset.type = id;
  dom.dataset.target = p.target;
  dom.dataset.heading = p.heading;
  dom.dataset.alias = p.alias;
  dom.dataset.embed = String(p.embed);
  dom.textContent = wikilinkLabel(p);
  dom.title = formatWikilink(p);
  dom.setAttribute('role', 'link');

  const paint = () => dom.classList.toggle('unresolved', !!p.target && unresolved.has(p.target));
  paint();
  window.addEventListener(UPDATE, paint);
  // Clicks are handled by the editor's single link interceptor (ui/events.ts).

  return {
    dom,
    ignoreMutation: () => true,
    destroy: () => window.removeEventListener(UPDATE, paint),
  };
});

/** Typing the closing `]]` turns the text into a wikilink. */
const wikilinkInputRule = $inputRule(
  (ctx) =>
    new InputRule(/(!?)\[\[([^\[\]\n]+)\]\]$/, (state, match, start, end) => {
      const [part] = splitWikilinks(match[0]);
      if (!part || typeof part === 'string') return null;
      return state.tr.replaceWith(start, end, wikilinkSchema.type(ctx).create(part));
    }),
);

export const wikilink = [remarkWikilink, wikilinkSchema, wikilinkView, wikilinkInputRule].flat();
