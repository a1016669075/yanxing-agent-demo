import test from "node:test";
import assert from "node:assert/strict";

import {
  buildWildfireCaseManifest,
  defaultWildfireCaseManifest,
  wildfireSemanticLabels,
  wildfireCaseTypes,
  wildfireTimeSemantics,
} from "./caseManifest.mjs";

test("default wildfire case manifest exposes evaluation-contract semantics", () => {
  const manifest = buildWildfireCaseManifest(defaultWildfireCaseManifest);

  assert.ok(manifest.filter((entry) => entry.case_type === "AF_positive").length >= 4);
  assert.ok(manifest.filter((entry) => entry.case_type === "empty").length >= 2);
  assert.ok(manifest.filter((entry) => entry.case_type === "static_trap").length >= 1);
  assert.ok(manifest.every((entry) => wildfireCaseTypes.includes(entry.case_type)));
  assert.ok(manifest.every((entry) => wildfireTimeSemantics.includes(entry.time_semantics)));
  assert.ok(manifest.every((entry) => wildfireSemanticLabels.includes(entry.case_semantics)));
  assert.ok(manifest.every((entry) => Array.isArray(entry.aoi) && entry.aoi.length === 4));
  assert.ok(manifest.every((entry) => typeof entry.anchorUtc === "string" && entry.anchorUtc.includes("T")));
  assert.ok(manifest.every((entry) => Array.isArray(entry.sensor_priority) && entry.sensor_priority.length >= 1));
  assert.ok(manifest.every((entry) => typeof entry.primary_eval_metric === "string" && entry.primary_eval_metric));
  assert.ok(
    manifest.every(
      (entry) =>
        entry.expected_outcome &&
        typeof entry.expected_outcome === "object" &&
        typeof entry.expected_outcome.raw_points === "string"
    )
  );
});

test("ambiguous news positives do not get auto-promoted to AF-positive gold scoring", () => {
  const manifest = buildWildfireCaseManifest(defaultWildfireCaseManifest);
  const ambiguousPositiveCases = manifest.filter(
    (entry) => entry.case_type === "AF_positive" && entry.time_semantics === "ambiguous_news"
  );

  assert.ok(ambiguousPositiveCases.length >= 1);
  assert.ok(ambiguousPositiveCases.every((entry) => entry.expectedPositive === null));
  assert.ok(ambiguousPositiveCases.every((entry) => entry.expected_outcome.scoring_role === "canary_non_gold"));
});

test("current live case set keeps reviewed AF recall empty and marks primary canaries explicitly", () => {
  const manifest = buildWildfireCaseManifest(defaultWildfireCaseManifest);
  const springs = manifest.find((entry) => entry.id === "springs-fire-moreno-valley-apr08-2026");
  const primaryCanaries = manifest.filter((entry) => entry.counts_for_af_canary_hit_rate);
  const reviewedGold = manifest.filter((entry) => entry.counts_for_reviewed_af_recall);

  assert.ok(springs);
  assert.equal(springs.case_semantics, "AF_canary");
  assert.equal(springs.query_policy?.default_bbox_scale, 1);
  assert.equal(springs.query_policy?.raw_count_zero_audit?.bbox_scale, 1.5);
  assert.equal(springs.query_policy?.raw_count_zero_audit?.max_attempts, 1);
  assert.equal(springs.query_policy?.raw_count_zero_audit?.keep_original_anchor, true);
  assert.deepEqual(
    primaryCanaries.map((entry) => entry.id).sort(),
    [
      "crown-fire-acton-apr03-2026",
      "indochina-hotspot-apr03-2026",
      "springs-fire-moreno-valley-apr08-2026",
    ]
  );
  assert.equal(reviewedGold.length, 0);
});
