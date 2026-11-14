import { test } from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml, inlineScript, newNonce, safeImageExt } from '../../src/security';

test('escapeHtml neutralises every character that can leave a text node or an attribute', () => {
  assert.equal(escapeHtml(`<img src=x onerror="a('b')">`), '&lt;img src=x onerror=&quot;a(&#039;b&#039;)&quot;&gt;');
  assert.equal(escapeHtml('a & b ` c'), 'a &amp; b &#096; c');
  assert.equal(escapeHtml(undefined), '');
});

test('a hostile bookmark URI cannot break out of the data-open attribute', () => {
  const hostile = `file:///x.md')" onmouseover="alert(1)`;
  const html = `<div data-open="${escapeHtml(hostile)}">`;
  assert.equal((html.match(/"/g) || []).length, 2, 'only the two delimiting quotes remain');
  assert.ok(!/\sonmouseover="/.test(html), 'no attribute was injected');
});

test('safeImageExt keeps known image extensions and nothing else', () => {
  for (const ok of ['png', 'JPG', ' webp ', 'svg']) assert.equal(safeImageExt(ok), ok.trim().toLowerCase());
  for (const bad of ['png/../../evil', '../x', 'exe', 'sh', 'html', 'js', '', 'p.ng', undefined, null, 42, {}]) {
    assert.equal(safeImageExt(bad), 'png', JSON.stringify(bad));
  }
});

test('newNonce is long, hex and different each time', () => {
  const a = newNonce();
  assert.match(a, /^[0-9a-f]{36}$/);
  assert.notEqual(a, newNonce());
});

test('inlineScript cannot be closed early by its own body', () => {
  const html = inlineScript('var s = "</script><script>alert(1)</script>";');
  assert.equal((html.match(/<\/script>/gi) || []).length, 1);
  assert.ok(html.startsWith('<script>') && html.endsWith('</script>'));
});
