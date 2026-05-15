import { matchReviewedBenchmarkCase } from "./benchmarkCases.mjs";
import { readGeoMemory } from "./geoMemory.mjs";
import {
  PlannerActionError,
  buildProvenance,
  createObservation,
} from "./evidenceTypes.mjs";
import { getAnalysisValidRegion } from "./remoteSensing.mjs";

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

function roiArea(box = {}) {
  return Math.max(0, Number(box.width) || 0) * Math.max(0, Number(box.height) || 0);
}

function roiIntersection(left = {}, right = {}) {
  const x1 = Math.max(Number(left.left) || 0, Number(right.left) || 0);
  const y1 = Math.max(Number(left.top) || 0, Number(right.top) || 0);
  const x2 = Math.min((Number(left.left) || 0) + (Number(left.width) || 0), (Number(right.left) || 0) + (Number(right.width) || 0));
  const y2 = Math.min((Number(left.top) || 0) + (Number(left.height) || 0), (Number(right.top) || 0) + (Number(right.height) || 0));
  return Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
}

function roiIoU(left = {}, right = {}) {
  const intersection = roiIntersection(left, right);
  const union = roiArea(left) + roiArea(right) - intersection;
  return union > 0 ? round(intersection / union, 4) : 0;
}

function maskCoverageForRoi(box = {}, validRegion = null) {
  const width = Math.max(0, Number(validRegion?.width) || 0);
  const height = Math.max(0, Number(validRegion?.height) || 0);
  const surfaceMask = validRegion?.surfaceMask;
  if (!width || !height || !(surfaceMask instanceof Uint8Array)) {
    return 0;
  }

  const left = clamp(Math.floor(((Number(box.left) || 0) / 100) * width), 0, Math.max(0, width - 1));
  const top = clamp(Math.floor(((Number(box.top) || 0) / 100) * height), 0, Math.max(0, height - 1));
  const right = clamp(Math.ceil((((Number(box.left) || 0) + (Number(box.width) || 0)) / 100) * width), left + 1, width);
  const bottom = clamp(Math.ceil((((Number(box.top) || 0) + (Number(box.height) || 0)) / 100) * height), top + 1, height);

  let covered = 0;
  let total = 0;
  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) {
      total += 1;
      if (surfaceMask[y * width + x] === 1) {
        covered += 1;
      }
    }
  }

  return total > 0 ? round(covered / total, 4) : 0;
}

function buildCostSnapshot(cost = {}, atom = null) {
  return {
    estLatencyMs: Math.max(0, Math.round(Number(cost.estLatencyMs ?? atom?.cost?.estLatencyMs) || 0)),
    estBytes: Math.max(0, Math.round(Number(cost.estBytes ?? atom?.cost?.estBytes) || 0)),
    estCompute: round(Math.max(0, Number(cost.estCompute ?? atom?.cost?.estCompute) || 0), 3),
  };
}

function buildObservationResult(actionId, atom, kind, payload, {
  confidence = 0.5,
  uncertainty = 0.5,
  note = "",
  refs = [],
  cost = {},
} = {}) {
  const provenance = buildProvenance({
    sourceType: "evidence-action",
    sourceId: actionId,
    note,
    refs,
  });

  return {
    observation: createObservation({
      atomId: atom.id,
      kind,
      payload,
      confidence,
      uncertainty,
      provenance,
    }),
    cost: buildCostSnapshot(cost, atom),
  };
}

function failAction(actionId, atom, message, {
  code = "planner_action_failed",
  retryable = true,
  detail = null,
  note = "",
} = {}) {
  throw new PlannerActionError({
    actionId,
    code,
    message,
    retryable,
    detail,
    provenance: buildProvenance({
      sourceType: "evidence-action",
      sourceId: actionId,
      note: note || message,
      refs: atom?.assetRefs || [],
    }),
  });
}

function summarizeRois(rois = []) {
  return (Array.isArray(rois) ? rois : []).map((roi) => ({
    id: roi.id,
    name: roi.name,
    risk: round(Number(roi.risk) || 0, 3),
    signal: round(Number(roi.signal) || 0, 3),
    cloud: round(Number(roi.cloud) || 0, 3),
    area: Number(roi.area) || 0,
    box: clone(roi.box || {}),
    detectionConfidence: round(Number(roi.detectionConfidence) || 0, 3),
    detectionMode: roi.detectionMode || "unknown",
  }));
}

function latestObservationByAction(state, actionId) {
  const evidence = Array.isArray(state?.observations?.evidence) ? state.observations.evidence : [];
  for (let index = evidence.length - 1; index >= 0; index -= 1) {
    const observation = evidence[index];
    if (observation?.provenance?.sourceId === actionId) {
      return observation;
    }
  }
  return null;
}

function latestPayload(state, actionId, fallback = {}) {
  return latestObservationByAction(state, actionId)?.payload || fallback;
}

function currentRoiList(scenario) {
  return Array.isArray(scenario?.rois) ? scenario.rois : [];
}

function buildStaticMaskRegions(scenario) {
  const reviewed = matchReviewedBenchmarkCase(scenario);
  if (reviewed?.available && Array.isArray(reviewed.referenceRegions) && reviewed.referenceRegions.length) {
    return {
      source: reviewed.label,
      regions: reviewed.referenceRegions.map((entry) => ({
        id: entry.id,
        label: entry.label,
        box: clone(entry.box),
      })),
    };
  }

  if (Array.isArray(scenario?.fallbackRois) && scenario.fallbackRois.length) {
    return {
      source: "scenario-fallback-rois",
      regions: scenario.fallbackRois.map((entry) => ({
        id: entry.id,
        label: entry.name,
        box: clone(entry.box),
      })),
    };
  }

  return {
    source: "no-static-mask",
    regions: [],
  };
}

async function chooseVisualSource({ scenario, atom }) {
  if (!scenario?.imagery?.sourceLabel) {
    failAction("choose_visual_source", atom, "当前场景还没有可用底图来源。", {
      code: "visual_source_missing",
    });
  }

  return buildObservationResult(
    "choose_visual_source",
    atom,
    "scene_summary",
    {
      sourceLabel: scenario.imagery.sourceLabel,
      note: scenario.imagery.note || "",
      decloudPreviewAvailable: Boolean(scenario.imagery.decloudPreviewAvailable),
      supplementalPreviewAvailable: Boolean(scenario.imagery.supplementalPreview?.available),
      alignment: clone(scenario.analysis?.alignment || {}),
    },
    {
      confidence: clamp((scenario.analysis?.alignment?.score || 0.55) * 0.9 + 0.15, 0.35, 0.96),
      uncertainty: clamp(1 - (scenario.analysis?.alignment?.score || 0.55), 0.04, 0.62),
      note: "复用当前场景已经选定的底图来源，不重写现有 showcase 底图选择链。",
    }
  );
}

async function fetchCloudGuidance({ scenario, atom }) {
  const cloudMask = scenario?.analysis?.cloudMask || null;
  return buildObservationResult(
    "fetch_cloud_guidance",
    atom,
    "mask",
    {
      cloudMaskFiles: Number(cloudMask?.itemCount) || 0,
      cloudMaskConfidence: round(Number(cloudMask?.confidence) || 0, 3),
      estimatedCoverage: round(Number(cloudMask?.estimatedCoverage) || 0, 3),
      decloudApplied: Boolean(scenario?.analysis?.decloudApplied),
      validPixelRatio: round(Number(scenario?.analysis?.validPixelRatio) || 0, 3),
    },
    {
      confidence: clamp((Number(cloudMask?.confidence) || 0.45) * 0.8 + 0.16, 0.3, 0.9),
      uncertainty: clamp(1 - (Number(scenario?.analysis?.validPixelRatio) || 0.4), 0.08, 0.82),
      note: "使用当前场景已经生成的云导引与去云摘要，不额外破坏成熟去云链。",
    }
  );
}

async function buildValidRegion({ scenario, atom }) {
  const validRegion = getAnalysisValidRegion(scenario?.analysis);
  if (!validRegion) {
    failAction("build_valid_region", atom, "当前场景没有可用的 validRegion。", {
      code: "valid_region_missing",
    });
  }

  const total = Math.max(1, validRegion.width * validRegion.height);
  const validCount = validRegion.validMask.reduce((sum, value) => sum + (value === 1 ? 1 : 0), 0);
  const surfaceCount = validRegion.surfaceMask instanceof Uint8Array
    ? validRegion.surfaceMask.reduce((sum, value) => sum + (value === 1 ? 1 : 0), 0)
    : 0;

  return buildObservationResult(
    "build_valid_region",
    atom,
    "mask",
    {
      width: validRegion.width,
      height: validRegion.height,
      validPct: round(validCount / total, 4),
      missingPct: round(1 - validCount / total, 4),
      surfaceMaskPct: round(surfaceCount / total, 4),
      hasCloudMask: validRegion.cloudMask instanceof Uint8Array,
      hasSurfaceMask: validRegion.surfaceMask instanceof Uint8Array,
      source: validRegion.source || "analysis-grid",
    },
    {
      confidence: clamp((validCount / total) * 0.82 + 0.12, 0.28, 0.96),
      uncertainty: clamp(1 - validCount / total, 0.04, 0.88),
      note: "当前 validRegion 沿用成熟遥感执行层的定义，planner 只做显式消费，不重算掩膜。",
    }
  );
}

async function requestHighresSupport({ scenario, atom }) {
  const support = scenario?.imagery?.supplementalPreview || null;
  return buildObservationResult(
    "request_highres_support",
    atom,
    "scene_summary",
    {
      available: Boolean(support?.available),
      sourceLabel: support?.sourceLabel || support?.label || "Sentinel opportunity",
      observationLabel: support?.observationLabel || "",
      cloudCover: Number(support?.cloudCover) || null,
      previewUrl: support?.previewUrl || support?.src || "",
      sameLocalDay: Boolean(support?.sameLocalDay),
    },
    {
      confidence: support?.available ? 0.78 : 0.32,
      uncertainty: support?.available ? 0.24 : 0.68,
      note: support?.available
        ? "命中局部高分补充链，可在高不确定场景下作为解释或局部 refine 证据。"
        : "当前场景没有可用的高分补充图，不作为强制失败条件。",
    }
  );
}

async function uncertaintyCheck({ scenario, atom, state }) {
  const contradictions = Array.isArray(state?.epistemic?.contradictions) ? state.epistemic.contradictions : [];
  const missingEvidence = Array.isArray(state?.epistemic?.missingEvidence) ? state.epistemic.missingEvidence : [];
  const overallUncertainty = clamp(Number(state?.epistemic?.uncertaintyMap?.overall) || 0.5, 0, 1);
  const roiCount =
    latestPayload(state, "cluster_hotspots", latestPayload(state, "reject_water_like_candidates", latestPayload(state, "score_dust_candidates", {})))
      ?.rois?.length || 0;
  const abstainRecommended = roiCount === 0 && overallUncertainty >= 0.4;

  return buildObservationResult(
    "uncertainty_check",
    atom,
    "scene_summary",
    {
      overallUncertainty: round(overallUncertainty, 4),
      contradictions: contradictions.slice(),
      missingEvidence: missingEvidence.slice(),
      abstainRecommended,
      roiCount,
      stopReasonCandidate: abstainRecommended ? "insufficient_evidence" : null,
    },
    {
      confidence: clamp(1 - overallUncertainty * 0.72, 0.28, 0.9),
      uncertainty: overallUncertainty,
      note: "把冲突证据、缺失证据和当前 roi 产出显式暴露给 planner，用于 stop/degrade/abstain 决策。",
    }
  );
}

async function packageResult({ scenario, atom, state }) {
  const hotspotPayload = latestPayload(state, "local_burned_area_refine", latestPayload(state, "cluster_hotspots", {}));
  const dustPayload = latestPayload(state, "dust_window_fallback", latestPayload(state, "reject_water_like_candidates", latestPayload(state, "score_dust_candidates", {})));
  const finalPayload = scenario.type === "wildfire" ? hotspotPayload : dustPayload;
  const rois = Array.isArray(finalPayload?.rois) ? finalPayload.rois : [];
  const overallUncertainty = clamp(Number(state?.epistemic?.uncertaintyMap?.overall) || 0.5, 0, 1);

  return buildObservationResult(
    "package_result",
    atom,
    "scene_summary",
    {
      rois: summarizeRois(rois),
      confidence: round(Number(finalPayload?.confidence) || clamp(1 - overallUncertainty, 0.12, 0.9), 4),
      abstained: Boolean(finalPayload?.abstained || (!rois.length && overallUncertainty >= 0.42)),
      stopReason: state?.epistemic?.stopReason || null,
      evidenceKinds: (state?.observations?.evidence || []).map((item) => item.kind),
    },
    {
      confidence: clamp(Number(finalPayload?.confidence) || 0.52, 0.18, 0.96),
      uncertainty: overallUncertainty,
      note: "把 planner 最终结果包装成结构化 scene_summary，供旧 workflow 与新 benchmark 复用。",
    }
  );
}

async function fetchViirsActiveFire({ scenario, atom }) {
  if (scenario?.type !== "wildfire") {
    failAction("fetch_viirs_active_fire", atom, "该动作只支持 wildfire 任务。", {
      code: "unsupported_task",
      retryable: false,
    });
  }

  const rois = currentRoiList(scenario);
  return buildObservationResult(
    "fetch_viirs_active_fire",
    atom,
    "hotspots",
    {
      sourceLabel: scenario?.analysis?.sourceLabel || "VIIRS thermal anomalies",
      rois: summarizeRois(rois),
      hotspotStrength: round(
        rois.length
          ? rois.reduce((sum, roi) => sum + ((Number(roi.risk) || 0) * 0.6 + (Number(roi.signal) || 0) * 0.4), 0) / rois.length
          : 0,
        4
      ),
    },
    {
      confidence: clamp(Number(scenario?.radiometricQuality) || 0.72, 0.34, 0.95),
      uncertainty: clamp(1 - (Number(scenario?.analysis?.validPixelRatio) || 0.6), 0.08, 0.68),
      note: "复用现有成熟的 VIIRS 热异常候选区，不改动当前可演示热异常检测链。",
    }
  );
}

async function fetchStaticThermalAnomalyMask({ scenario, atom }) {
  if (scenario?.type !== "wildfire") {
    failAction("fetch_static_thermal_anomaly_mask", atom, "该动作只支持 wildfire 任务。", {
      code: "unsupported_task",
      retryable: false,
    });
  }

  const staticMask = buildStaticMaskRegions(scenario);
  return buildObservationResult(
    "fetch_static_thermal_anomaly_mask",
    atom,
    "mask",
    {
      sourceLabel: staticMask.source,
      regions: staticMask.regions.map((entry) => ({
        id: entry.id,
        label: entry.label,
        box: clone(entry.box),
      })),
    },
    {
      confidence: staticMask.regions.length ? 0.62 : 0.34,
      uncertainty: staticMask.regions.length ? 0.32 : 0.66,
      note: "第一版静态热异常掩膜优先复用 reviewed case 或场景 fallback，作为 persistent hotspot prior。",
    }
  );
}

async function temporalPersistenceCheck({ scenario, atom, geoMemory }) {
  if (scenario?.type !== "wildfire") {
    failAction("temporal_persistence_check", atom, "该动作只支持 wildfire 任务。", {
      code: "unsupported_task",
      retryable: false,
    });
  }

  const hits = readGeoMemory(geoMemory, {
    scope: "dynamic",
    task: "wildfire",
    bbox: scenario?.focusSelection?.bbox || scenario?.imageryProfile?.bbox,
    timeAnchor: scenario?.observation?.iso,
    timeWindowDays: 3,
    kinds: ["hotspot_summary", "evidence_hotspots"],
  });
  const persistenceScore = clamp(hits.length * 0.18, 0, 0.82);

  return buildObservationResult(
    "temporal_persistence_check",
    atom,
    "scene_summary",
    {
      matchedCount: hits.length,
      persistenceScore: round(persistenceScore, 4),
      samples: hits.slice(0, 3).map((entry) => ({
        id: entry.id,
        timeAnchor: entry.timeAnchor,
        uncertainty: entry.uncertainty,
      })),
    },
    {
      confidence: hits.length ? clamp(0.52 + persistenceScore * 0.34, 0.42, 0.88) : 0.3,
      uncertainty: hits.length ? clamp(0.48 - persistenceScore * 0.22, 0.18, 0.52) : 0.72,
      note: hits.length
        ? "从轻量 tile-time memory 检索到近期 hotspot summary，用作时间连续性证据。"
        : "当前 tile-time memory 中还没有近期热点摘要，时间连续性证据缺失。",
    }
  );
}

async function clusterHotspots({ scenario, atom, state }) {
  if (scenario?.type !== "wildfire") {
    failAction("cluster_hotspots", atom, "该动作只支持 wildfire 任务。", {
      code: "unsupported_task",
      retryable: false,
    });
  }

  const activeFire = latestPayload(state, "fetch_viirs_active_fire", {});
  const staticMask = latestPayload(state, "fetch_static_thermal_anomaly_mask", {});
  const temporal = latestPayload(state, "temporal_persistence_check", {});
  const validRegion = getAnalysisValidRegion(scenario?.analysis);
  const staticRegions = Array.isArray(staticMask?.regions) ? staticMask.regions : [];
  const hotspots = Array.isArray(activeFire?.rois) ? activeFire.rois : summarizeRois(currentRoiList(scenario));

  const rois = hotspots.map((roi) => {
    const staticOverlap = staticRegions.reduce((maxValue, region) => Math.max(maxValue, roiIoU(roi.box, region.box)), 0);
    const waterPenalty = validRegion?.surfaceMask ? maskCoverageForRoi(roi.box, validRegion) * 0.35 : 0;
    const temporalBoost = clamp(Number(temporal?.persistenceScore) || 0, 0, 0.5);
    const score = clamp(
      (Number(roi.detectionConfidence) || Number(roi.risk) || 0.55) * 0.55 +
        (Number(roi.signal) || 0.5) * 0.2 +
        temporalBoost * 0.18 -
        staticOverlap * 0.12 -
        waterPenalty,
      0.05,
      0.99
    );

    return {
      ...roi,
      plannerScore: round(score, 4),
      staticOverlap: round(staticOverlap, 4),
      temporalBoost: round(temporalBoost, 4),
      waterPenalty: round(waterPenalty, 4),
    };
  });

  const confidence = rois.length
    ? round(rois.reduce((sum, roi) => sum + roi.plannerScore, 0) / rois.length, 4)
    : 0.22;

  return buildObservationResult(
    "cluster_hotspots",
    atom,
    "hotspots",
    {
      rois: summarizeRois(
        rois.map((roi) => ({
          ...roi,
          detectionConfidence: roi.plannerScore,
          detectionMode: "planner-clustered-hotspots",
        }))
      ),
      confidence,
      abstained: rois.length === 0,
      staticMaskSource: staticMask?.sourceLabel || "",
      temporalPersistenceScore: round(Number(temporal?.persistenceScore) || 0, 4),
    },
    {
      confidence: clamp(confidence, 0.18, 0.94),
      uncertainty: clamp(1 - confidence, 0.08, 0.72),
      note: "在不改变现有热异常初筛的前提下，planner 用静态掩膜和时间连续性重新给热点簇排序。",
    }
  );
}

async function localBurnedAreaRefine({ atom, state }) {
  const highres = latestPayload(state, "request_highres_support", {});
  const clustered = latestPayload(state, "cluster_hotspots", {});
  const rois = Array.isArray(clustered?.rois) ? clustered.rois : [];
  const refined = Boolean(highres?.available) && rois.length > 0;
  const refinedRois = refined
    ? rois.map((roi, index) => ({
        ...roi,
        detectionConfidence: round(clamp((Number(roi.detectionConfidence) || 0.55) + 0.05 - index * 0.01, 0.08, 0.98), 4),
        detectionMode: "planner-local-refine",
      }))
    : rois;
  const confidence = refined
    ? round(refinedRois.reduce((sum, roi) => sum + (Number(roi.detectionConfidence) || 0.55), 0) / Math.max(1, refinedRois.length), 4)
    : round(Number(clustered?.confidence) || 0.46, 4);

  return buildObservationResult(
    "local_burned_area_refine",
    atom,
    "hotspots",
    {
      rois: summarizeRois(refinedRois),
      refined,
      confidence,
      sourceLabel: highres?.sourceLabel || "",
      abstained: refinedRois.length === 0,
    },
    {
      confidence: clamp(confidence, 0.18, 0.96),
      uncertainty: clamp(1 - confidence, 0.06, 0.8),
      note: refined
        ? "高分补充可用时，planner 只做轻量 refine，不替换当前成熟热异常 detector。"
        : "高分补充不可用或无必要时，维持 cluster_hotspots 结果。",
    }
  );
}

async function fetchLandWaterMask({ scenario, atom }) {
  if (scenario?.type !== "dust") {
    failAction("fetch_land_water_mask", atom, "该动作只支持 dust 任务。", {
      code: "unsupported_task",
      retryable: false,
    });
  }

  const validRegion = getAnalysisValidRegion(scenario?.analysis);
  const screening = scenario?.analysis?.dustScreening || {};
  const total = validRegion?.surfaceMask instanceof Uint8Array ? validRegion.surfaceMask.length : 0;
  const masked = total ? validRegion.surfaceMask.reduce((sum, value) => sum + (value === 1 ? 1 : 0), 0) : 0;

  return buildObservationResult(
    "fetch_land_water_mask",
    atom,
    "mask",
    {
      available: Boolean(validRegion?.surfaceMask instanceof Uint8Array),
      sourceLabel: screening?.sourceLabel || "surface-mask-unavailable",
      screenedRatio: round(Number(screening?.screenedRatio) || (total ? masked / total : 0), 4),
    },
    {
      confidence: validRegion?.surfaceMask instanceof Uint8Array ? 0.76 : 0.28,
      uncertainty: validRegion?.surfaceMask instanceof Uint8Array ? 0.18 : 0.72,
      note: "dust planner 复用当前链路已经生成的水体 screening 与 validRegion surfaceMask。",
    }
  );
}

async function fetchDustSupportPriors({ scenario, atom }) {
  if (scenario?.type !== "dust") {
    failAction("fetch_dust_support_priors", atom, "该动作只支持 dust 任务。", {
      code: "unsupported_task",
      retryable: false,
    });
  }

  const support = scenario?.analysis?.dustSupport || {};
  return buildObservationResult(
    "fetch_dust_support_priors",
    atom,
    "scene_summary",
    {
      available: Boolean(support?.sourceLabel),
      sourceLabel: support?.sourceLabel || "",
      supportRatio: round(Number(support?.supportRatio) || 0, 4),
      sources: Array.isArray(support?.sources) ? support.sources.slice(0, 3) : [],
    },
    {
      confidence: support?.sourceLabel ? 0.72 : 0.26,
      uncertainty: support?.sourceLabel ? 0.24 : 0.74,
      note: "优先使用当前场景已经接入的 dust prior 支持层，不额外引入新的 detector。",
    }
  );
}

async function scoreDustCandidates({ scenario, atom, state }) {
  if (scenario?.type !== "dust") {
    failAction("score_dust_candidates", atom, "该动作只支持 dust 任务。", {
      code: "unsupported_task",
      retryable: false,
    });
  }

  const support = latestPayload(state, "fetch_dust_support_priors", {});
  const validRegion = getAnalysisValidRegion(scenario?.analysis);
  const validPct = round(Number(scenario?.analysis?.validPixelRatio) || 0, 4);
  const rois = summarizeRois(currentRoiList(scenario)).map((roi) => {
    const base = (Number(roi.detectionConfidence) || Number(roi.risk) || 0.5) * 0.56 + (Number(roi.signal) || 0.48) * 0.24;
    const supportBoost = clamp((Number(support?.supportRatio) || 0) * 0.16, 0, 0.14);
    const validBoost = validPct >= 0.45 ? 0.06 : validPct >= 0.3 ? 0.02 : -0.05;
    const missingPenalty = validRegion?.surfaceMask ? maskCoverageForRoi(roi.box, validRegion) * 0.08 : 0;
    const score = clamp(base + supportBoost + validBoost - missingPenalty, 0.04, 0.98);
    return {
      ...roi,
      plannerScore: round(score, 4),
      supportBoost: round(supportBoost, 4),
      validBoost: round(validBoost, 4),
      missingPenalty: round(missingPenalty, 4),
    };
  });

  const confidence = rois.length
    ? round(rois.reduce((sum, roi) => sum + roi.plannerScore, 0) / rois.length, 4)
    : 0.2;

  return buildObservationResult(
    "score_dust_candidates",
    atom,
    "roi_scores",
    {
      rois: summarizeRois(
        rois.map((roi) => ({
          ...roi,
          detectionConfidence: roi.plannerScore,
          detectionMode: "planner-dust-score",
        }))
      ),
      confidence,
      validPct,
    },
    {
      confidence: clamp(confidence, 0.16, 0.92),
      uncertainty: clamp(1 - confidence, 0.08, 0.82),
      note: "在现有 dust 候选区之上叠加 validRegion 与 dust prior 的显式评分，而不是替换主 detector。",
    }
  );
}

async function rejectWaterLikeCandidates({ scenario, atom, state }) {
  if (scenario?.type !== "dust") {
    failAction("reject_water_like_candidates", atom, "该动作只支持 dust 任务。", {
      code: "unsupported_task",
      retryable: false,
    });
  }

  const scored = latestPayload(state, "score_dust_candidates", {});
  const landWater = latestPayload(state, "fetch_land_water_mask", {});
  const temporal = latestPayload(state, "temporal_continuation_check", {});
  const validRegion = getAnalysisValidRegion(scenario?.analysis);
  const sourceRois = Array.isArray(scored?.rois) ? scored.rois : [];
  const continuationScore = Number(temporal?.continuationScore) || 0;
  const filtered = [];
  const vetoed = [];

  for (const roi of sourceRois) {
    const waterCoverage = validRegion?.surfaceMask ? maskCoverageForRoi(roi.box, validRegion) : 0;
    const lowSupport = (Number(roi.detectionConfidence) || 0) < 0.34;
    const uncertainWaterLike = waterCoverage >= 0.08 && continuationScore < 0.18 && lowSupport;
    const hardVeto = waterCoverage >= 0.16 || (landWater?.available && waterCoverage >= 0.1 && continuationScore < 0.12);

    if (hardVeto || uncertainWaterLike) {
      vetoed.push({
        id: roi.id,
        waterCoverage: round(waterCoverage, 4),
      });
      continue;
    }

    filtered.push({
      ...roi,
      waterCoverage: round(waterCoverage, 4),
      detectionConfidence: round(
        clamp((Number(roi.detectionConfidence) || 0.5) + continuationScore * 0.08 - waterCoverage * 0.12, 0.04, 0.98),
        4
      ),
      detectionMode: "planner-dust-vetoed",
    });
  }

  const confidence = filtered.length
    ? round(filtered.reduce((sum, roi) => sum + (Number(roi.detectionConfidence) || 0.45), 0) / filtered.length, 4)
    : 0.18;
  const abstained = filtered.length === 0 && sourceRois.length > 0;

  return buildObservationResult(
    "reject_water_like_candidates",
    atom,
    "roi_scores",
    {
      rois: summarizeRois(filtered),
      vetoed,
      confidence,
      abstained,
      reason: abstained ? "all_candidates_rejected_by_water_or_uncertainty" : null,
    },
    {
      confidence: clamp(confidence, 0.14, 0.92),
      uncertainty: clamp(1 - confidence + (abstained ? 0.14 : 0), 0.08, 0.92),
      note: "这一步把 dust support/screening 从软加权推进为硬 veto 与 uncertainty-aware veto。",
    }
  );
}

async function temporalContinuationCheck({ scenario, atom, geoMemory }) {
  if (scenario?.type !== "dust") {
    failAction("temporal_continuation_check", atom, "该动作只支持 dust 任务。", {
      code: "unsupported_task",
      retryable: false,
    });
  }

  const hits = readGeoMemory(geoMemory, {
    scope: "dynamic",
    task: "dust",
    bbox: scenario?.focusSelection?.bbox || scenario?.imageryProfile?.bbox,
    timeAnchor: scenario?.observation?.iso,
    timeWindowDays: 3,
    kinds: ["dust_summary", "evidence_dust_candidates"],
  });
  const continuationScore = clamp(hits.length * 0.16, 0, 0.78);

  return buildObservationResult(
    "temporal_continuation_check",
    atom,
    "scene_summary",
    {
      matchedCount: hits.length,
      continuationScore: round(continuationScore, 4),
      samples: hits.slice(0, 3).map((entry) => ({
        id: entry.id,
        timeAnchor: entry.timeAnchor,
        uncertainty: entry.uncertainty,
      })),
    },
    {
      confidence: hits.length ? clamp(0.48 + continuationScore * 0.34, 0.38, 0.86) : 0.28,
      uncertainty: hits.length ? clamp(0.56 - continuationScore * 0.2, 0.18, 0.56) : 0.74,
      note: hits.length
        ? "从 tile-time memory 中找到了近期 dust summary，可用于时序连续性校验。"
        : "当前没有可用的近期 dust summary，时序连续性证据缺失。",
    }
  );
}

async function dustWindowFallback({ scenario, atom, state }) {
  if (scenario?.type !== "dust") {
    failAction("dust_window_fallback", atom, "该动作只支持 dust 任务。", {
      code: "unsupported_task",
      retryable: false,
    });
  }

  const filtered = latestPayload(state, "reject_water_like_candidates", {});
  const temporal = latestPayload(state, "temporal_continuation_check", {});
  const support = latestPayload(state, "fetch_dust_support_priors", {});
  const currentRois = Array.isArray(filtered?.rois) ? filtered.rois : [];
  const fallbackCandidates = (Array.isArray(scenario?.rois) ? scenario.rois : [])
    .filter((roi) => String(roi?.detectionMode || "").includes("window"))
    .map((roi) => ({
      ...clone(roi),
      detectionConfidence: round(clamp((Number(roi.detectionConfidence) || Number(roi.risk) || 0.42) + 0.04, 0.06, 0.82), 4),
      detectionMode: "planner-window-fallback",
    }));

  const allowFallback =
    currentRois.length === 0 &&
    (Number(temporal?.continuationScore) || 0) >= 0.12 &&
    (Number(support?.supportRatio) || 0) >= 0.08 &&
    fallbackCandidates.length > 0;
  const rois = allowFallback ? fallbackCandidates.slice(0, scenario?.analysisProfile?.maxRois || 3) : currentRois;
  const confidence = rois.length
    ? round(rois.reduce((sum, roi) => sum + (Number(roi.detectionConfidence) || 0.45), 0) / rois.length, 4)
    : 0.16;
  const abstained = rois.length === 0;

  return buildObservationResult(
    "dust_window_fallback",
    atom,
    "roi_scores",
    {
      rois: summarizeRois(rois),
      fallbackUsed: allowFallback,
      confidence,
      abstained,
      stopReason: abstained ? "dust_ambiguous_after_veto" : null,
    },
    {
      confidence: clamp(confidence, 0.14, 0.84),
      uncertainty: clamp(1 - confidence + (allowFallback ? 0.04 : 0.16), 0.08, 0.94),
      note: allowFallback
        ? "只有在时序连续性和 dust prior 都给出支持时，才允许保守启用 dust window fallback。"
        : "当 dust 与 water/cloud/bright surface 难以区分时，planner 优先 abstain 或 degrade，不硬报。",
    }
  );
}

export const evidenceActionRegistry = {
  choose_visual_source: {
    id: "choose_visual_source",
    label: "选择底图上下文",
    group: "visual",
    supportedTasks: ["wildfire", "dust"],
    prerequisites: [],
    execute: chooseVisualSource,
  },
  fetch_cloud_guidance: {
    id: "fetch_cloud_guidance",
    label: "获取云导引",
    group: "quality",
    supportedTasks: ["wildfire", "dust"],
    prerequisites: [],
    execute: fetchCloudGuidance,
  },
  build_valid_region: {
    id: "build_valid_region",
    label: "构建有效区域",
    group: "quality",
    supportedTasks: ["wildfire", "dust"],
    prerequisites: ["fetch_cloud_guidance"],
    execute: buildValidRegion,
  },
  request_highres_support: {
    id: "request_highres_support",
    label: "请求高分补充",
    group: "highres",
    supportedTasks: ["wildfire", "dust"],
    prerequisites: [],
    execute: requestHighresSupport,
  },
  uncertainty_check: {
    id: "uncertainty_check",
    label: "不确定性检查",
    group: "finalize",
    supportedTasks: ["wildfire", "dust"],
    prerequisites: [],
    execute: uncertaintyCheck,
  },
  package_result: {
    id: "package_result",
    label: "封装 planner 结果",
    group: "finalize",
    supportedTasks: ["wildfire", "dust"],
    prerequisites: ["uncertainty_check"],
    execute: packageResult,
  },
  fetch_viirs_active_fire: {
    id: "fetch_viirs_active_fire",
    label: "获取 VIIRS 热异常",
    group: "thermal",
    supportedTasks: ["wildfire"],
    prerequisites: ["build_valid_region"],
    execute: fetchViirsActiveFire,
  },
  fetch_static_thermal_anomaly_mask: {
    id: "fetch_static_thermal_anomaly_mask",
    label: "获取静态热异常掩膜",
    group: "static-prior",
    supportedTasks: ["wildfire"],
    prerequisites: [],
    execute: fetchStaticThermalAnomalyMask,
  },
  temporal_persistence_check: {
    id: "temporal_persistence_check",
    label: "热异常时间连续性检查",
    group: "temporal",
    supportedTasks: ["wildfire"],
    prerequisites: [],
    execute: temporalPersistenceCheck,
  },
  cluster_hotspots: {
    id: "cluster_hotspots",
    label: "热点聚类",
    group: "thermal",
    supportedTasks: ["wildfire"],
    prerequisites: ["fetch_viirs_active_fire", "build_valid_region"],
    execute: clusterHotspots,
  },
  local_burned_area_refine: {
    id: "local_burned_area_refine",
    label: "局部高分 refine",
    group: "highres",
    supportedTasks: ["wildfire"],
    prerequisites: ["cluster_hotspots"],
    execute: localBurnedAreaRefine,
  },
  fetch_land_water_mask: {
    id: "fetch_land_water_mask",
    label: "获取陆水掩膜",
    group: "screening",
    supportedTasks: ["dust"],
    prerequisites: ["build_valid_region"],
    execute: fetchLandWaterMask,
  },
  fetch_dust_support_priors: {
    id: "fetch_dust_support_priors",
    label: "获取沙尘先验",
    group: "support-prior",
    supportedTasks: ["dust"],
    prerequisites: [],
    execute: fetchDustSupportPriors,
  },
  score_dust_candidates: {
    id: "score_dust_candidates",
    label: "评分沙尘候选区",
    group: "dust-score",
    supportedTasks: ["dust"],
    prerequisites: ["fetch_dust_support_priors", "build_valid_region"],
    execute: scoreDustCandidates,
  },
  reject_water_like_candidates: {
    id: "reject_water_like_candidates",
    label: "剔除水体样候选区",
    group: "screening",
    supportedTasks: ["dust"],
    prerequisites: ["score_dust_candidates", "fetch_land_water_mask"],
    execute: rejectWaterLikeCandidates,
  },
  temporal_continuation_check: {
    id: "temporal_continuation_check",
    label: "沙尘时间连续性检查",
    group: "temporal",
    supportedTasks: ["dust"],
    prerequisites: [],
    execute: temporalContinuationCheck,
  },
  dust_window_fallback: {
    id: "dust_window_fallback",
    label: "沙尘窗口回退",
    group: "fallback",
    supportedTasks: ["dust"],
    prerequisites: ["reject_water_like_candidates", "temporal_continuation_check"],
    execute: dustWindowFallback,
  },
};

export async function executeEvidenceAction(actionId, context = {}) {
  const entry = evidenceActionRegistry[actionId];
  if (!entry) {
    throw new PlannerActionError({
      actionId,
      code: "unknown_planner_action",
      message: `Unknown planner action: ${actionId}`,
      retryable: false,
    });
  }

  return entry.execute(context);
}
