// The note graph's layout as webview/graph/main.ts builds it: the real vowl-wasm
// module (namespace import, so `version` reaches vowlEngine), adapted by
// ontomark-graph's vowlEngine and driven by createLayout with
// RECOMMENDED_LAYOUT_PARAMS. The panel compiles the same bytes from dist/graph.js;
// here they are read from the installed package.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import * as vowl from '@dreamlab-ai/vowl-wasm';
import { createLayout, RECOMMENDED_LAYOUT_PARAMS, vowlEngine } from '@dreamlab-ai/ontomark-graph/layout';
import type { LayoutParams } from '@dreamlab-ai/ontomark-graph/layout';
import type { GraphData } from '@dreamlab-ai/ontomark-graph';

vowl.initSync({ module: readFileSync(createRequire(import.meta.url).resolve('@dreamlab-ai/vowl-wasm/vowl_wasm_bg.wasm')) });

const KEYS = ['collideRadius', 'collideStrength', 'collideIterations', 'componentGravity'];

/** A hub with 40 linked notes and 6 notes with no links: crowded without collision. */
const crowd: GraphData = {
  nodes: [{ id: 'hub', label: 'hub' }, ...Array.from({ length: 46 }, (_, i) => ({ id: `n${i}`, label: `n${i}` }))],
  edges: Array.from({ length: 40 }, (_, i) => ({ source: 'hub', target: `n${i}` })),
};

/** Run a layout to rest synchronously; return the closest distance between two nodes and any ignored keys. */
function settle(params?: LayoutParams) {
  const queue: Array<() => void> = [];
  const ignored: string[] = [];
  let xy = new Float32Array(0);
  let settled = false;
  const layout = createLayout(vowlEngine(vowl), {
    ...(params ? { params } : {}),
    onIgnoredParams: (keys) => ignored.push(...keys),
    onPositions: (p) => { xy = p.slice(); },
    onSettled: () => { settled = true; },
    onError: (error) => { throw error; },
    schedule: (callback) => queue.push(callback),
    cancel: () => {},
    frameBudgetMs: 1e9,
    maxTicksPerFrame: 1e6,
  });
  layout.setGraph(crowd);
  for (let i = 0; queue.length && i < 10_000; i++) queue.shift()!();
  layout.destroy();
  assert.ok(settled, 'the layout reached rest');
  let min = Infinity;
  for (let a = 0; a < crowd.nodes.length; a++)
    for (let b = a + 1; b < crowd.nodes.length; b++) min = Math.min(min, Math.hypot(xy[2 * a] - xy[2 * b], xy[2 * a + 1] - xy[2 * b + 1]));
  return { min, ignored };
}

test('graph layout: vowl-wasm 0.4.0 supports every recommended parameter', () => {
  assert.match(vowl.version(), /^0\.4\./);
  const engine = vowlEngine(vowl);
  for (const key of KEYS) assert.ok(engine.supportedParams.includes(key), key);
  assert.deepEqual(Object.keys(RECOMMENDED_LAYOUT_PARAMS).sort(), [...KEYS].sort());
  engine.dispose?.();
});

test('graph layout: the recommended parameters separate crowded notes, and none is ignored', () => {
  const without = settle();
  const withParams = settle(RECOMMENDED_LAYOUT_PARAMS);
  assert.deepEqual(withParams.ignored, []);
  assert.ok(withParams.min >= RECOMMENDED_LAYOUT_PARAMS.collideRadius, `closest pair ${withParams.min}`);
  assert.ok(withParams.min > without.min, `${withParams.min} > ${without.min}`);
});
