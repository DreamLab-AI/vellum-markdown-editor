// The Markdown-tree half of the diagram node: pure, so it is unit-tested.
export interface MdNode {
  type: string;
  lang?: string | null;
  value?: string;
  children?: MdNode[];
}

/** Replace every ```mermaid code node in the tree with a `diagram` node. */
export function replaceMermaidCode(node: MdNode): void {
  if (!Array.isArray(node.children)) return;
  node.children.forEach((child, i) => {
    if (child.type === 'code' && child.lang === 'mermaid') {
      node.children![i] = { type: 'diagram', value: child.value ?? '' };
    } else {
      replaceMermaidCode(child);
    }
  });
}

