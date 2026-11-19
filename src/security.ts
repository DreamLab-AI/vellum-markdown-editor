// Small pure helpers for everything that crosses a trust boundary: markup
// built from workspace files, and values sent up from a webview.

/** Escape text for an HTML text node or a double- or single-quoted attribute. */
export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
    .replace(/`/g, '&#096;');
}

const IMAGE_EXTENSIONS = new Set([
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'bmp',
  'avif',
  'svg',
  'ico',
  'tif',
  'tiff',
]);

/**
 * The file extension for a pasted or dropped image. The value arrives from
 * the webview, so anything that is not a known image extension becomes `png`
 * (never a path segment, a dot or a script extension).
 */
export function safeImageExt(ext: unknown): string {
  const e = typeof ext === 'string' ? ext.trim().toLowerCase() : '';
  return IMAGE_EXTENSIONS.has(e) ? e : 'png';
}

/** A fresh nonce for a Content-Security-Policy script-src. */
export function newNonce(): string {
  const bytes = new Uint8Array(18);
  globalThis.crypto.getRandomValues(bytes);
  let s = '';
  for (const b of bytes) s += b.toString(16).padStart(2, '0');
  return s;
}

/** Inline a script body into an HTML document without letting it close the tag. */
export function inlineScript(body: string): string {
  return `<script>${body.replace(/<\/(script)/gi, '<\\/$1')}</script>`;
}
