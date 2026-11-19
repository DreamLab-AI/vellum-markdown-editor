import test from 'node:test';
import assert from 'node:assert/strict';
import { fileNameFromUriPath, relativeLinkPath } from '../../src/links/relativePath';

test('relativeLinkPath keeps plain sibling paths unchanged', () => {
  assert.equal(relativeLinkPath('/ws/notes/a.md', '/ws/assets/shot.png'), '../assets/shot.png');
});

test('relativeLinkPath does not double-encode a name with a space', () => {
  assert.equal(relativeLinkPath('/ws/notes/a.md', '/ws/assets/my%20shot.png'), '../assets/my%20shot.png');
});

test('relativeLinkPath round-trips a non-ASCII name exactly once-encoded', () => {
  assert.equal(relativeLinkPath('/ws/notes/a.md', '/ws/img/%E1%BA%A3nh.png'), '../img/%E1%BA%A3nh.png');
});

test('relativeLinkPath survives a malformed percent sequence', () => {
  assert.equal(relativeLinkPath('/ws/notes/a.md', '/ws/a%zz.png'), '../a%25zz.png');
});

test('fileNameFromUriPath decodes once and falls back on malformed input', () => {
  assert.equal(fileNameFromUriPath('/ws/assets/my%20shot.png'), 'my shot.png');
  assert.equal(fileNameFromUriPath('/ws/a%zz.png'), 'a%zz.png');
  assert.equal(fileNameFromUriPath('/'), 'untitled');
});
