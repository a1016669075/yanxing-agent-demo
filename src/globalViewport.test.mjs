import test from "node:test";
import assert from "node:assert/strict";

import {
  createGlobalViewportState,
  globalViewportStyle,
  panGlobalViewport,
  worldPointFromViewportPoint,
  zoomGlobalViewport,
} from "./globalViewport.mjs";

test("缩放后光标锚点对应的世界坐标保持不变", () => {
  const initial = createGlobalViewportState();
  const anchor = { x: 0.78, y: 0.24 };
  const before = worldPointFromViewportPoint(anchor, initial);
  const zoomed = zoomGlobalViewport(initial, 3, anchor);
  const after = worldPointFromViewportPoint(anchor, zoomed);

  assert.ok(Math.abs(after.x - before.x) < 0.001);
  assert.ok(Math.abs(after.y - before.y) < 0.001);
});

test("平移会按当前缩放比例移动并限制在全球范围内", () => {
  const zoomed = zoomGlobalViewport(createGlobalViewportState(), 4, { x: 0.5, y: 0.5 });
  const panned = panGlobalViewport(zoomed, { x: 2, y: -2 });

  assert.equal(panned.zoom, 4);
  assert.equal(panned.centerX, 0.125);
  assert.equal(panned.centerY, 0.875);
});

test("视口样式会输出缩放后的图层尺寸和偏移", () => {
  const viewport = createGlobalViewportState({
    zoom: 2,
    centerX: 0.5,
    centerY: 0.5,
  });
  const style = globalViewportStyle(viewport);

  assert.equal(style.widthPercent, 200);
  assert.equal(style.heightPercent, 200);
  assert.equal(style.leftPercent, -50);
  assert.equal(style.topPercent, -50);
});
