import test from "node:test";
import assert from "node:assert/strict";

import {
  benchmarkCoverageForTask,
  benchmarkCatalog,
  summarizeBenchmarkCatalog,
} from "./benchmarkCatalog.mjs";

test("benchmark catalog summary reports total entries and task coverage", () => {
  const summary = summarizeBenchmarkCatalog(benchmarkCatalog);

  assert.equal(summary.total, benchmarkCatalog.length);
  assert.ok(summary.taskCount >= 5);
  assert.ok(summary.ready >= 1);
});

test("wildfire benchmark coverage exposes at least one ready benchmark", () => {
  const coverage = benchmarkCoverageForTask("wildfire", benchmarkCatalog);

  assert.equal(coverage.taskId, "wildfire");
  assert.ok(coverage.total >= 1);
  assert.ok(coverage.ready >= 1);
  assert.ok(coverage.labels.includes("NASA FIRMS VIIRS hotspots"));
});
