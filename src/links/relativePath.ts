/**
 * Pure helpers for turning percent-encoded workspace URI paths into
 * Markdown link text. No vscode import: unit-testable under plain node.
 */

function encodeSegment(segment: string): string {
  if (segment === '..') return segment;
  try {
    // URI paths arrive percent-encoded: decode first, so a name with a
    // space or a non-ASCII letter is encoded exactly once, never twice.
    return encodeURIComponent(decodeURIComponent(segment));
  } catch {
    // Malformed percent sequence: encode the raw segment as-is.
    return encodeURIComponent(segment);
  }
}

export function getRelativePath(fromPath: string, toPath: string): string {
  const fromParts = fromPath.split('/').filter(Boolean);
  const toParts = toPath.split('/').filter(Boolean);
  fromParts.pop(); // Remove the filename from 'fromPath'
  let commonIndex = 0;
  while (
    commonIndex < fromParts.length &&
    commonIndex < toParts.length &&
    fromParts[commonIndex] === toParts[commonIndex]
  ) {
    commonIndex++;
  }
  const upCount = fromParts.length - commonIndex;
  const relParts = Array(upCount).fill('..').concat(toParts.slice(commonIndex));
  return relParts.join('/');
}

/**
 * A relative link path between two percent-encoded workspace URI paths,
 * with every segment encoded exactly once.
 */
export function relativeLinkPath(fromUriPath: string, toUriPath: string): string {
  return getRelativePath(fromUriPath, toUriPath)
    .split('/')
    .map(encodeSegment)
    .join('/');
}

/**
 * The display file name from a percent-encoded URI path, decoded once.
 */
export function fileNameFromUriPath(uriPath: string): string {
  const fileName = uriPath.split('/').pop() || 'untitled';
  try {
    return decodeURIComponent(fileName);
  } catch {
    return fileName;
  }
}
