function round(value, digits = 4) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function scoreStaticSourceSuspicion(evidence = {}, { staticSources = [] } = {}) {
  const sources = Array.isArray(staticSources) ? staticSources : [];
  const providedPenalty =
    Number(evidence?.staticSourcePenalty ?? evidence?.overlapWithStaticThermalAnomaly ?? evidence?.likelyNonVegetationHeatSource) || 0;
  const matchedStaticSources = sources.filter((item) => item?.sensor === evidence?.sensor && item?.id === evidence?.id).length;
  return round(Math.min(1, providedPenalty + matchedStaticSources * 0.15), 4);
}

export function annotatePersistentHotspots(evidenceList = [], options = {}) {
  return (Array.isArray(evidenceList) ? evidenceList : []).map((evidence) => {
    const staticSourceSuspicion = scoreStaticSourceSuspicion(evidence, options);
    return {
      ...evidence,
      staticSourceSuspicion,
      likelyNonVegetationHeatSource: staticSourceSuspicion >= 0.35,
    };
  });
}
