import test from 'node:test';
import assert from 'node:assert/strict';

import { starPlacementFor } from '../js/antiquarium/experiences/floating-archive/constellation.js';
import { createSharedGeometry } from '../js/antiquarium/experiences/floating-archive/memory-star.js';

const positions = Array.from({ length: 12 }, (_, index) => starPlacementFor(index, 12));

const maxAbsX = Math.max(...positions.map((entry) => Math.abs(entry.position.x)));
const maxAbsY = Math.max(...positions.map((entry) => Math.abs(entry.position.y)));
const maxAbsZ = Math.max(...positions.map((entry) => Math.abs(entry.position.z)));

test('artworks are clustered around the center axis', () => {
  assert.ok(maxAbsX < 12, `x spread should stay near center, got ${maxAbsX}`);
  assert.ok(maxAbsY < 6, `y spread should stay close to the centerline, got ${maxAbsY}`);
  assert.ok(maxAbsZ < 12, `z spread should stay compact, got ${maxAbsZ}`);
});

test('artwork tokens use a multi-face geometry instead of a single-sided circle', () => {
  const { starGeometry } = createSharedGeometry();
  assert.equal(starGeometry.type, 'BoxGeometry');
});
