import test from "node:test";
import assert from "node:assert/strict";

import { normalizeRoiDefinition } from "./roiSchema.mjs";
import {
  addPolygonVertex,
  beginBboxDraft,
  commitBboxDraft,
  commitPolygonDraft,
  createDrawingState,
  deleteSelectedRoi,
  moveVertex,
  roiToFeature,
  selectRoi,
  setDrawingMode,
} from "./roiDrawing.mjs";

const geobox = [110, 20, 120, 30];

test("bbox 绘制后提交会生成 roi_id，并可转成合法 Feature", () => {
  let state = createDrawingState("bbox");
  state = beginBboxDraft(state, { x: 0.1, y: 0.2 });
  const committed = commitBboxDraft(state, { x: 0.35, y: 0.45 });

  assert.ok(committed.createdRoi);
  assert.equal(committed.createdRoi.id, "ROI-001");
  assert.equal(committed.state.rois.length, 1);

  const feature = roiToFeature(committed.createdRoi, geobox, { mission: "test" });
  const normalized = normalizeRoiDefinition(feature);
  assert.equal(normalized.id, "ROI-001");
  assert.equal(normalized.sourceType, "polygon");
});

test("polygon 绘制后提交会返回 roi_id", () => {
  let state = createDrawingState("bbox");
  state = setDrawingMode(state, "polygon");
  state = addPolygonVertex(state, { x: 0.2, y: 0.2 });
  state = addPolygonVertex(state, { x: 0.5, y: 0.22 });
  state = addPolygonVertex(state, { x: 0.4, y: 0.48 });

  const committed = commitPolygonDraft(state);
  assert.ok(committed.createdRoi);
  assert.equal(committed.createdRoi.id, "ROI-001");
  assert.equal(committed.state.selectedRoiId, "ROI-001");
});

test("选中后拖动顶点可以编辑 ROI", () => {
  let state = createDrawingState("bbox");
  state = beginBboxDraft(state, { x: 0.1, y: 0.2 });
  state = commitBboxDraft(state, { x: 0.35, y: 0.45 }).state;
  state = selectRoi(state, "ROI-001");

  const moved = moveVertex(state, "ROI-001", 0, { x: 0.05, y: 0.18 });
  assert.equal(moved.rois[0].points[0].x, 0.05);
  assert.equal(moved.rois[0].points[0].y, 0.18);
});

test("删除选中 ROI 不会崩溃，并且会清空选中状态", () => {
  let state = createDrawingState("bbox");
  state = beginBboxDraft(state, { x: 0.1, y: 0.2 });
  state = commitBboxDraft(state, { x: 0.35, y: 0.45 }).state;
  state = selectRoi(state, "ROI-001");

  const nextState = deleteSelectedRoi(state);
  assert.equal(nextState.rois.length, 0);
  assert.equal(nextState.selectedRoiId, null);
});
