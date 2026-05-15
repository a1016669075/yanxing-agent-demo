import { executeEvidenceAction, evidenceActionRegistry } from "./evidenceActions.mjs";
import { compactGeoMemory, createGeoMemory, normalizeGeoMemory, writeGeoMemory } from "./geoMemory.mjs";
import { getEvidencePlannerPolicy } from "./evidencePolicies.mjs";
import {
  buildProvenance,
  createContextAtom,
  createEvidencePathStep,
  createGeoState,
} from "./evidenceTypes.mjs";

function round(value, digits = 3) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function bboxArea(bbox = null) {
  if (!Array.isArray(bbox) || bbox.length !== 4) {
    return 0;
  }
  return Math.max(0, bbox[2] - bbox[0]) * Math.max(0, bbox[3] - bbox[1]);
}

function centerOfBbox(bbox = null) {
  if (!Array.isArray(bbox) || bbox.length !== 4) {
    return null;
  }
  return {
    lon: (bbox[0] + bbox[2]) / 2,
    lat: (bbox[1] + bbox[3]) / 2,
  };
}

function currentAoi(scenario = {}) {
  return scenario?.focusSelection?.bbox || scenario?.imageryProfile?.bbox || null;
}

function budgetModeFromOptions(options = {}) {
  if (options.powerMode === "constrained" || options.budgetMin <= 5) {
    return "tight";
  }
  if (options.powerMode === "burst" || options.budgetMin >= 8) {
    return "expanded";
  }
  return "balanced";
}

function baseCostForAction(actionId) {
  return {
    choose_visual_source: { estLatencyMs: 120, estBytes: 12000, estCompute: 0.04 },
    fetch_cloud_guidance: { estLatencyMs: 180, estBytes: 18000, estCompute: 0.08 },
    build_valid_region: { estLatencyMs: 220, estBytes: 16000, estCompute: 0.18 },
    request_highres_support: { estLatencyMs: 420, estBytes: 38000, estCompute: 0.12 },
    uncertainty_check: { estLatencyMs: 80, estBytes: 4000, estCompute: 0.04 },
    package_result: { estLatencyMs: 60, estBytes: 6000, estCompute: 0.02 },
    fetch_viirs_active_fire: { estLatencyMs: 160, estBytes: 12000, estCompute: 0.08 },
    fetch_static_thermal_anomaly_mask: { estLatencyMs: 110, estBytes: 6000, estCompute: 0.02 },
    temporal_persistence_check: { estLatencyMs: 150, estBytes: 8000, estCompute: 0.06 },
    cluster_hotspots: { estLatencyMs: 260, estBytes: 10000, estCompute: 0.22 },
    local_burned_area_refine: { estLatencyMs: 360, estBytes: 26000, estCompute: 0.2 },
    fetch_land_water_mask: { estLatencyMs: 140, estBytes: 8000, estCompute: 0.08 },
    fetch_dust_support_priors: { estLatencyMs: 160, estBytes: 9000, estCompute: 0.08 },
    score_dust_candidates: { estLatencyMs: 280, estBytes: 12000, estCompute: 0.24 },
    reject_water_like_candidates: { estLatencyMs: 200, estBytes: 7000, estCompute: 0.14 },
    temporal_continuation_check: { estLatencyMs: 150, estBytes: 8000, estCompute: 0.06 },
    dust_window_fallback: { estLatencyMs: 240, estBytes: 9000, estCompute: 0.18 },
  }[actionId] || { estLatencyMs: 160, estBytes: 10000, estCompute: 0.1 };
}

function contextEmbeddingForScenario(scenario = {}, actionId = "") {
  const validPct = Number(scenario?.analysis?.validPixelRatio) || 0;
  const cloudPct = Number(scenario?.cloudCover) || 0;
  const supportPct = Number(scenario?.analysis?.dustSupport?.supportRatio) || 0;
  const screenedPct = Number(scenario?.analysis?.dustScreening?.screenedRatio) || 0;
  const alignment = Number(scenario?.analysis?.alignment?.score) || 0;
  const resolutionM =
    actionId === "fetch_viirs_active_fire"
      ? 375
      : actionId === "score_dust_candidates"
        ? 3000
        : actionId === "request_highres_support"
          ? 10
          : 1000;

  return [
    round(validPct, 4),
    round(cloudPct, 4),
    round(Number(scenario?.radiometricQuality) || 0, 4),
    round(supportPct, 4),
    round(screenedPct, 4),
    round(alignment, 4),
    round(resolutionM / 5000, 4),
  ];
}

function actionSensorProduct(actionId, scenario = {}) {
  const imageryLabel = scenario?.imagery?.sourceLabel || "";
  const analysisLabel = scenario?.analysis?.sourceLabel || "";
  switch (actionId) {
    case "choose_visual_source":
      return { sensor: scenario?.sensor || "mixed", product: imageryLabel || "visual-source", resolutionM: 1000 };
    case "fetch_cloud_guidance":
    case "build_valid_region":
      return { sensor: scenario?.analysis?.sourceLabel || "cloud-guidance", product: "valid-region", resolutionM: 1000 };
    case "fetch_viirs_active_fire":
      return { sensor: "VIIRS SNPP", product: analysisLabel || "thermal-anomalies-375m", resolutionM: 375 };
    case "fetch_static_thermal_anomaly_mask":
      return { sensor: "Static prior", product: "thermal-anomaly-mask", resolutionM: 1000 };
    case "request_highres_support":
      return { sensor: "Sentinel-2", product: "supplemental-preview", resolutionM: 10 };
    case "fetch_land_water_mask":
      return { sensor: "MODIS Terra", product: "land-water-mask", resolutionM: 500 };
    case "fetch_dust_support_priors":
      return { sensor: "VIIRS/AIRS", product: "dust-support-priors", resolutionM: 1000 };
    default:
      return { sensor: scenario?.sensor || "mixed", product: actionId, resolutionM: 1000 };
  }
}

function buildAssetRefsForAction(actionId, scenario = {}) {
  const refs = [];
  if (scenario?.imagery?.src && ["choose_visual_source", "request_highres_support"].includes(actionId)) {
    refs.push({ id: "imagery-src", url: scenario.imagery.src, bytes: 24000 });
  }
  if (scenario?.imagery?.supplementalPreview?.previewUrl && actionId === "request_highres_support") {
    refs.push({ id: "supplemental-preview", url: scenario.imagery.supplementalPreview.previewUrl, bytes: 32000 });
  }
  if (scenario?.analysis?.legendUrl && ["fetch_viirs_active_fire", "score_dust_candidates"].includes(actionId)) {
    refs.push({ id: "analysis-legend", url: scenario.analysis.legendUrl, bytes: 6000 });
  }
  return refs;
}

function buildCandidateAtom(actionId, scenario, policy) {
  const config = evidenceActionRegistry[actionId];
  const aoi = currentAoi(scenario);
  const observationIso = scenario?.observation?.iso || null;
  const { sensor, product, resolutionM } = actionSensorProduct(actionId, scenario);
  const quality = {
    cloudPct: Number(scenario?.cloudCover) || 0,
    validPct: Number(scenario?.analysis?.validPixelRatio) || 0,
    missingPct: 1 - (Number(scenario?.analysis?.validPixelRatio) || 0),
  };
  const priors = {
    taskId: scenario?.type || "unknown",
    supportRatio: Number(scenario?.analysis?.dustSupport?.supportRatio) || 0,
    screenedRatio: Number(scenario?.analysis?.dustScreening?.screenedRatio) || 0,
    alignmentScore: Number(scenario?.analysis?.alignment?.score) || 0,
    actionGroup: config.group,
    policyId: policy.id,
  };

  return createContextAtom({
    id: `${actionId}:${scenario?.id || "scene"}:${scenario?.observation?.dateValue || "date"}`,
    geometry: {
      type: "bbox",
      bbox: aoi,
      label: scenario?.focusSelection?.label || scenario?.imageryProfile?.label || scenario?.title || "",
    },
    timeRange: {
      start: observationIso,
      end: observationIso,
      bucket: scenario?.observation?.dateValue || null,
    },
    sensor,
    product,
    resolutionM,
    assetRefs: buildAssetRefsForAction(actionId, scenario),
    quality,
    priors,
    cost: baseCostForAction(actionId),
    uncertainty: clamp(1 - quality.validPct + quality.cloudPct * 0.24, 0.1, 0.88),
    provenance: buildProvenance({
      sourceType: "planner-candidate",
      sourceId: actionId,
      note: `Planner candidate for ${scenario?.type || "unknown-task"}`,
    }),
    actionId,
    selectionGroup: config.group,
    embedding: contextEmbeddingForScenario(scenario, actionId),
  });
}

function prerequisitesSatisfied(state, actionId) {
  const prerequisites = evidenceActionRegistry[actionId]?.prerequisites || [];
  if (!prerequisites.length) {
    return true;
  }

  const executed = new Set((state?.planner?.actionHistory || []).map((item) => item.actionId));
  return prerequisites.every((item) => executed.has(item));
}

function shouldIncludeAction(state, actionId, scenario, policy, { useContextSelection = true } = {}) {
  const executed = new Set((state?.planner?.actionHistory || []).map((item) => item.actionId));
  if (executed.has(actionId)) {
    return false;
  }

  if (!prerequisitesSatisfied(state, actionId)) {
    return false;
  }

  const overallUncertainty = Number(state?.epistemic?.uncertaintyMap?.overall) || 0.5;
  const highresAvailable = Boolean(scenario?.imagery?.supplementalPreview?.available);
  const filteredDust = state?.observations?.beliefMaps?.dustCandidatesFiltered || [];
  const clusteredHotspots = state?.observations?.beliefMaps?.hotspotClusters || [];
  const hasWildfireEvidence =
    executed.has("fetch_viirs_active_fire") ||
    executed.has("cluster_hotspots") ||
    executed.has("local_burned_area_refine");
  const hasDustEvidence =
    executed.has("score_dust_candidates") ||
    executed.has("reject_water_like_candidates") ||
    executed.has("dust_window_fallback");
  const hasTaskEvidence = scenario?.type === "wildfire" ? hasWildfireEvidence : hasDustEvidence;

  if (actionId === "request_highres_support" && (!highresAvailable || overallUncertainty < 0.34)) {
    return false;
  }
  if (
    actionId === "request_highres_support" &&
    scenario?.type === "wildfire" &&
    !state?.observations?.beliefMaps?.rawHotspots?.length &&
    !clusteredHotspots.length
  ) {
    return false;
  }
  if (actionId === "local_burned_area_refine" && (!highresAvailable || !clusteredHotspots.length)) {
    return false;
  }
  if (actionId === "cluster_hotspots" && !state?.observations?.beliefMaps?.rawHotspots?.length) {
    return false;
  }
  if (actionId === "reject_water_like_candidates" && !state?.observations?.beliefMaps?.dustCandidatesRaw?.length) {
    return false;
  }
  if (actionId === "dust_window_fallback" && filteredDust.length > 0) {
    return false;
  }
  if (actionId === "uncertainty_check" && !hasTaskEvidence) {
    return false;
  }
  if (actionId === "package_result" && !hasTaskEvidence) {
    return false;
  }
  if (actionId === "package_result" && useContextSelection && overallUncertainty > 0.74) {
    return false;
  }

  return true;
}

export function initState(task, scenario, options, policy) {
  return createGeoState({
    mission: {
      task,
      aoi: currentAoi(scenario),
      timeAnchor: scenario?.observation?.iso || null,
      budgetMode: budgetModeFromOptions(options),
    },
    world: {
      staticMasks: [],
      capabilityHints: [
        `showcase-mainline:${scenario?.type || task}`,
        `policy:${policy.id}`,
      ],
    },
    observations: {
      selectedAtoms: [],
      evidence: [],
      validRegion: scenario?.analysis?.validRegion || null,
      beliefMaps: {},
    },
    epistemic: {
      hypotheses: [
        {
          id: `${task}-primary`,
          label: task === "wildfire" ? "存在稳定热异常热点簇" : "存在稳定沙尘异常候选区",
          confidence: 0.45,
        },
      ],
      uncertaintyMap: {
        overall: 0.5,
      },
      contradictions: [],
      missingEvidence: [],
      stopReason: null,
    },
    planner: {
      budgetLeft: {
        latencyMs: Math.max(1200, (Number(options?.budgetMin) || 6) * 60 * 1000),
        bytes: Math.max(2_000_000, (Number(scenario?.bandwidthBudgetMb) || 16) * 1024 * 1024),
        compute: task === "wildfire" ? 6 : 8,
      },
      actionHistory: [],
      frontier: [],
    },
  });
}

export function enumerateCandidateContexts(state, scenario, policy, options = {}) {
  return policy.contextActions
    .filter((actionId) => shouldIncludeAction(state, actionId, scenario, policy, options))
    .map((actionId) => buildCandidateAtom(actionId, scenario, policy));
}

function taskSpecificScoreBoost(taskId, atom, state, policy) {
  if (taskId === "wildfire") {
    const hotspotStrength = Number(state?.observations?.beliefMaps?.rawHotspotStrength) || 0.4;
    const highresAvailable = atom.actionId === "request_highres_support" && atom.assetRefs.length > 0 ? 1 : 0;
    const temporalPotential = atom.actionId === "temporal_persistence_check" ? 0.9 : atom.selectionGroup === "temporal" ? 0.6 : 0.3;
    const staticPenalty = atom.actionId === "fetch_static_thermal_anomaly_mask" ? 0.7 : 0.3;
    return (
      hotspotStrength * (policy.scoringFeatures.thermalStrengthWeight || 0) +
      temporalPotential * (policy.scoringFeatures.temporalPersistenceWeight || 0) +
      highresAvailable * (policy.scoringFeatures.highresAvailabilityWeight || 0) -
      staticPenalty * (policy.scoringFeatures.staticMaskPenaltyWeight || 0) * 0.25
    );
  }

  const supportRatio = Number(atom.priors?.supportRatio) || 0;
  const screenedRatio = Number(atom.priors?.screenedRatio) || 0;
  const temporalPotential = atom.actionId === "temporal_continuation_check" ? 0.9 : atom.selectionGroup === "temporal" ? 0.6 : 0.3;
  return (
    supportRatio * (policy.scoringFeatures.dustPriorSupportWeight || 0) +
    temporalPotential * (policy.scoringFeatures.temporalContinuityWeight || 0) -
    screenedRatio * (policy.scoringFeatures.waterCloudVetoPenaltyWeight || 0) * 0.4
  );
}

export function scoreContexts(state, candidates, policy, scenario) {
  const weights = policy.weights;
  const aoi = currentAoi(scenario);
  const center = centerOfBbox(aoi);
  const usedGroups = new Set((state?.planner?.actionHistory || []).map((item) => item.group));
  const usedActions = new Set((state?.planner?.actionHistory || []).map((item) => item.actionId));

  return (Array.isArray(candidates) ? candidates : [])
    .map((atom) => {
      const atomCenter = centerOfBbox(atom.geometry?.bbox);
      const spatialContinuity =
        center && atomCenter
          ? clamp(1 - Math.hypot(atomCenter.lon - center.lon, atomCenter.lat - center.lat) / 20, 0, 1)
          : 0.5;
      const taskRelevance = atom.actionId.startsWith("fetch_") || atom.actionId === "build_valid_region" ? 0.82 : 0.68;
      const expectedInformationGain = clamp(atom.uncertainty * 0.62 + (1 - atom.quality.validPct) * 0.18 + (1 - atom.quality.missingPct) * 0.1, 0.08, 0.96);
      const complementarity = usedGroups.has(atom.selectionGroup) ? 0.18 : 0.88;
      const temporalContinuity = atom.selectionGroup === "temporal" ? 0.92 : 0.36;
      const latencyPenalty = clamp(atom.cost.estLatencyMs / Math.max(1, Number(state?.planner?.budgetLeft?.latencyMs) || 1), 0, 1);
      const computePenalty = clamp(atom.cost.estCompute / Math.max(1, Number(state?.planner?.budgetLeft?.compute) || 1), 0, 1);
      const lowQualityPenalty = clamp((atom.quality.cloudPct + atom.quality.missingPct + (1 - atom.quality.validPct)) / 3, 0, 1);
      const redundancyPenalty = usedActions.has(atom.actionId) ? 1 : 0;
      const taskBoost = taskSpecificScoreBoost(scenario?.type, atom, state, policy);

      const score = round(
        taskRelevance * weights.taskRelevance +
          expectedInformationGain * weights.expectedInformationGain +
          complementarity * weights.complementarity +
          temporalContinuity * weights.temporalContinuity +
          spatialContinuity * weights.spatialContinuity +
          taskBoost -
          latencyPenalty * weights.latencyPenalty -
          computePenalty * weights.computePenalty -
          lowQualityPenalty * weights.lowQualityPenalty -
          redundancyPenalty * weights.redundancyPenalty,
        4
      );

      return {
        ...atom,
        score,
        scoreBreakdown: {
          taskRelevance: round(taskRelevance, 4),
          expectedInformationGain: round(expectedInformationGain, 4),
          complementarity: round(complementarity, 4),
          temporalContinuity: round(temporalContinuity, 4),
          spatialContinuity: round(spatialContinuity, 4),
          latencyPenalty: round(latencyPenalty, 4),
          computePenalty: round(computePenalty, 4),
          lowQualityPenalty: round(lowQualityPenalty, 4),
          redundancyPenalty: round(redundancyPenalty, 4),
          taskBoost: round(taskBoost, 4),
        },
      };
    })
    .sort((left, right) => right.score - left.score);
}

export function selectDiverseTopk(candidates, k = 3, { useContextSelection = true } = {}) {
  const ranked = Array.isArray(candidates) ? candidates.slice() : [];
  if (!useContextSelection) {
    return ranked.slice(0, k);
  }

  const selected = [];
  const groups = new Set();
  for (const candidate of ranked) {
    if (!groups.has(candidate.selectionGroup) || selected.length + 1 >= k) {
      selected.push(candidate);
      groups.add(candidate.selectionGroup);
    }
    if (selected.length >= k) {
      break;
    }
  }
  return selected;
}

async function executeBatch(selection, context) {
  const results = [];
  for (const atom of selection) {
    const startedAt = Date.now();
    const outcome = await executeEvidenceAction(atom.actionId, {
      ...context,
      atom,
    });
    results.push({
      atom,
      observation: outcome.observation,
      cost: outcome.cost,
      latencyMs: Date.now() - startedAt || outcome.cost.estLatencyMs,
    });
  }
  return results;
}

function computeOverallUncertainty(state) {
  const evidence = Array.isArray(state?.observations?.evidence) ? state.observations.evidence : [];
  if (!evidence.length) {
    return 0.5;
  }

  const meanUncertainty = evidence.reduce((sum, observation) => sum + (Number(observation.uncertainty) || 0.5), 0) / evidence.length;
  const contradictionPenalty = Math.min(0.2, (state?.epistemic?.contradictions?.length || 0) * 0.05);
  const missingPenalty = Math.min(0.16, (state?.epistemic?.missingEvidence?.length || 0) * 0.04);
  return clamp(meanUncertainty + contradictionPenalty + missingPenalty, 0.04, 0.96);
}

function applyObservationToBeliefMaps(state, scenario, observation) {
  const actionId = observation?.provenance?.sourceId || "";
  const payload = observation?.payload || {};

  if (actionId === "build_valid_region") {
    state.observations.validRegion = payload;
  }
  if (actionId === "fetch_viirs_active_fire") {
    state.observations.beliefMaps.rawHotspots = clone(payload.rois || []);
    state.observations.beliefMaps.rawHotspotStrength = Number(payload.hotspotStrength) || 0;
  }
  if (actionId === "cluster_hotspots" || actionId === "local_burned_area_refine") {
    state.observations.beliefMaps.hotspotClusters = clone(payload.rois || []);
  }
  if (actionId === "fetch_dust_support_priors") {
    state.observations.beliefMaps.dustSupport = clone(payload);
  }
  if (actionId === "score_dust_candidates") {
    state.observations.beliefMaps.dustCandidatesRaw = clone(payload.rois || []);
  }
  if (actionId === "reject_water_like_candidates" || actionId === "dust_window_fallback") {
    state.observations.beliefMaps.dustCandidatesFiltered = clone(payload.rois || []);
  }

  if (actionId === "fetch_static_thermal_anomaly_mask" && Array.isArray(payload.regions) && payload.regions.length) {
    state.world.staticMasks.push({
      id: "wildfire-static-mask",
      sourceLabel: payload.sourceLabel,
      regions: clone(payload.regions),
    });
  }
  if (actionId === "fetch_land_water_mask") {
    state.world.staticMasks.push({
      id: "dust-land-water-mask",
      sourceLabel: payload.sourceLabel,
      screenedRatio: payload.screenedRatio,
    });
  }

  if (actionId === "temporal_persistence_check" && !(payload.matchedCount > 0)) {
    state.epistemic.missingEvidence.push("wildfire_temporal_memory_missing");
  }
  if (actionId === "temporal_continuation_check" && !(payload.matchedCount > 0)) {
    state.epistemic.missingEvidence.push("dust_temporal_memory_missing");
  }
  if (actionId === "reject_water_like_candidates" && payload.abstained) {
    state.epistemic.contradictions.push("dust_candidates_vetoed_by_water_or_uncertainty");
  }
  if ((actionId === "cluster_hotspots" || actionId === "local_burned_area_refine") && (payload.rois?.length || 0) === 0) {
    state.epistemic.contradictions.push("no_stable_hotspot_clusters");
  }

  if (actionId === "uncertainty_check" && payload.stopReasonCandidate) {
    state.epistemic.stopReason = payload.stopReasonCandidate;
  }

  const finalRois =
    scenario.type === "wildfire"
      ? state.observations.beliefMaps.hotspotClusters || []
      : state.observations.beliefMaps.dustCandidatesFiltered || [];
  state.epistemic.hypotheses = [
    {
      id: `${scenario.type}-primary`,
      label: scenario.type === "wildfire" ? "存在稳定热异常热点簇" : "存在稳定沙尘异常候选区",
      confidence: round(finalRois.length ? Math.max(0.42, 1 - (Number(observation.uncertainty) || 0.5)) : 0.26, 4),
    },
  ];
  state.epistemic.uncertaintyMap.overall = computeOverallUncertainty(state);
}

export function updateState(state, scenario, batchResults) {
  const next = clone(state);
  const previousUncertainty = Number(state?.epistemic?.uncertaintyMap?.overall) || 0.5;

  for (const result of batchResults) {
    next.observations.selectedAtoms.push(result.atom.id);
    next.observations.evidence.push(result.observation);
    next.planner.actionHistory.push({
      actionId: result.atom.actionId,
      atomId: result.atom.id,
      group: result.atom.selectionGroup,
      latencyMs: result.latencyMs,
      bytes: result.cost.estBytes,
      compute: result.cost.estCompute,
    });
    next.planner.budgetLeft.latencyMs = Math.max(0, next.planner.budgetLeft.latencyMs - result.latencyMs);
    next.planner.budgetLeft.bytes = Math.max(0, next.planner.budgetLeft.bytes - result.cost.estBytes);
    next.planner.budgetLeft.compute = Math.max(0, round(next.planner.budgetLeft.compute - result.cost.estCompute, 3));
    applyObservationToBeliefMaps(next, scenario, result.observation);
  }

  const observedGain = round(previousUncertainty - (Number(next.epistemic.uncertaintyMap.overall) || previousUncertainty), 4);
  next.planner.lastObservedGain = observedGain;
  return next;
}

export function expandFrontier(state, scenario, policy, options = {}) {
  return enumerateCandidateContexts(state, scenario, policy, options);
}

export function stopWhen(state, policy) {
  const overallUncertainty = Number(state?.epistemic?.uncertaintyMap?.overall) || 0.5;
  const confidence = 1 - overallUncertainty;
  const budgetLeft = Number(state?.planner?.budgetLeft?.latencyMs) || 0;
  const lastGain = Number(state?.planner?.lastObservedGain) || 0;
  const executed = new Set((state?.planner?.actionHistory || []).map((item) => item.actionId));
  const hasWildfireEvidence =
    executed.has("fetch_viirs_active_fire") ||
    executed.has("cluster_hotspots") ||
    executed.has("local_burned_area_refine");
  const hasDustEvidence =
    executed.has("score_dust_candidates") ||
    executed.has("reject_water_like_candidates") ||
    executed.has("dust_window_fallback");
  const hasTaskEvidence = state?.mission?.task === "wildfire" ? hasWildfireEvidence : hasDustEvidence;
  const finalized = executed.has("uncertainty_check") || executed.has("package_result");

  if (state?.epistemic?.stopReason) {
    return {
      stop: true,
      reason: state.epistemic.stopReason,
    };
  }

  if (
    confidence >= policy.stopThresholds.confidenceEnough &&
    hasTaskEvidence &&
    finalized &&
    (state?.observations?.evidence?.length || 0) > 0
  ) {
    return {
      stop: true,
      reason: "confidence_enough",
    };
  }

  if (
    hasTaskEvidence &&
    finalized &&
    (state?.planner?.actionHistory?.length || 0) > 0 &&
    lastGain <= policy.stopThresholds.marginalGainTooSmall
  ) {
    return {
      stop: true,
      reason: "marginal_gain_too_small",
    };
  }

  if (budgetLeft <= policy.stopThresholds.minBudgetLatencyMs) {
    return {
      stop: true,
      reason: "budget_exhausted",
    };
  }

  return {
    stop: false,
    reason: null,
  };
}

function plannerStateDeltaSummary(state, nextState, batchResults) {
  const prevUncertainty = Number(state?.epistemic?.uncertaintyMap?.overall) || 0.5;
  const nextUncertainty = Number(nextState?.epistemic?.uncertaintyMap?.overall) || 0.5;
  const delta = round(prevUncertainty - nextUncertainty, 4);
  const actions = batchResults.map((item) => evidenceActionRegistry[item.atom.actionId]?.label || item.atom.actionId).join(" / ");
  return `执行 ${actions}，整体不确定性变化 ${delta >= 0 ? "-" : "+"}${Math.abs(delta)}，剩余时延预算约 ${Math.round(nextState?.planner?.budgetLeft?.latencyMs || 0)} ms。`;
}

function finalPlannerPayload(state, scenario) {
  if (scenario.type === "wildfire") {
    return latestPlannerObservationPayload(state, ["local_burned_area_refine", "cluster_hotspots"]);
  }
  return latestPlannerObservationPayload(state, ["dust_window_fallback", "reject_water_like_candidates", "score_dust_candidates"]);
}

function latestPlannerObservationPayload(state, actionIds = []) {
  for (const actionId of actionIds) {
    const observation = (state?.observations?.evidence || []).slice().reverse().find((item) => item?.provenance?.sourceId === actionId);
    if (observation?.payload) {
      return observation.payload;
    }
  }
  return {};
}

function evidencePathSummary(evidencePath = []) {
  const topSteps = evidencePath.slice(0, 3);
  return topSteps.length
    ? topSteps.map((step) => `${step.selectedAction}: ${step.whySelected}`).join(" | ")
    : "当前没有形成可解释的 evidence path。";
}

function whyContextSummary(evidencePath = []) {
  const selected = evidencePath.slice(0, 3).map((step) => step.selectedAtomIds.join(",")).filter(Boolean);
  return selected.length
    ? `planner 优先选择了 ${selected.join(" -> ")}，因为这些上下文在任务相关性、信息增益和成本之间更稳。`
    : "planner 没有完成稳定上下文选择，已回退旧 workflow。";
}

function stateDeltaCardSummary(state = {}, evidencePath = []) {
  const uncertainty = Number(state?.epistemic?.uncertaintyMap?.overall) || 0.5;
  const lastStep = evidencePath[evidencePath.length - 1];
  return lastStep?.stateDeltaSummary || `当前整体不确定性 ${Math.round(uncertainty * 100)}%，状态变化以最新 evidence 为准。`;
}

function applyPlannerOutcomeToScenario(baseScenario, plannerState, evidencePath, stopReason) {
  const scenario = clone(baseScenario);
  const finalPayload = finalPlannerPayload(plannerState, scenario);
  const finalRois = Array.isArray(finalPayload?.rois) ? finalPayload.rois : [];
  const overallUncertainty = Number(plannerState?.epistemic?.uncertaintyMap?.overall) || 0.5;
  const abstained = Boolean(finalPayload?.abstained || (!finalRois.length && overallUncertainty >= 0.4));

  scenario.rois = finalRois.map((roi) => ({
    ...roi,
    box: clone(roi.box || {}),
  }));
  scenario.analysis = {
    ...scenario.analysis,
    plannerEvidence: {
      enabled: true,
      uncertainty: round(overallUncertainty, 4),
      stopReason: stopReason || null,
      evidencePath: evidencePath.map((step) => ({ ...step })),
      whyThisContext: whyContextSummary(evidencePath),
      stateDelta: stateDeltaCardSummary(plannerState, evidencePath),
    },
    abstained,
    abstentionReason: abstained ? stopReason || "planner_abstained_due_to_uncertainty" : scenario.analysis?.abstentionReason || "",
    summary:
      scenario.type === "wildfire"
        ? `${scenario.analysis?.summary || ""} Evidence Planner 已显式引入静态热点先验、时间连续性和按需高分补充，用于组织热点证据路径。`.trim()
        : `${scenario.analysis?.summary || ""} Evidence Planner 已把沙尘 support/screening 提升为硬 veto 与时序连续性校验，用于保守筛选最终候选区。`.trim(),
  };
  scenario.observation = {
    ...scenario.observation,
    summary: `${scenario.observation?.summary || ""} 当前 evidence path：${evidencePathSummary(evidencePath)}`.trim(),
  };
  return scenario;
}

function writePlannerGeoMemory(memoryInput, scenario, plannerState, plannerResult) {
  let memory = normalizeGeoMemory(memoryInput);
  const bbox = currentAoi(scenario);
  const baseEntry = {
    task: scenario.type,
    bbox,
    timeAnchor: scenario?.observation?.iso,
    uncertainty: Number(plannerState?.epistemic?.uncertaintyMap?.overall) || 0.5,
    provenance: buildProvenance({
      sourceType: "evidence-planner",
      sourceId: plannerResult.policy.id,
      note: plannerResult.stopReason || "planner-finished",
    }),
  };

  if (scenario.type === "wildfire") {
    memory = writeGeoMemory(memory, "dynamic", {
      ...baseEntry,
      kind: "hotspot_summary",
      payload: {
        rois: clone(plannerState?.observations?.beliefMaps?.hotspotClusters || []),
      },
    });
    memory = writeGeoMemory(memory, "dynamic", {
      ...baseEntry,
      kind: "evidence_hotspots",
      payload: {
        evidencePath: clone(plannerResult.evidencePath),
      },
    });
  } else if (scenario.type === "dust") {
    memory = writeGeoMemory(memory, "dynamic", {
      ...baseEntry,
      kind: "dust_summary",
      payload: {
        rois: clone(plannerState?.observations?.beliefMaps?.dustCandidatesFiltered || []),
      },
    });
    memory = writeGeoMemory(memory, "dynamic", {
      ...baseEntry,
      kind: "evidence_dust_candidates",
      payload: {
        evidencePath: clone(plannerResult.evidencePath),
      },
    });
  }

  memory = writeGeoMemory(memory, "episodic", {
    ...baseEntry,
    kind: "evidence_path_episode",
    payload: {
      success: !plannerResult.fallbackUsed,
      stopReason: plannerResult.stopReason,
      evidencePath: clone(plannerResult.evidencePath),
    },
  });

  return compactGeoMemory(memory);
}

function buildTrajectoryTelemetry(evidencePath = []) {
  const assetRefs = evidencePath.flatMap((step) => step.selectedAtomIds || []);
  const unique = new Set(assetRefs);
  const requiredFields = [
    "stepId",
    "selectedAction",
    "selectedAtomIds",
    "whySelected",
    "expectedGain",
    "observedGain",
    "latencyMs",
    "fallbackUsed",
    "stateDeltaSummary",
  ];
  const completeness =
    evidencePath.length === 0
      ? 0
      : round(
          evidencePath.reduce((sum, step) => {
            const filled = requiredFields.reduce((count, field) => count + (step[field] !== undefined && step[field] !== null ? 1 : 0), 0);
            return sum + filled / requiredFields.length;
          }, 0) / evidencePath.length,
          4
        );

  return {
    externalAssetCalls: unique.size,
    repeatedDownloads: Math.max(0, assetRefs.length - unique.size),
    averageActionCount: evidencePath.length,
    trajectoryLogCompleteness: completeness,
  };
}

export async function runEvidencePlannerMission(
  scenario,
  options,
  geoMemoryInput = createGeoMemory(),
  {
    useGeoMemory = true,
    useContextSelection = true,
  } = {}
) {
  const policy = getEvidencePlannerPolicy(scenario?.type);
  if (!policy) {
    return {
      supported: false,
      fallbackUsed: true,
      fallbackReason: "unsupported_task",
      scenario,
      geoMemory: normalizeGeoMemory(geoMemoryInput),
      evidencePath: [],
      state: null,
      telemetry: buildTrajectoryTelemetry([]),
    };
  }

  const geoMemory = useGeoMemory ? normalizeGeoMemory(geoMemoryInput) : createGeoMemory();
  let state = initState(scenario.type, scenario, options, policy);
  let frontier = enumerateCandidateContexts(state, scenario, policy, { useContextSelection });
  const evidencePath = [];
  let stopReason = null;

  for (let iteration = 0; iteration < policy.maxIterations; iteration += 1) {
    const scored = scoreContexts(state, frontier, policy, scenario);
    const selected = selectDiverseTopk(scored, policy.selectTopK, { useContextSelection });
    if (!selected.length) {
      stopReason = stopReason || "no_candidate_context";
      break;
    }

    const selectedBatch = [];
    try {
      const batchResults = await executeBatch(selected, {
        scenario,
        state,
        geoMemory,
      });
      const nextState = updateState(state, scenario, batchResults);
      const observedGain = Number(nextState?.planner?.lastObservedGain) || 0;

      batchResults.forEach((result) => {
        const scoredAtom = scored.find((item) => item.id === result.atom.id) || result.atom;
        evidencePath.push(
          createEvidencePathStep({
            stepId: `step-${evidencePath.length + 1}`,
            selectedAction: result.atom.actionId,
            selectedAtomIds: [result.atom.id],
            whySelected: `score ${scoredAtom.score}，${result.atom.selectionGroup} 组，${result.atom.product}`,
            expectedGain: scoredAtom.score,
            observedGain,
            latencyMs: result.latencyMs,
            fallbackUsed: false,
            stateDeltaSummary: plannerStateDeltaSummary(state, nextState, [result]),
          })
        );
        selectedBatch.push(result.atom.id);
      });

      state = nextState;
      const stopDecision = stopWhen(state, policy);
      if (stopDecision.stop) {
        stopReason = stopDecision.reason;
        state.epistemic.stopReason = stopDecision.reason;
        break;
      }

      frontier = expandFrontier(state, scenario, policy, { useContextSelection });
    } catch (error) {
      stopReason = error.code || "planner_execution_failed";
      state.epistemic.stopReason = stopReason;
      evidencePath.push(
        createEvidencePathStep({
          stepId: `step-${evidencePath.length + 1}`,
          selectedAction: selected[0]?.actionId || "planner_error",
          selectedAtomIds: selectedBatch.length ? selectedBatch : selected.map((item) => item.id),
          whySelected: error.message || "planner action failed",
          expectedGain: selected[0]?.score || 0,
          observedGain: 0,
          latencyMs: 0,
          fallbackUsed: true,
          stateDeltaSummary: `planner action failed: ${error.message || error.code || "unknown error"}`,
        })
      );
      return {
        supported: true,
        fallbackUsed: true,
        fallbackReason: stopReason,
        policy,
        scenario,
        state,
        evidencePath,
        whyThisContext: whyContextSummary(evidencePath),
        stateDelta: stateDeltaCardSummary(state, evidencePath),
        geoMemory: normalizeGeoMemory(geoMemoryInput),
        telemetry: buildTrajectoryTelemetry(evidencePath),
        stopReason,
      };
    }
  }

  const scenarioWithPlanner = applyPlannerOutcomeToScenario(scenario, state, evidencePath, stopReason);
  const plannerResult = {
    supported: true,
    fallbackUsed: false,
    fallbackReason: null,
    policy,
    scenario: scenarioWithPlanner,
    state,
    evidencePath,
    whyThisContext: whyContextSummary(evidencePath),
    stateDelta: stateDeltaCardSummary(state, evidencePath),
    telemetry: buildTrajectoryTelemetry(evidencePath),
    stopReason,
  };
  plannerResult.geoMemory = writePlannerGeoMemory(geoMemoryInput, scenarioWithPlanner, state, plannerResult);
  return plannerResult;
}
