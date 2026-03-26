export const artifactIndexKey = "sat-atmo-agent-artifact-index";

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function createArtifactEntry({ sceneId, dateValue, modelId, featureSummary, outputProduct, versionTag }) {
  return {
    key: `${sceneId}:${dateValue}:${modelId}:${versionTag}`,
    sceneId,
    dateValue,
    modelId,
    outputProduct,
    versionTag,
    featureCount: featureSummary?.featureCount || 0,
    selectedCount: featureSummary?.selectedCount || 0,
    totalAreaKm2: round(featureSummary?.totalAreaKm2 || 0),
    createdAt: new Date().toISOString(),
  };
}

export function upsertArtifactIndex(index = [], entry) {
  const rest = index.filter((item) => item.key !== entry.key);
  return [entry, ...rest].slice(0, 24);
}

export function summarizeArtifactIndex(index = []) {
  return {
    total: index.length,
    models: index.reduce((summary, item) => {
      summary[item.modelId] = (summary[item.modelId] ?? 0) + 1;
      return summary;
    }, {}),
    latest: index[0] || null,
  };
}
