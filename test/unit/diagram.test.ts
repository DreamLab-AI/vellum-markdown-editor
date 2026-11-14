import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderDiagram } from '../../webview/plugins/diagramRender';

import { replaceMermaidCode } from '../../webview/plugins/replaceMermaidCode';

const SOURCES: Record<string, string> = {
  flowchart: 'graph TD\n  A[Start] --> B{Choice}\n  B -->|yes| C[Done]\n  B -->|no| A',
  sequence: 'sequenceDiagram\n  Alice->>Bob: Hello\n  Bob-->>Alice: Hi',
  class: 'classDiagram\n  class Animal {\n    +String name\n    +speak()\n  }\n  Animal <|-- Dog',
  state: 'stateDiagram-v2\n  [*] --> Idle\n  Idle --> Busy: start\n  Busy --> [*]',
  er: 'erDiagram\n  CUSTOMER ||--o{ ORDER : places',
  gantt: 'gantt\n  title Plan\n  dateFormat YYYY-MM-DD\n  section A\n  Task one :a1, 2026-01-01, 3d',
  pie: 'pie title Pets\n  "Dogs" : 3\n  "Cats" : 2',
};

for (const [name, source] of Object.entries(SOURCES)) {
  test(`Pele renders a Mermaid ${name} diagram to SVG`, () => {
    const r = renderDiagram(source);
    assert.equal(r.ok, true, r.ok ? '' : r.message);
    if (r.ok) {
      assert.match(r.svg, /^<svg\b/);
      assert.match(r.svg, /var\(--pele-fg,/, 'themable through CSS variables');
    }
  });
}

test('a syntax error is reported with its line, not thrown', () => {
  const r = renderDiagram('graph TD\n  A -->');
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.line, 2);
    assert.match(r.message, /line 2/);
    assert.ok(r.message.split('\n').length <= 4);
  }
});

test('hostile label text never comes out as markup', () => {
  const r = renderDiagram(
    'graph TD\n  A["<img src=x onerror=alert(1)>"] --> B["<script>alert(2)</script>"]\n  click A "javascript:alert(3)"'
  );
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.ok(!/<script|<img|onerror\s*=|javascript:|<foreignObject|<iframe/i.test(r.svg), r.svg.slice(0, 300));
    // Pele drops tags from label text (as Mermaid does); what is left is plain text.
    assert.match(r.svg, />alert\(2\)</);
  }
});

test('mermaid code nodes become diagram nodes; other code is left alone', () => {
  const tree = {
    type: 'root',
    children: [
      { type: 'code', lang: 'mermaid', value: 'graph TD\n A-->B' },
      { type: 'code', lang: 'js', value: 'x' },
      { type: 'blockquote', children: [{ type: 'code', lang: 'mermaid', value: 'pie\n "a": 1' }] },
    ],
  };
  replaceMermaidCode(tree);
  assert.deepEqual(tree.children[0], { type: 'diagram', value: 'graph TD\n A-->B' });
  assert.equal(tree.children[1].type, 'code');
  assert.equal((tree.children[2] as any).children[0].type, 'diagram');
});
