import { $view } from '@milkdown/utils';
import { htmlSchema } from '@milkdown/preset-commonmark';
import { diagramSchema } from './diagram';
import { PELE_THEME_VARS, renderDiagram, sanitiseHtml, sanitiseSvg } from './diagramRender';

export const htmlView = $view(htmlSchema.node, () => (node, view, getPos) => {
  const container = document.createElement('span');
  container.className = 'custom-html-block';
  container.style.display = 'inline-block';
  container.style.width = '100%';
  container.style.margin = '8px 0';
  container.replaceChildren(sanitiseHtml(node.attrs.value));

  return {
    dom: container,
    update: (updatedNode) => {
      if (updatedNode.type.name !== 'html') return false;
      container.replaceChildren(sanitiseHtml(updatedNode.attrs.value));
      return true;
    },
    stopEvent: (event) => {
      // Allow native interaction (like clicking summary to expand details)
      return event.type === 'mousedown' || event.type === 'click';
    },
    ignoreMutation: () => {
      // Prevent ProseMirror from undoing the 'open' attribute added to <details> by the browser
      return true;
    }
  };
});

export const mermaidView = $view(diagramSchema.node, () => (node, view, getPos) => {
  const container = document.createElement('div');
  container.className = 'mermaid-container';
  container.style.border = '1px dashed var(--vscode-panel-border)';
  container.style.padding = '8px';
  container.style.margin = '8px 0';

  const preview = document.createElement('div');
  preview.style.textAlign = 'center';
  preview.style.cursor = 'pointer';
  preview.title = 'Double-click to edit Mermaid code';

  const textarea = document.createElement('textarea');
  textarea.style.width = '100%';
  textarea.style.boxSizing = 'border-box';
  textarea.style.fontFamily = 'monospace';
  textarea.style.minHeight = '100px';
  textarea.style.backgroundColor = 'var(--vscode-input-background)';
  textarea.style.color = 'var(--vscode-input-foreground)';
  textarea.style.display = 'none';
  textarea.value = node.attrs.value;

  container.appendChild(preview);
  container.appendChild(textarea);

  let isEditing = false;

  for (const [name, value] of Object.entries(PELE_THEME_VARS)) container.style.setProperty(name, value);

  const showMessage = (text: string, colourVar: string, italic = false) => {
    const el = document.createElement(italic ? 'em' : 'div');
    el.style.color = `var(${colourVar})`;
    el.style.whiteSpace = 'pre-wrap';
    el.style.textAlign = 'left';
    el.style.fontFamily = 'var(--vscode-editor-font-family, monospace)';
    el.textContent = text;
    preview.replaceChildren(el);
  };

  // Pele renders synchronously. The SVG is parsed and sanitised, then attached
  // as nodes: no markup string is ever assigned to innerHTML.
  const render = () => {
    const source = node.attrs.value;
    if (!source.trim()) {
      showMessage('Empty Mermaid diagram', '--vscode-descriptionForeground', true);
      return;
    }
    const result = renderDiagram(source);
    if (!result.ok) {
      showMessage(`Mermaid syntax error — ${result.message}`, '--vscode-errorForeground');
      return;
    }
    const svg = sanitiseSvg(result.svg);
    if (!svg) {
      showMessage('The diagram renderer returned malformed SVG', '--vscode-errorForeground');
      return;
    }
    preview.replaceChildren(svg);
  };
  render();

  preview.addEventListener('dblclick', (e) => {
    e.preventDefault();
    isEditing = true;
    preview.style.display = 'none';
    textarea.style.display = 'block';
    textarea.focus();
  });

  textarea.addEventListener('blur', () => {
    isEditing = false;
    preview.style.display = 'block';
    textarea.style.display = 'none';
    const newCode = textarea.value;
    const pos = typeof getPos === 'function' ? getPos() : undefined;
    if (pos !== undefined) {
      view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, value: newCode }));
    }
  });

  return {
    dom: container,
    update: (updatedNode) => {
      if (updatedNode.type.name !== 'diagram') return false;
      if (updatedNode.attrs.value !== node.attrs.value) {
        node = updatedNode;
        textarea.value = node.attrs.value;
        if (!isEditing) {
          render();
        }
      }
      return true;
    },
    ignoreMutation: () => true,
  };
});
