function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round(value, digits = 3) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function areaOf(box = {}) {
  return Math.max(0, Number(box.width) || 0) * Math.max(0, Number(box.height) || 0);
}

function intersectionArea(left = {}, right = {}) {
  const x1 = Math.max(Number(left.left) || 0, Number(right.left) || 0);
  const y1 = Math.max(Number(left.top) || 0, Number(right.top) || 0);
  const x2 = Math.min((Number(left.left) || 0) + (Number(left.width) || 0), (Number(right.left) || 0) + (Number(right.width) || 0));
  const y2 = Math.min((Number(left.top) || 0) + (Number(left.height) || 0), (Number(right.top) || 0) + (Number(right.height) || 0));

  return Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
}

export function roiIoU(left = {}, right = {}) {
  const intersection = intersectionArea(left, right);
  const union = areaOf(left) + areaOf(right) - intersection;
  return union > 0 ? round(intersection / union, 4) : 0;
}

export const reviewedBenchmarkCasesVersion = "2026.03.26-seed";

export const reviewedBenchmarkCases = [
  {
    id: "dust-frontier-reviewed",
    taskId: "dust",
    scenarioId: "dust-frontier",
    label: "河西走廊沙尘锋面 reviewed case",
    source: "Local reviewed seed",
    annotationType: "bbox-reviewed",
    supportsFocusSelection: false,
    note: "以局地主异常锋面和扩散尾迹作为 reviewed 基准，用于约束沙尘异常的误报和漏报。",
    referenceRegions: [
      { id: "GT1", label: "锋面核心区", box: { left: 21, top: 55, width: 30, height: 22 } },
      { id: "GT2", label: "东缘扩散区", box: { left: 44, top: 42, width: 20, height: 18 } },
      { id: "GT3", label: "尾迹稀疏区", box: { left: 56, top: 35, width: 13, height: 13 } },
    ],
  },
  {
    id: "urban-plume-reviewed",
    taskId: "pollution",
    scenarioId: "urban-plume",
    label: "珠三角城市污染羽流 reviewed case",
    source: "Local reviewed seed",
    annotationType: "bbox-reviewed",
    supportsFocusSelection: false,
    note: "以羽流主轴和东侧扩散带作为 reviewed 基准，用于衡量污染带检测的 precision / recall。",
    referenceRegions: [
      { id: "GT1", label: "西侧污染带", box: { left: 14, top: 19, width: 26, height: 22 } },
      { id: "GT2", label: "中部主羽流", box: { left: 38, top: 33, width: 24, height: 22 } },
      { id: "GT3", label: "东侧扩散区", box: { left: 59, top: 41, width: 19, height: 19 } },
    ],
  },
  {
    id: "twilight-edge-reviewed",
    taskId: "mixed",
    scenarioId: "twilight-edge",
    label: "暮光混合异常 reviewed case",
    source: "Local reviewed seed",
    annotationType: "bbox-reviewed",
    supportsFocusSelection: false,
    note: "该案例用于检验弱对比度条件下系统是否宁可保守输出，也不扩散误报。",
    referenceRegions: [
      { id: "GT1", label: "混合核心区", box: { left: 38, top: 30, width: 19, height: 19 } },
      { id: "GT2", label: "东侧扩散区", box: { left: 59, top: 44, width: 19, height: 17 } },
    ],
  },
  {
    id: "indochina-hotspot-reviewed",
    taskId: "wildfire",
    scenarioId: "indochina-hotspot",
    label: "中南半岛热异常 reviewed case",
    source: "Local reviewed seed",
    annotationType: "bbox-reviewed",
    supportsFocusSelection: false,
    note: "以热点密集簇为 reviewed 基准，用于检验热异常确认链路是否稳定聚焦到真实热点带。",
    referenceRegions: [
      { id: "GT1", label: "北部热点簇", box: { left: 28, top: 22, width: 10, height: 10 } },
      { id: "GT2", label: "中部热点簇", box: { left: 42, top: 38, width: 11, height: 11 } },
      { id: "GT3", label: "东侧热点簇", box: { left: 58, top: 45, width: 9, height: 9 } },
    ],
  },
];

export function summarizeReviewedBenchmarkCases(cases = reviewedBenchmarkCases) {
  const tasks = new Set(cases.map((entry) => entry.taskId));
  return {
    version: reviewedBenchmarkCasesVersion,
    total: cases.length,
    taskCount: tasks.size,
  };
}

export function matchReviewedBenchmarkCase(scenario, cases = reviewedBenchmarkCases) {
  const scenarioId = scenario?.baseScenarioId || scenario?.id;
  const hasFocusSelection = Boolean(scenario?.focusSelection?.bbox);
  const taskId = scenario?.type;

  const directMatch = cases.find((entry) => entry.scenarioId === scenarioId && entry.taskId === taskId);
  if (!directMatch) {
    return null;
  }
  if (hasFocusSelection && directMatch.supportsFocusSelection === false) {
    return {
      available: false,
      reason: "focused-scene",
      caseId: directMatch.id,
      label: directMatch.label,
      taskId: directMatch.taskId,
    };
  }
  return {
    available: true,
    ...directMatch,
  };
}

export function evaluateReviewedBenchmarkCase({
  scenario,
  predictedRois = scenario?.rois || [],
  caseDefinition = null,
  minIou = 0.18,
} = {}) {
  const resolvedCase = caseDefinition || matchReviewedBenchmarkCase(scenario);
  if (!resolvedCase) {
    return null;
  }
  if (resolvedCase.available === false) {
    return {
      available: false,
      reason: resolvedCase.reason,
      caseId: resolvedCase.caseId,
      label: resolvedCase.label,
      taskId: resolvedCase.taskId,
    };
  }

  const predictions = Array.isArray(predictedRois) ? predictedRois : [];
  const references = Array.isArray(resolvedCase.referenceRegions) ? resolvedCase.referenceRegions : [];
  const pairs = [];

  for (let predictionIndex = 0; predictionIndex < predictions.length; predictionIndex += 1) {
    for (let referenceIndex = 0; referenceIndex < references.length; referenceIndex += 1) {
      const iou = roiIoU(predictions[predictionIndex]?.box, references[referenceIndex]?.box);
      if (iou >= minIou) {
        pairs.push({
          predictionIndex,
          referenceIndex,
          iou,
        });
      }
    }
  }

  pairs.sort((left, right) => right.iou - left.iou);
  const usedPredictions = new Set();
  const usedReferences = new Set();
  const matches = [];

  for (const pair of pairs) {
    if (usedPredictions.has(pair.predictionIndex) || usedReferences.has(pair.referenceIndex)) {
      continue;
    }
    usedPredictions.add(pair.predictionIndex);
    usedReferences.add(pair.referenceIndex);
    matches.push({
      predictionId: predictions[pair.predictionIndex]?.id || `P${pair.predictionIndex + 1}`,
      referenceId: references[pair.referenceIndex]?.id || `GT${pair.referenceIndex + 1}`,
      iou: pair.iou,
      predictionLabel: predictions[pair.predictionIndex]?.name || "",
      referenceLabel: references[pair.referenceIndex]?.label || "",
    });
  }

  const tp = matches.length;
  const fp = Math.max(0, predictions.length - tp);
  const fn = Math.max(0, references.length - tp);
  const precision = tp + fp > 0 ? tp / (tp + fp) : references.length === 0 ? 1 : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 1;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  const meanIoU = matches.length
    ? matches.reduce((sum, match) => sum + match.iou, 0) / matches.length
    : 0;
  const unmatchedPredictions = predictions
    .filter((_, index) => !usedPredictions.has(index))
    .map((entry, index) => ({
      id: entry?.id || `P${index + 1}`,
      name: entry?.name || "",
    }));
  const unmatchedReferences = references
    .filter((_, index) => !usedReferences.has(index))
    .map((entry, index) => ({
      id: entry?.id || `GT${index + 1}`,
      label: entry?.label || "",
    }));

  const accuracyScore = round(clamp((f1 * 0.6 + meanIoU * 0.4) * 100, 0, 100), 1);

  return {
    available: true,
    caseId: resolvedCase.id,
    label: resolvedCase.label,
    taskId: resolvedCase.taskId,
    source: resolvedCase.source,
    annotationType: resolvedCase.annotationType,
    note: resolvedCase.note,
    referenceCount: references.length,
    predictedCount: predictions.length,
    abstained: Boolean(scenario?.analysis?.abstained),
    accuracyScore,
    metrics: {
      precision: round(precision, 3),
      recall: round(recall, 3),
      f1: round(f1, 3),
      meanIoU: round(meanIoU, 3),
      tp,
      fp,
      fn,
    },
    matches,
    unmatchedPredictions,
    unmatchedReferences,
  };
}
