import test from "node:test";
import assert from "node:assert/strict";

import { buildWildfireCaseManifest } from "./caseManifest.mjs";
import { buildReplayRequest } from "./replayArtifacts.mjs";

test("springs replay request defaults to original bbox and exposes a bounded audit expansion", () => {
  const manifest = buildWildfireCaseManifest();
  const springs = manifest.find((entry) => entry.id === "springs-fire-moreno-valley-apr08-2026");

  assert.ok(springs);

  const defaultRequest = buildReplayRequest(springs, {
    includeLowConfidence: false,
    queryAttempt: "default",
  });
  const auditRequest = buildReplayRequest(springs, {
    includeLowConfidence: false,
    bboxScale: springs.query_policy.raw_count_zero_audit.bbox_scale,
    queryAttempt: "raw_count_zero_bbox_expansion",
  });

  assert.deepEqual(defaultRequest.bbox, springs.aoi);
  assert.equal(defaultRequest.queryAudit.attempt, "default");
  assert.equal(defaultRequest.queryAudit.bbox_scale, 1);
  assert.equal(auditRequest.queryAudit.attempt, "raw_count_zero_bbox_expansion");
  assert.equal(auditRequest.queryAudit.bbox_scale, 1.5);
  assert.ok(auditRequest.bbox[0] < defaultRequest.bbox[0]);
  assert.ok(auditRequest.bbox[1] < defaultRequest.bbox[1]);
  assert.ok(auditRequest.bbox[2] > defaultRequest.bbox[2]);
  assert.ok(auditRequest.bbox[3] > defaultRequest.bbox[3]);
});
