function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function round(value, digits = 3) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeBBox(rawBbox = null) {
  if (!Array.isArray(rawBbox) || rawBbox.length !== 4) {
    return null;
  }

  const bbox = rawBbox.map((value) => Number(value));
  if (bbox.some((value) => !Number.isFinite(value))) {
    return null;
  }

  return bbox;
}

function normalizeTimeRange(timeRange = null) {
  if (!timeRange || typeof timeRange !== "object") {
    return {
      start: null,
      end: null,
      bucket: null,
    };
  }

  return {
    start: typeof timeRange.start === "string" ? timeRange.start : null,
    end: typeof timeRange.end === "string" ? timeRange.end : null,
    bucket: typeof timeRange.bucket === "string" ? timeRange.bucket : null,
  };
}

function normalizeQuality(quality = {}) {
  return {
    cloudPct: clamp(Number(quality.cloudPct) || 0, 0, 1),
    validPct: clamp(Number(quality.validPct) || 0, 0, 1),
    missingPct: clamp(Number(quality.missingPct) || 0, 0, 1),
  };
}

function normalizeCost(cost = {}) {
  return {
    estLatencyMs: Math.max(0, Math.round(Number(cost.estLatencyMs) || 0)),
    estBytes: Math.max(0, Math.round(Number(cost.estBytes) || 0)),
    estCompute: round(Math.max(0, Number(cost.estCompute) || 0), 3),
  };
}

export function buildProvenance({
  sourceType = "internal",
  sourceId = "unknown-source",
  generatedAt = new Date().toISOString(),
  note = "",
  refs = [],
} = {}) {
  return {
    sourceType,
    sourceId,
    generatedAt,
    note,
    refs: Array.isArray(refs) ? refs.slice() : [],
  };
}

export function createContextAtom({
  id,
  geometry = null,
  timeRange = null,
  sensor = "",
  product = "",
  resolutionM = null,
  assetRefs = [],
  quality = {},
  priors = {},
  cost = {},
  uncertainty = 0.5,
  provenance = null,
  actionId = "",
  selectionGroup = "generic",
  embedding = [],
} = {}) {
  return {
    id: id || "context-atom",
    geometry: geometry && typeof geometry === "object"
      ? {
          type: geometry.type || "bbox",
          bbox: normalizeBBox(geometry.bbox),
          label: geometry.label || "",
        }
      : {
          type: "bbox",
          bbox: null,
          label: "",
        },
    timeRange: normalizeTimeRange(timeRange),
    sensor: sensor || "",
    product: product || "",
    resolutionM: Number.isFinite(Number(resolutionM)) ? Number(resolutionM) : null,
    assetRefs: Array.isArray(assetRefs) ? assetRefs.slice() : [],
    quality: normalizeQuality(quality),
    priors: clone(priors && typeof priors === "object" ? priors : {}),
    cost: normalizeCost(cost),
    uncertainty: clamp(Number(uncertainty) || 0.5, 0, 1),
    provenance: provenance || buildProvenance(),
    actionId: actionId || "",
    selectionGroup: selectionGroup || "generic",
    embedding: Array.isArray(embedding)
      ? embedding.map((value) => round(Number(value) || 0, 4))
      : [],
  };
}

export function createObservation({
  atomId,
  kind = "scene_summary",
  payload = null,
  confidence = 0.5,
  uncertainty = 0.5,
  provenance = null,
} = {}) {
  return {
    atomId: atomId || "unknown-atom",
    kind,
    payload: clone(payload),
    confidence: clamp(Number(confidence) || 0.5, 0, 1),
    uncertainty: clamp(Number(uncertainty) || 0.5, 0, 1),
    provenance: provenance || buildProvenance(),
  };
}

export function createGeoState({
  mission = {},
  world = {},
  observations = {},
  epistemic = {},
  planner = {},
} = {}) {
  return {
    mission: {
      task: mission.task || "unknown",
      aoi: normalizeBBox(mission.aoi),
      timeAnchor: mission.timeAnchor || null,
      budgetMode: mission.budgetMode || "balanced",
    },
    world: {
      staticMasks: Array.isArray(world.staticMasks) ? clone(world.staticMasks) : [],
      capabilityHints: Array.isArray(world.capabilityHints) ? clone(world.capabilityHints) : [],
    },
    observations: {
      selectedAtoms: Array.isArray(observations.selectedAtoms) ? clone(observations.selectedAtoms) : [],
      evidence: Array.isArray(observations.evidence) ? clone(observations.evidence) : [],
      validRegion: observations.validRegion ? clone(observations.validRegion) : null,
      beliefMaps: observations.beliefMaps && typeof observations.beliefMaps === "object"
        ? clone(observations.beliefMaps)
        : {},
    },
    epistemic: {
      hypotheses: Array.isArray(epistemic.hypotheses) ? clone(epistemic.hypotheses) : [],
      uncertaintyMap: epistemic.uncertaintyMap && typeof epistemic.uncertaintyMap === "object"
        ? clone(epistemic.uncertaintyMap)
        : {},
      contradictions: Array.isArray(epistemic.contradictions) ? clone(epistemic.contradictions) : [],
      missingEvidence: Array.isArray(epistemic.missingEvidence) ? clone(epistemic.missingEvidence) : [],
      stopReason: epistemic.stopReason || null,
    },
    planner: {
      budgetLeft: planner.budgetLeft && typeof planner.budgetLeft === "object"
        ? clone(planner.budgetLeft)
        : { latencyMs: 0, bytes: 0, compute: 0 },
      actionHistory: Array.isArray(planner.actionHistory) ? clone(planner.actionHistory) : [],
      frontier: Array.isArray(planner.frontier) ? clone(planner.frontier) : [],
    },
  };
}

export function createEvidencePathStep({
  stepId,
  selectedAction,
  selectedAtomIds = [],
  whySelected = "",
  expectedGain = 0,
  observedGain = 0,
  latencyMs = 0,
  fallbackUsed = false,
  stateDeltaSummary = "",
} = {}) {
  return {
    stepId: stepId || "step-1",
    selectedAction: selectedAction || "unknown_action",
    selectedAtomIds: Array.isArray(selectedAtomIds) ? selectedAtomIds.slice() : [],
    whySelected,
    expectedGain: round(Number(expectedGain) || 0, 4),
    observedGain: round(Number(observedGain) || 0, 4),
    latencyMs: Math.max(0, Math.round(Number(latencyMs) || 0)),
    fallbackUsed: Boolean(fallbackUsed),
    stateDeltaSummary,
  };
}

export class PlannerActionError extends Error {
  constructor({
    actionId = "unknown_action",
    code = "planner_action_failed",
    message = "Planner action failed.",
    retryable = true,
    detail = null,
    provenance = null,
  } = {}) {
    super(message);
    this.name = "PlannerActionError";
    this.actionId = actionId;
    this.code = code;
    this.retryable = Boolean(retryable);
    this.detail = detail;
    this.provenance = provenance || buildProvenance({
      sourceType: "planner-error",
      sourceId: actionId,
      note: message,
    });
  }
}
