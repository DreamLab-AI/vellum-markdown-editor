// The text form of a wikilink, shared by the extension host and the editor
// webview. Pure: no VS Code or DOM imports.
//
//   [[Target]]   [[Target#Heading]]   [[Target|Alias]]   ![[Target]] (embed)

export interface WikilinkParts {
  target: string;
  heading: string;
  alias: string;
  embed: boolean;
}

/** One wikilink per match. Group 1: `!` for an embed. Group 2: the inside. */
export const WIKILINK_SOURCE = String.raw`(!?)\[\[([^\[\]\n]+?)\]\]`;

/** Split the inside of `[[...]]` into target, heading and alias. */
export function parseWikilinkInner(inner: string, embed = false): WikilinkParts {
  // In a table cell the pipe is written `\|`.
  const bar = inner.search(/\\?\|/);
  const left = bar === -1 ? inner : inner.slice(0, bar);
  const alias = bar === -1 ? '' : inner.slice(bar).replace(/^\\?\|/, '').trim();
  const hash = left.indexOf('#');
  return {
    target: (hash === -1 ? left : left.slice(0, hash)).trim(),
    heading: hash === -1 ? '' : left.slice(hash + 1).trim(),
    alias,
    embed,
  };
}

/** The canonical text of a wikilink. */
export function formatWikilink(p: WikilinkParts): string {
  return `${p.embed ? '!' : ''}[[${p.target}${p.heading ? `#${p.heading}` : ''}${p.alias ? `|${p.alias}` : ''}]]`;
}

/** What a reader sees for a wikilink. */
export function wikilinkLabel(p: WikilinkParts): string {
  if (p.alias) return p.alias;
  if (p.target && p.heading) return `${p.target} › ${p.heading}`;
  return p.target || p.heading;
}

/** Split text into plain strings and wikilinks, in order. */
export function splitWikilinks(text: string): Array<string | WikilinkParts> {
  const out: Array<string | WikilinkParts> = [];
  const re = new RegExp(WIKILINK_SOURCE, 'g');
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const parts = parseWikilinkInner(m[2], m[1] === '!');
    if (!parts.target && !parts.heading) continue;
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(parts);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}
