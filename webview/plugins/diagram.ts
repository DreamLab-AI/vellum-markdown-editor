// Diagram node for fenced ```mermaid blocks.
//
// A local port of the schema, remark transform, input rule and command from
// @milkdown/plugin-diagram 7.7.0 (MIT, © Mirone), with the Mermaid dependency
// removed: that package imports and initialises Mermaid just to declare a
// node. Rendering lives in customViews.ts and uses Pele. Mermaid stays the
// source syntax, so documents are unchanged on disk.
import { setBlockType } from '@milkdown/prose/commands';
import { InputRule } from '@milkdown/prose/inputrules';
import { $command, $inputRule, $nodeSchema, $remark } from '@milkdown/utils';
import { MdNode, replaceMermaidCode } from './replaceMermaidCode';

const id = 'diagram';

let counter = 0;
const newId = () => `d${Date.now().toString(36)}${(counter++).toString(36)}`;
const idOf = (node?: { attrs?: { identity?: string } }) => node?.attrs?.identity || newId();

const remarkDiagram = $remark('remarkDiagram', () => () => (tree: unknown) => {
  replaceMermaidCode(tree as MdNode);
});

export const diagramSchema = $nodeSchema(id, () => ({
  content: 'text*',
  group: 'block',
  marks: '',
  defining: true,
  atom: true,
  isolating: true,
  attrs: {
    value: { default: '' },
    identity: { default: '' },
  },
  parseDOM: [
    {
      tag: `div[data-type="${id}"]`,
      preserveWhitespace: 'full' as const,
      getAttrs: (dom) => {
        if (!(dom instanceof HTMLElement)) return false;
        return { value: dom.dataset.value, identity: dom.dataset.id };
      },
    },
  ],
  toDOM: (node) => {
    const dom = document.createElement('div');
    dom.dataset.type = id;
    dom.dataset.id = idOf(node);
    dom.dataset.value = node.attrs.value;
    dom.textContent = node.attrs.value;
    return dom;
  },
  parseMarkdown: {
    match: ({ type }) => type === id,
    runner: (state, node, type) => {
      state.addNode(type, { value: node.value as string, identity: newId() });
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === id,
    runner: (state, node) => {
      state.addNode('code', undefined, node.attrs.value || '', { lang: 'mermaid' });
    },
  },
}));

const insertDiagramInputRule = $inputRule(
  (ctx) =>
    new InputRule(/^```mermaid$/, (state, _match, start, end) => {
      const nodeType = diagramSchema.type(ctx);
      const $start = state.doc.resolve(start);
      if (!$start.node(-1).canReplaceWith($start.index(-1), $start.indexAfter(-1), nodeType)) return null;
      return state.tr.delete(start, end).setBlockType(start, start, nodeType, { identity: newId() });
    })
);

export const insertDiagramCommand = $command(
  'InsertDiagramCommand',
  (ctx) => () => setBlockType(diagramSchema.type(ctx), { identity: newId() })
);

export const diagram = [remarkDiagram, diagramSchema, insertDiagramCommand, insertDiagramInputRule].flat();
