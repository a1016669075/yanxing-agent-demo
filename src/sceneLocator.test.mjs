import test from "node:test";
import assert from "node:assert/strict";

import { buildSceneLocatorSnapshot } from "./sceneLocator.mjs";

test("scene locator reuses focus selection and converts it into a world overlay rectangle", () => {
  const snapshot = buildSceneLocatorSnapshot(
    {
      title: "珠三角污染任务",
      focusSelection: {
        bbox: [112, 21, 116, 24],
        label: "珠三角自选区",
        scaleLabel: "局地尺度",
      },
    },
    {
      src: "https://example.test/world.jpg",
      sourceLabel: "VIIRS NOAA-21 真彩色",
    }
  );

  assert.equal(snapshot.label, "珠三角自选区");
  assert.equal(snapshot.scaleLabel, "局地尺度");
  assert.equal(snapshot.overviewSrc, "https://example.test/world.jpg");
  assert.ok(snapshot.rect.left >= 0 && snapshot.rect.left <= 100);
  assert.ok(snapshot.rect.width > 0 && snapshot.rect.width <= 100);
});

test("scene locator falls back to imagery bbox when no custom global selection is active", () => {
  const snapshot = buildSceneLocatorSnapshot({
    title: "河西走廊沙尘任务",
    imageryProfile: {
      bbox: [90, 36, 108, 44],
      label: "河西走廊区域",
    },
  });

  assert.equal(snapshot.label, "河西走廊区域");
  assert.match(snapshot.spanLabel, /°/);
  assert.equal(typeof snapshot.centerLabel, "string");
});
