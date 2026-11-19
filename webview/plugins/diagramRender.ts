// Renders Mermaid source with Pele (obsidianmd/pele): MIT, no dependencies,
// synchronous, no eval. Pele colours through CSS custom properties, so the
// diagram follows the VS Code theme through PELE_THEME_VARS.
import { render, PeleError } from 'pele';

export type DiagramResult =
  { ok: true; svg: string; type: string } | { ok: false; message: string; line?: number };

/** Render Mermaid source to an SVG string. Never throws. */
export function renderDiagram(source: string): DiagramResult {
  try {
    const out = render(source);
    return { ok: true, svg: out.svg, type: out.mermaidType };
  } catch (e) {
    if (e instanceof PeleError) {
      // Pele's message carries the line and a caret snippet; keep the first lines.
      const message = String(e.message).split('\n').slice(0, 4).join('\n').trim();
      return { ok: false, message, line: (e as { line?: number }).line };
    }
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

/** Pele variable -> VS Code theme variable, set on the diagram container. */
export const PELE_THEME_VARS: Readonly<Record<string, string>> = Object.freeze({
  '--pele-bg': 'var(--vscode-editor-background)',
  '--pele-fg': 'var(--vscode-editor-foreground)',
  '--pele-muted': 'var(--vscode-descriptionForeground)',
  '--pele-line': 'var(--vscode-editor-foreground)',
  '--pele-surface': 'var(--vscode-editorWidget-background)',
  '--pele-surface-alt': 'var(--vscode-editor-inactiveSelectionBackground)',
  '--pele-border': 'var(--vscode-panel-border)',
  '--pele-accent': 'var(--vscode-textLink-foreground)',
});

const URL_ATTRS = new Set(['href', 'xlink:href', 'src', 'action', 'formaction', 'srcdoc']);
const ACTIVE_ELEMENTS = 'script, foreignObject, iframe, object, embed, base, meta, link';

/** Strip active content from a parsed tree in place. */
function scrub(root: ParentNode): void {
  for (const el of Array.from(root.querySelectorAll(ACTIVE_ELEMENTS))) el.remove();
  const all = Array.from(root.querySelectorAll('*'));
  if (root instanceof Element) all.unshift(root);
  for (const el of all) {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      if (name.startsWith('on')) el.removeAttribute(attr.name);
      else if (
        URL_ATTRS.has(name) &&
        (name === 'srcdoc' || /^\s*(javascript|vbscript|data:text\/html)/i.test(attr.value))
      ) {
        el.removeAttribute(attr.name);
      }
    }
  }
}

/**
 * Defence in depth for markup about to enter the page: parse the SVG, then
 * drop every script and foreignObject element, every event-handler attribute
 * and every javascript: link. Pele strips tags from label text itself and the
 * webview's CSP forbids inline script; this holds if either ever regresses.
 * Returns null when the input is not a well-formed SVG document.
 */
export function sanitiseSvg(svg: string): SVGElement | null {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const root = doc.documentElement;
  if (!root || root.nodeName.toLowerCase() !== 'svg' || doc.querySelector('parsererror'))
    return null;
  scrub(root);
  return document.importNode(root, true) as unknown as SVGElement;
}

/**
 * Raw HTML written in a note, with active content removed: scripts, frames,
 * event handlers and javascript: links. Layout and styling markup is kept.
 * The fragment is parsed inertly in a <template>, so nothing runs or loads
 * before it has been scrubbed.
 */
export function sanitiseHtml(html: string): DocumentFragment {
  const template = document.createElement('template');
  template.innerHTML = html;
  scrub(template.content);
  return template.content;
}
