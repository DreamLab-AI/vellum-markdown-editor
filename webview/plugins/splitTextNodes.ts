// The Markdown-tree half of the wikilink node: pure, so it is unit-tested.
import { splitWikilinks } from '../../src/links/wikilink';

export interface MdNode {
  type: string;
  value?: string;
  children?: MdNode[];
  [key: string]: unknown;
}

/** Split each text node into text and `wikilink` nodes. Links and code are left alone. */
export function splitTextNodes(node: MdNode): void {
  if (!Array.isArray(node.children) || node.type === 'link' || node.type === 'linkReference') return;
  const out: MdNode[] = [];
  for (const child of node.children) {
    if (child.type !== 'text' || typeof child.value !== 'string' || !child.value.includes('[[')) {
      splitTextNodes(child);
      out.push(child);
      continue;
    }
    for (const part of splitWikilinks(child.value)) {
      if (typeof part === 'string') out.push({ type: 'text', value: part });
      else out.push({ type: 'wikilink', ...part });
    }
  }
  node.children = out;
}

