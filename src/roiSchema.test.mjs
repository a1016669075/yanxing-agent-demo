import test from "node:test";
import assert from "node:assert/strict";

import { detectSelfIntersection, normalizeRoiDefinition, roiInputPresets } from "./roiSchema.mjs";

test("bbox 输入会被规范化为统一 Polygon ROI 结构", () => {
  const result = normalizeRoiDefinition(roiInputPresets[0].value);

  assert.equal(result.id, "roi-hexi-bbox");
  assert.equal(result.crs, "EPSG:4326");
  assert.equal(result.sourceType, "bbox");
  assert.deepEqual(result.bbox, [86.2, 37.1, 92.8, 40.6]);
  assert.equal(result.geometry.type, "Polygon");
  assert.equal(result.geometry.coordinates[0].length, 5);
  assert.equal(result.vertexCount, 4);
  assert.ok(result.areaSquareKm > 0);
});

test("polygon 输入与 bbox 输入会输出同一套核心字段", () => {
  const polygonResult = normalizeRoiDefinition(roiInputPresets[1].value);
  const bboxResult = normalizeRoiDefinition(roiInputPresets[0].value);

  assert.deepEqual(
    Object.keys(polygonResult).sort(),
    Object.keys(bboxResult).sort()
  );
  assert.equal(polygonResult.sourceType, "polygon");
  assert.equal(polygonResult.validation.selfIntersectionFree, true);
});

test("自交 polygon 会被明确拒绝", () => {
  assert.throws(
    () => normalizeRoiDefinition(roiInputPresets[2].value),
    /polygon 存在自交/
  );
});

test("经纬度越界会报错", () => {
  assert.throws(
    () =>
      normalizeRoiDefinition({
        bbox: [190, 21, 192, 22],
      }),
    /经度超出 EPSG:4326/
  );
});

test("自交检测函数可以给出交叉结果", () => {
  const ring = [
    [113.1, 22.3],
    [115.3, 24.5],
    [114.7, 21.8],
    [112.7, 24.1],
    [113.1, 22.3],
  ];
  const result = detectSelfIntersection(ring);

  assert.equal(result.intersects, true);
  assert.ok(Array.isArray(result.segmentA));
  assert.ok(Array.isArray(result.segmentB));
});
