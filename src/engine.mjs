import { workflowLibrary, toolCatalog } from "./workflows.mjs";

const POWER_BUDGETS = {
  constrained: 8.2,
  balanced: 10.5,
  burst: 13.5,
};

const DOWNLINK_LIMITS = {
  focused: 2,
  balanced: 3,
  full: 4,
};
const MEMORY_EPISODE_LIMIT = 8;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function sum(values) {
  return values.reduce((total, current) => total + current, 0);
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function finiteNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function riskScore(roi, scenario) {
  return round(roi.risk * 0.55 + roi.signal * 0.35 + (1 - roi.cloud) * 0.1 + scenario.anomalyDensity * 0.1, 3);
}

function roiDetectionConfidence(roi) {
  const explicit = Number(roi?.detectionConfidence);
  if (Number.isFinite(explicit)) {
    return explicit;
  }
  return round(clamp((Number(roi?.risk) || 0) * 0.52 + (Number(roi?.signal) || 0) * 0.48, 0, 0.99), 3);
}

function getPreferredWorkflowId(scenario, options) {
  if (scenario.type === "wildfire") {
    return "wildfire_hotspot_confirmation";
  }

  if (scenario.radiometricQuality < 0.56) {
    return "degraded_heatmap_only";
  }

  if (options.budgetMin <= 5 || options.powerMode === "constrained") {
    return scenario.type === "pollution" ? "pollution_standard" : "budget_guarded_fast";
  }

  if (scenario.type === "dust") {
    return "dust_priority";
  }

  return "pollution_standard";
}

function getMemoryRules(memory, scenario) {
  return memory.rules.filter((rule) => rule.scope === scenario.type);
}

function productLabel(product) {
  if (product === "anomaly-heatmap") {
    return "异常热区输出";
  }
  if (product === "thermal-hotspot-map") {
    return "热异常热点图";
  }
  return "连续反演结果";
}

function episodeSignature(entry = {}) {
  return [
    entry.taskId || "unknown",
    entry.scenarioId || "unknown",
    entry.focusSelection?.cacheKey || "preset",
    entry.observation?.dateValue || "unknown-date",
    String(entry.observation?.hour ?? "00"),
    entry.outputProduct || "none",
  ].join(":");
}

function buildEpisodeInsight(scenario, result) {
  if (!result?.success) {
    return "本次没有稳定产出，经验主要用于提醒后续任务避开失败路径。";
  }

  if ((result?.state?.repairs?.length ?? 0) > 0) {
    return `执行中触发 ${result.state.repairs.length} 次策略修复，最终仍输出${productLabel(result.state.outputProduct)}。`;
  }

  if (result?.state?.outputProduct === "anomaly-heatmap") {
    return "在质量受限条件下主动降级为热区结果，优先保证时效性和可交付性。";
  }

  if (result?.state?.outputProduct === "thermal-hotspot-map") {
    return (result?.metrics?.processedRois ?? 0) > 0
      ? `已确认 ${result?.metrics?.processedRois ?? 0} 个热异常热点簇，可直接进入局部复核或下游专题分析。`
      : "当前未检出稳定热异常热点，系统保留了无告警热点图，避免伪造热点结果。";
  }

  return `对 ${result?.metrics?.processedRois ?? 0} 个重点区域完成连续反演，结果可直接进入后续解释与下传。`;
}

function buildEpisodeEntry(scenario, options, plan, result, context = {}) {
  const observation = scenario?.observation ?? {};
  const focusSelection = scenario?.focusSelection
    ? {
        label: scenario.focusSelection.label,
        scaleLabel: scenario.focusSelection.scaleLabel,
        scaleKey: scenario.focusSelection.scaleKey,
        strategyText: scenario.focusSelection.strategyText,
        cacheKey: scenario.focusSelection.cacheKey,
        bbox: Array.isArray(scenario.focusSelection.bbox) ? [...scenario.focusSelection.bbox] : null,
      }
    : null;

  const entry = {
    id: [
      context.taskId || scenario?.type || "task",
      scenario?.id || "scenario",
      observation.dateValue || "date",
      String(observation.hour ?? 0).padStart(2, "0"),
      Date.now(),
    ].join(":"),
    recordedAt: new Date().toISOString(),
    taskId: context.taskId || scenario?.type || "unknown",
    scenarioId: scenario?.id || "unknown",
    baseScenarioId: scenario?.baseScenarioId || scenario?.id || "unknown",
    scenarioTitle: scenario?.title || "未命名场景",
    scenarioType: scenario?.type || "unknown",
    observation: {
      iso: observation.iso || null,
      dateValue: observation.dateValue || null,
      hour: finiteNumber(observation.hour, 0),
    },
    focusSelection,
    options: {
      budgetMin: finiteNumber(options?.budgetMin, 0),
      powerMode: options?.powerMode || "balanced",
      downlinkPolicy: options?.downlinkPolicy || "balanced",
    },
    workflow: {
      id: plan?.workflowId || "unknown",
      label: plan?.workflowLabel || "未命名工作流",
    },
    success: Boolean(result?.success),
    outputProduct: result?.state?.outputProduct || null,
    confidence: finiteNumber(result?.metrics?.confidence, 0),
    processedRois: finiteNumber(result?.metrics?.processedRois, 0),
    budgetUsage: finiteNumber(result?.metrics?.budgetUsage, 0),
    powerUsage: finiteNumber(result?.metrics?.powerUsage, 0),
    downlink: finiteNumber(result?.metrics?.downlink, 0),
    repairs: Array.isArray(result?.state?.repairs) ? [...result.state.repairs] : [],
    failures: Array.isArray(result?.state?.failures) ? [...result.state.failures] : [],
    insight: buildEpisodeInsight(scenario, result),
  };

  return {
    ...entry,
    signature: episodeSignature(entry),
  };
}

function recordMissionEpisode(memory, scenario, options, plan, result, context = {}) {
  const entry = buildEpisodeEntry(scenario, options, plan, result, context);
  const episodes = Array.isArray(memory?.episodes) ? memory.episodes.filter((item) => item.signature !== entry.signature) : [];
  episodes.unshift(entry);
  memory.episodes = episodes.slice(0, MEMORY_EPISODE_LIMIT);
  return entry;
}

function injectMemoryGuidance(steps, memory, scenario, planNotes) {
  const enriched = [...steps];
  const cloudRule = memory.rules.find(
    (rule) => rule.scope === scenario.type && rule.reason === "cloud_contamination"
  );

  if (cloudRule && !enriched.includes("cloud_mask")) {
    enriched.splice(1, 0, "cloud_mask");
    planNotes.push("根据历史经验，本次在质量筛查前预插云掩膜步骤。");
  }

  const downgradeRule = memory.rules.find(
    (rule) => rule.scope === scenario.type && rule.reason === "uncertainty_too_high"
  );

  if (downgradeRule && scenario.radiometricQuality < 0.6 && !enriched.includes("generate_heatmap_only")) {
    planNotes.push("历史记录提示：在低质量光照条件下，更稳妥的做法通常是降级为热区结果。");
  }

  return enriched;
}

function planMission(scenario, options, memory) {
  const planNotes = [];
  const workflowId = getPreferredWorkflowId(scenario, options);
  const template = workflowLibrary[workflowId];
  const memoryHints = getMemoryRules(memory, scenario);
  const steps = injectMemoryGuidance(template.steps, memory, scenario, planNotes);

  if (options.downlinkPolicy === "focused") {
    planNotes.push("当前采用重点区域下传策略，系统会主动压缩处理区域数量。");
  }

  if (options.budgetMin <= scenario.defaultBudgetMin - 1) {
    planNotes.push("当前时延预算比场景默认值更紧，流程会优先选择更快的处理路径。");
  }

  if (memoryHints.length === 0) {
    planNotes.push("当前还没有该类任务的修复经验，本次主要依赖在线诊断。");
  }

  return {
    workflowId,
    workflowLabel: template.label,
    steps,
    notes: planNotes,
  };
}

function createInitialState(scenario, options, plan) {
  return {
    budgetMin: options.budgetMin,
    powerBudget: POWER_BUDGETS[options.powerMode],
    downlinkLimit: DOWNLINK_LIMITS[options.downlinkPolicy],
    consumedLatency: 0,
    consumedPower: 0,
    consumedDownlink: 0,
    effectiveCloud: scenario.cloudCover,
    effectiveQuality: scenario.radiometricQuality,
    candidateRois: [],
    selectedRois: [],
    processedRois: [],
    outputProduct: null,
    productQuality: 0,
    meanConfidence: 0,
    flags: {
      cloudMasked: false,
      degraded: false,
      fastMode: false,
    },
    repairs: [],
    notes: [...plan.notes],
    failures: [],
  };
}

function determineTargetCount(options) {
  const byPolicy = DOWNLINK_LIMITS[options.downlinkPolicy];
  const byBudget = options.budgetMin <= 5 ? 2 : options.budgetMin <= 7 ? 3 : 4;
  return Math.max(1, Math.min(byPolicy, byBudget));
}

function confidenceFor(roi, state, mode) {
  const base =
    roi.risk * 0.26 +
    roi.signal * 0.34 +
    state.effectiveQuality * 0.24 +
    (1 - Math.min(0.8, state.effectiveCloud + roi.cloud * 0.4)) * 0.16;

  const modifier = mode === "fast" ? -0.08 : 0;
  const degraded = state.flags.degraded ? -0.05 : 0;
  return round(Math.max(0.41, Math.min(0.96, base + modifier + degraded)));
}

function stepCost(stepId, scenario, roiCount) {
  switch (stepId) {
    case "ingest_scene":
      return { latency: 0.35, power: 0.45 };
    case "quality_screen":
      return { latency: 0.25, power: 0.2 };
    case "cloud_mask":
      return { latency: 0.62, power: 0.55 };
    case "detect_hotspots":
      return { latency: 0.72, power: 0.6 };
    case "detect_thermal_hotspots":
      return { latency: 0.48, power: 0.34 };
    case "prioritize_rois":
      return { latency: 0.18, power: 0.12 };
    case "dust_inversion_standard":
      return { latency: 0.4 + roiCount * 1.05, power: 0.58 + roiCount * 0.72 };
    case "pollution_inversion_standard":
      return { latency: 0.38 + roiCount * 0.92, power: 0.54 + roiCount * 0.67 };
    case "fast_roi_inversion":
      return { latency: 0.28 + roiCount * 0.52, power: 0.44 + roiCount * 0.42 };
    case "uncertainty_check":
      return { latency: 0.16, power: 0.1 };
    case "generate_heatmap_only":
      return { latency: 0.42, power: 0.28 };
    case "generate_thermal_alert_map":
      return { latency: 0.32, power: 0.22 };
    case "package_alert":
      return { latency: 0.12, power: 0.08 };
    default:
      return { latency: 0.2, power: 0.2 };
  }
}

function consume(state, cost) {
  state.consumedLatency = round(state.consumedLatency + cost.latency);
  state.consumedPower = round(state.consumedPower + cost.power);
}

function executeStep(stepId, scenario, options, state, mode = "agent") {
  if (stepId === "ingest_scene") {
    const cost = stepCost(stepId, scenario, 0);
    consume(state, cost);
    return {
      status: "ok",
      message: `已读取${scenario.sensor}场景，并接入${scenario.imagery?.sourceLabel ?? "当前遥感底图"}，完成 ${options.budgetMin} 分钟时延预算初始化。`,
    };
  }

  if (stepId === "quality_screen") {
    const cost = stepCost(stepId, scenario, 0);
    consume(state, cost);
    const cloudFailThreshold = scenario.type === "wildfire" ? 0.56 : 0.38;
    const qualityFailThreshold = scenario.type === "wildfire" ? 0.34 : 0.5;
    if (state.effectiveCloud > cloudFailThreshold && !state.flags.cloudMasked) {
      return {
        status: "failed",
        reason: "cloud_contamination",
        message: "云污染超过直接反演的安全阈值，需要先做云掩膜修复。",
      };
    }
    if (state.effectiveQuality < qualityFailThreshold) {
      return {
        status: "failed",
        reason: "low_radiometric_quality",
        message:
          scenario.type === "wildfire"
            ? "观测质量过低，当前不宜直接进入热点确认与后续复核。"
            : "辐射质量不足，无法稳定支撑定量反演。",
      };
    }
    return {
      status: "ok",
      message: `质量筛查通过，当前有效云量为 ${Math.round(state.effectiveCloud * 100)}%。`,
    };
  }

  if (stepId === "cloud_mask") {
    const cost = stepCost(stepId, scenario, 0);
    consume(state, cost);
    state.flags.cloudMasked = true;
    state.effectiveCloud = round(Math.max(0.08, state.effectiveCloud - 0.19));
    state.effectiveQuality = round(Math.min(0.92, state.effectiveQuality + 0.04));
    return {
      status: "ok",
      message: `已插入云掩膜步骤，有效云量降至 ${Math.round(state.effectiveCloud * 100)}%。`,
    };
  }

  if (stepId === "detect_hotspots" || stepId === "detect_thermal_hotspots") {
    const cost = stepCost(stepId, scenario, 0);
    consume(state, cost);
    const isThermalHotspotStep = stepId === "detect_thermal_hotspots";
    const candidateThreshold = isThermalHotspotStep ? 0.5 : 0.54;
    const detectionConfidenceThreshold = isThermalHotspotStep ? 0.44 : 0.56;
    state.candidateRois = clone(scenario.rois)
      .map((roi) => ({
        ...roi,
        detectionConfidence: roiDetectionConfidence(roi),
        score: riskScore(roi, scenario),
      }))
      .filter((roi) => roi.score >= candidateThreshold && roi.detectionConfidence >= detectionConfidenceThreshold)
      .sort((a, b) => b.score - a.score);

    if (state.candidateRois.length === 0) {
      state.notes.push(
        scenario.analysis?.abstentionReason || "当前没有形成稳定异常候选区，后续链路将保持空结果或主动降级。"
      );
      return {
        status: "ok",
        message: isThermalHotspotStep
          ? `${scenario.analysis?.summary ?? "已完成热异常热点确认"} 当前未识别到稳定热异常热点。`
          : `${scenario.analysis?.summary ?? "已完成异常检测"} 当前未识别到稳定异常候选区。`,
      };
    }

    return {
      status: "ok",
      message: isThermalHotspotStep
        ? `${scenario.analysis?.summary ?? "已完成热异常热点确认"} 共确认到 ${state.candidateRois.length} 个热点候选簇。`
        : `${scenario.analysis?.summary ?? "已完成异常检测"} 共识别到 ${state.candidateRois.length} 个候选异常区域。`,
    };
  }

  if (stepId === "prioritize_rois") {
    const cost = stepCost(stepId, scenario, 0);
    consume(state, cost);
    const targetCount = determineTargetCount(options);
    state.selectedRois = state.candidateRois.slice(0, targetCount);
    return {
      status: "ok",
      message: `在当前预算下，已选出 ${state.selectedRois.length} 个优先处理区域。`,
    };
  }

  if (
    stepId === "dust_inversion_standard" ||
    stepId === "pollution_inversion_standard" ||
    stepId === "fast_roi_inversion"
  ) {
    const selected = state.selectedRois.length ? state.selectedRois : state.candidateRois;
    if (selected.length === 0) {
      state.processedRois = [];
      state.outputProduct = "anomaly-heatmap";
      state.productQuality = 0;
      state.meanConfidence = 0;
      return {
        status: "ok",
        message: "当前没有稳定异常候选区，执行链路保持空结果输出。",
      };
    }

    let roiCount = selected.length || 1;
    if (stepId === "fast_roi_inversion") {
      roiCount = Math.min(roiCount, 2);
      state.flags.fastMode = true;
    }

    const cost = stepCost(stepId, scenario, roiCount);
    if (state.consumedLatency + cost.latency > state.budgetMin + 0.01) {
      return {
        status: "failed",
        reason: "budget_overrun",
        message: "按当前配置继续执行会超出时延预算。",
      };
    }

    consume(state, cost);

    if (
      stepId !== "fast_roi_inversion" &&
      scenario.lowContrast &&
      state.effectiveQuality < 0.58 &&
      mode === "agent"
    ) {
      return {
        status: "failed",
        reason: "uncertainty_too_high",
        message: "当前光照条件下，标准反演预计会得到低置信结果。",
      };
    }

    const processed = selected.slice(0, roiCount).map((roi) => ({
      ...roi,
      confidence: confidenceFor(roi, state, stepId === "fast_roi_inversion" ? "fast" : "standard"),
    }));

    state.processedRois = processed;
    state.outputProduct = "quantitative-retrieval";
    state.productQuality = processed.length
      ? round(sum(processed.map((roi) => roi.confidence)) / processed.length)
      : 0;
    state.meanConfidence = state.productQuality;

    return {
      status: "ok",
      message:
        stepId === "fast_roi_inversion"
          ? `已对 ${processed.length} 个区域完成快速反演。`
          : `已对 ${processed.length} 个区域完成标准反演。`,
    };
  }

  if (stepId === "uncertainty_check") {
    const cost = stepCost(stepId, scenario, 0);
    consume(state, cost);
    if (state.outputProduct === "quantitative-retrieval" && state.meanConfidence < 0.62) {
      return {
        status: "failed",
        reason: "uncertainty_too_high",
        message: "结果置信度低于告警产品下传阈值。",
      };
    }
    return {
      status: "ok",
      message: `结果置信度为 ${Math.round(state.meanConfidence * 100)}%，满足下传要求。`,
    };
  }

  if (stepId === "generate_heatmap_only") {
    const cost = stepCost(stepId, scenario, 0);
    consume(state, cost);
    state.flags.degraded = true;
    const selected = (state.selectedRois.length ? state.selectedRois : state.candidateRois).slice(0, 2);
    state.processedRois = selected.map((roi) => ({
      ...roi,
      confidence: round(Math.max(0.52, 0.48 + roi.risk * 0.22 + scenario.anomalyDensity * 0.12)),
    }));
    state.outputProduct = "anomaly-heatmap";
    state.productQuality = state.processedRois.length
      ? round(sum(state.processedRois.map((roi) => roi.confidence)) / state.processedRois.length)
      : 0;
    state.meanConfidence = state.productQuality;
    return {
      status: "ok",
      message: state.processedRois.length
        ? "已主动降级为异常热区输出，以优先保证时效性和可靠性。"
        : "当前没有稳定异常候选区，系统返回空热区结果以避免虚假报警。",
    };
  }

  if (stepId === "generate_thermal_alert_map") {
    const cost = stepCost(stepId, scenario, 0);
    consume(state, cost);
    const selected = state.selectedRois.length ? state.selectedRois : state.candidateRois;
    state.processedRois = selected.map((roi) => ({
      ...roi,
      confidence: round(
        Math.max(0.58, roi.risk * 0.3 + roi.signal * 0.28 + state.effectiveQuality * 0.22 + (1 - state.effectiveCloud) * 0.16)
      ),
    }));
    state.outputProduct = "thermal-hotspot-map";
    state.productQuality = state.processedRois.length
      ? round(sum(state.processedRois.map((roi) => roi.confidence)) / state.processedRois.length)
      : round(Math.max(0.52, state.effectiveQuality * 0.72 + (1 - state.effectiveCloud) * 0.18));
    state.meanConfidence = state.productQuality;
    return {
      status: "ok",
      message: state.processedRois.length
        ? `已生成 ${state.processedRois.length} 个热异常热点簇的确认图。`
        : "当前未检出稳定热异常热点，系统保留无告警热点图以避免虚假报警。",
    };
  }

  if (stepId === "package_alert") {
    const cost = stepCost(stepId, scenario, 0);
    consume(state, cost);
    const unitPayload =
      state.outputProduct === "anomaly-heatmap"
        ? 1.4
        : state.outputProduct === "thermal-hotspot-map"
          ? 1.8
          : 2.5;
    const roiPayload = Math.max(1, state.processedRois.length) * unitPayload;
    state.consumedDownlink = round(Math.min(scenario.bandwidthBudgetMb, 4 + roiPayload));
    return {
      status: "ok",
      message: `已封装本次输出，预计下传负载约 ${state.consumedDownlink} MB。`,
    };
  }

  return {
    status: "warn",
    message: "当前步骤未产生新的处理动作。",
  };
}

function deriveRepair(stepId, reason, scenario, state) {
  if (reason === "cloud_contamination" && !state.flags.cloudMasked) {
    return {
      type: "insert",
      newStep: "cloud_mask",
      summary: "在重新执行质量筛查前插入云掩膜步骤。",
      rule: { scope: scenario.type, reason, action: "insert_cloud_mask" },
    };
  }

  if (reason === "budget_overrun" && stepId !== "fast_roi_inversion") {
    return {
      type: "replace",
      newStep: "fast_roi_inversion",
      summary: "将标准反演替换为快速反演，并收缩处理区域数量。",
      rule: { scope: scenario.type, reason, action: "replace_with_fast_inversion" },
    };
  }

  if (reason === "low_radiometric_quality" || reason === "uncertainty_too_high") {
    return {
      type: "replace",
      newStep: "generate_heatmap_only",
      summary: "放弃当前定量反演，改为输出异常热区结果。",
      rule: { scope: scenario.type, reason, action: "degrade_to_heatmap" },
    };
  }

  return null;
}

function mergeMemory(memory, rule) {
  const existing = memory.rules.find(
    (entry) => entry.scope === rule.scope && entry.reason === rule.reason && entry.action === rule.action
  );

  if (existing) {
    existing.count += 1;
    return;
  }

  memory.rules.push({ ...rule, count: 1 });
}

function applyRepair(repair, steps, index, state, memory) {
  if (repair.type === "insert") {
    steps.splice(index, 0, repair.newStep);
  } else if (repair.type === "replace") {
    steps[index] = repair.newStep;
  }

  state.repairs.push(repair.summary);
  mergeMemory(memory, repair.rule);
}

function executeWorkflow(plan, scenario, options, memory, allowRepair, mode) {
  const state = createInitialState(scenario, options, plan);
  const steps = [...plan.steps];
  const logs = [];
  let success = true;
  let terminalReason = null;

  for (let index = 0; index < steps.length; index += 1) {
    const stepId = steps[index];
    const outcome = executeStep(stepId, scenario, options, state, mode);
    logs.push({
      type: "step",
      stepId,
      label: toolCatalog[stepId].label,
      status: outcome.status,
      message: outcome.message,
      latency: state.consumedLatency,
      power: state.consumedPower,
    });

    if (outcome.status === "failed") {
      state.failures.push(outcome.reason);

      if (allowRepair) {
        const repair = deriveRepair(stepId, outcome.reason, scenario, state);
        if (repair) {
          applyRepair(repair, steps, index, state, memory);
          logs.push({
            type: "repair",
            stepId: repair.newStep,
            label: toolCatalog[repair.newStep].label,
            status: "repair",
            message: repair.summary,
            latency: state.consumedLatency,
            power: state.consumedPower,
          });
          index -= 1;
          continue;
        }
      }

      success = false;
      terminalReason = outcome.reason;
      break;
    }
  }

  if (!state.outputProduct) {
    success = false;
    terminalReason ??= "no_product";
  }

  const budgetUsage = round((state.consumedLatency / state.budgetMin) * 100, 1);
  const powerUsage = round((state.consumedPower / state.powerBudget) * 100, 1);
  const scienceYield = round(
    (state.processedRois.length || 1) * (state.meanConfidence || 0.45) * (state.outputProduct === "anomaly-heatmap" ? 0.78 : 1),
    2
  );

  return {
    success,
    terminalReason,
    workflowSteps: steps,
    logs,
    state,
    metrics: {
      budgetUsage,
      powerUsage,
      downlink: state.consumedDownlink,
      processedRois: state.processedRois.length,
      confidence: round((state.meanConfidence || 0) * 100, 1),
      scienceYield,
    },
  };
}

export function createMemory() {
  return { rules: [], episodes: [] };
}

export function normalizeMemory(memory = {}) {
  const source = memory && typeof memory === "object" ? memory : {};
  return {
    rules: Array.isArray(source.rules) ? source.rules.map((rule) => ({ ...rule })) : [],
    episodes: Array.isArray(source.episodes) ? source.episodes.map((episode) => ({ ...episode })) : [],
  };
}

export function findRelevantEpisodes(
  memoryInput,
  { taskId = null, scaleKey = null, scenarioType = null, limit = 3 } = {}
) {
  const memory = normalizeMemory(memoryInput);
  return memory.episodes
    .map((episode) => {
      let score = 0;
      let matchedDimensions = 0;
      if (taskId && episode.taskId === taskId) {
        score += 4;
        matchedDimensions += 1;
      }
      if (scenarioType && episode.scenarioType === scenarioType) {
        score += 2;
        matchedDimensions += 1;
      }
      if (scaleKey && (episode.focusSelection?.scaleKey || "regional") === scaleKey) {
        score += 2;
        matchedDimensions += 1;
      }
      if (episode.success) {
        score += 0.6;
      }
      if ((episode.repairs?.length ?? 0) > 0) {
        score += 0.2;
      }
      return { ...episode, relevanceScore: round(score, 2), matchedDimensions };
    })
    .filter((episode) => episode.relevanceScore > 0 && episode.matchedDimensions > 0)
    .sort((left, right) => {
      if (right.relevanceScore !== left.relevanceScore) {
        return right.relevanceScore - left.relevanceScore;
      }
      return String(right.recordedAt || "").localeCompare(String(left.recordedAt || ""));
    })
    .slice(0, limit);
}

export function runAgentMission(scenario, options, memoryInput = createMemory(), context = {}) {
  const memory = normalizeMemory(clone(memoryInput));
  const plan = planMission(scenario, options, memory);
  const result = executeWorkflow(plan, scenario, options, memory, true, "agent");
  const episode = recordMissionEpisode(memory, scenario, options, plan, result, context);
  return { plan, result, memory, episode };
}

export function runBaselineMission(scenario, options) {
  const standardStep =
    scenario.type === "wildfire"
      ? "generate_thermal_alert_map"
      : scenario.type === "dust"
        ? "dust_inversion_standard"
        : "pollution_inversion_standard";
  const detectStep = scenario.type === "wildfire" ? "detect_thermal_hotspots" : "detect_hotspots";

  const plan = {
    workflowId: "fixed_script",
    workflowLabel: "固定流程基线",
    steps: ["ingest_scene", "quality_screen", detectStep, standardStep, "package_alert"],
    notes: ["固定流程采用静态处理顺序，不具备动态修复能力。"],
  };

  return executeWorkflow(plan, scenario, { ...options, downlinkPolicy: "full" }, createMemory(), false, "baseline");
}

export function buildNarrative(scenario, agentRun, baselineRun) {
  const repairedText =
    agentRun.result.state.repairs.length > 0
      ? `本次运行中，系统执行了 ${agentRun.result.state.repairs.length} 次流程修复。`
      : "本次运行没有触发额外修复。";

  const productText =
    agentRun.result.state.outputProduct === "anomaly-heatmap"
      ? "最终输出被主动降级为异常热区结果，以优先保证时效性和稳定性。"
      : agentRun.result.state.outputProduct === "thermal-hotspot-map"
        ? "最终输出保持为热异常热点图，说明系统为该任务选择了热点确认链路，而不是错误套用连续反演。"
        : "最终输出保持为定量反演结果，说明当前场景仍具备星上量化处理条件。";

  return [
    `场景“${scenario.title}”的核心矛盾是预算受限，但高风险区域不能漏判。系统先接入${scenario.imagery?.sourceLabel ?? "官方遥感底图"}与${scenario.analysis?.sourceLabel ?? "异常检测工具"}，再根据任务类型和预算选流程，把算力集中到更值得处理的区域。`,
    `${repairedText}${productText}`,
    `与固定流程相比，当前方案的时延占比为 ${agentRun.result.metrics.budgetUsage}% ，固定流程为 ${baselineRun.metrics.budgetUsage}% 。这说明仅靠流程层的决策优化，就能带来明显的星上处理收益。`,
  ];
}

export function buildReportPayload(scenario, options, agentRun, baselineRun) {
  return {
    exportedAt: new Date().toISOString(),
    scenario,
    options,
    agentPlan: agentRun.plan,
    agentResult: agentRun.result,
    memoryEpisode: agentRun.episode,
    agentMemory: agentRun.memory,
    baselineResult: baselineRun,
  };
}

export function getOptionPreset(scenario) {
  return {
    budgetMin: scenario.defaultBudgetMin,
    powerMode: scenario.defaultPowerMode,
    downlinkPolicy: "balanced",
  };
}
