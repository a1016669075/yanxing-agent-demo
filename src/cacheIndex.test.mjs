import test from "node:test";
import assert from "node:assert/strict";

import { createArtifactEntry, summarizeArtifactIndex, upsertArtifactIndex } from "./cacheIndex.mjs";

test("缓存条目会生成稳定 key", () => {
  const entry = createArtifactEntry({
    sceneId: "urban-plume",
    dateValue: "2026-03-24",
    modelId: "official-aod-connected-components",
    outputProduct: "anomaly-heatmap",
    versionTag: "v1",
    featureSummary: { featureCount: 3, selectedCount: 2, totalAreaKm2: 18.6 },
  });

  assert.equal(entry.key, "urban-plume:2026-03-24:official-aod-connected-components:v1");
});

test("相同 key 会被 upsert 覆盖", () => {
  const base = createArtifactEntry({
    sceneId: "urban-plume",
    dateValue: "2026-03-24",
    modelId: "official-aod-connected-components",
    outputProduct: "anomaly-heatmap",
    versionTag: "v1",
    featureSummary: { featureCount: 3, selectedCount: 2, totalAreaKm2: 18.6 },
  });
  const next = { ...base, featureCount: 4 };
  const index = upsertArtifactIndex([base], next);

  assert.equal(index.length, 1);
  assert.equal(index[0].featureCount, 4);
});

test("缓存摘要会返回总量和最新条目", () => {
  const entry = createArtifactEntry({
    sceneId: "urban-plume",
    dateValue: "2026-03-24",
    modelId: "official-aod-connected-components",
    outputProduct: "anomaly-heatmap",
    versionTag: "v1",
    featureSummary: { featureCount: 3, selectedCount: 2, totalAreaKm2: 18.6 },
  });
  const summary = summarizeArtifactIndex([entry]);

  assert.equal(summary.total, 1);
  assert.equal(summary.latest.key, entry.key);
});
