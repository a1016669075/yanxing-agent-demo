import { benchmarkCoverageForTask, summarizeBenchmarkCatalog } from "./benchmarkCatalog.mjs";
import { evaluateReviewedBenchmarkCase, summarizeReviewedBenchmarkCases } from "./benchmarkCases.mjs";

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round(value, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function scoreFromRunner(run) {
  if (!run) {
    return 42;
  }
  return (
    {
      python_local: 88,
      static_replay: 74,
      rule_based: 63,
      degraded_heatmap: 51,
    }[run.path] || 56
  );
}

export function evaluateOfflineRun({
  scenario,
  preprocessGate,
  inferenceRun,
  vectorCollection,
  jsonTileBundle,
  queueSummary,
  report,
}) {
  const benchmarkTaskId = scenario?.type || report?.taskId || "unknown";
  const benchmarkCoverage = benchmarkCoverageForTask(benchmarkTaskId);
  const benchmarkCatalog = summarizeBenchmarkCatalog();
  const reviewedCaseCatalog = summarizeReviewedBenchmarkCases();
  const caseAccuracy = evaluateReviewedBenchmarkCase({ scenario, predictedRois: scenario?.rois || [] });
  const fireOverlay = scenario?.analysis?.fireOverlay || null;
  const preprocessScore = clamp(
    ((preprocessGate?.validPixelRatio ?? 1 - scenario.cloudCover * 0.82) * 100 +
      (preprocessGate?.effectiveQuality ?? scenario.radiometricQuality) * 100) /
      2,
    0,
    100
  );
  const vectorFeatureCount = vectorCollection?.features?.length || 0;
  const tileCount = jsonTileBundle?.tileCount || 0;
  const vectorScore = clamp(vectorFeatureCount * 18 + tileCount * 7 + 28, 0, 100);
  const queueScore = clamp(
    (queueSummary?.byStatus?.done || 0) * 18 + (queueSummary?.byStatus?.running || 0) * 8 + 36,
    0,
    100
  );
  const agentSuccessBoost = report?.agent?.success ? 10 : 0;
  const baselinePenalty = report?.baseline?.success === false ? 6 : 0;
  const resourceScore = clamp(
    58 +
      agentSuccessBoost +
      baselinePenalty +
      (report?.agent?.qualityIndex ?? 0) * 18 -
      (report?.agent?.latencyUsage ?? 0) * 10,
    0,
    100
  );
  const inferenceScore = scoreFromRunner(inferenceRun);
  const overall = round(
    preprocessScore * 0.2 +
      inferenceScore * 0.26 +
      vectorScore * 0.18 +
      queueScore * 0.14 +
      resourceScore * 0.22
  );

  const verdict = overall >= 80 ? "ready" : overall >= 65 ? "promising" : "needs-hardening";
  const findings = [
    `Preprocess score ${round(preprocessScore)} indicates the current observation is ${
      preprocessScore >= 70 ? "clean enough for downstream reasoning" : "still noisy and needs more cleaning"
    }.`,
    `Inference score ${round(inferenceScore)} currently depends on ${inferenceRun?.path || "no active runner"}.`,
    `Delivery score ${round(vectorScore)} and queue score ${round(queueScore)} suggest the result can be replayed and loaded on demand.`,
    benchmarkCoverage.total === 0
      ? "No reusable benchmark cases are attached to the current task yet, so anomaly accuracy cannot be tracked as a stable metric."
      : benchmarkCoverage.ready > 0
        ? `${benchmarkCoverage.ready}/${benchmarkCoverage.total} benchmark sources are already usable for this task, which is enough to start tightening false positives and false negatives.`
        : `${benchmarkCoverage.total} benchmark definitions exist for this task, but they still need runnable labels or reviewed cases before they can drive accuracy optimization.`,
    !caseAccuracy
      ? "The current scene does not match any local reviewed benchmark case yet, so case-level precision / recall is unavailable."
      : caseAccuracy.available === false
        ? "A local reviewed case exists for this scenario family, but the current focused ROI view is not directly comparable to the full-scene benchmark."
        : `Matched reviewed case ${caseAccuracy.label}; current detection precision ${round(caseAccuracy.metrics.precision * 100)}%, recall ${round(caseAccuracy.metrics.recall * 100)}%, F1 ${round(caseAccuracy.metrics.f1 * 100)}%, mean IoU ${round(caseAccuracy.metrics.meanIoU * 100)}%.`,
  ];

  return {
    verdict,
    overall,
    scores: {
      preprocess: round(preprocessScore),
      inference: round(inferenceScore),
      vector: round(vectorScore),
      delivery: round(queueScore),
      resource: round(resourceScore),
      accuracy: caseAccuracy?.available ? caseAccuracy.accuracyScore : null,
    },
    benchmarkCoverage,
    benchmarkCatalog,
    reviewedCaseCatalog,
    caseAccuracy,
    wildfireTemporalMetrics:
      benchmarkTaskId === "wildfire" && fireOverlay
        ? fireOverlay.metrics || null
        : null,
    timeParityReport:
      benchmarkTaskId === "wildfire" && fireOverlay
        ? fireOverlay.timeParityReport || null
        : null,
    temporalTrace:
      benchmarkTaskId === "wildfire" && fireOverlay
        ? fireOverlay.temporalTrace || null
        : null,
    beforeAfterClusterComparison:
      benchmarkTaskId === "wildfire" && fireOverlay
        ? fireOverlay.beforeAfterClusterComparison || null
        : null,
    knownTemporalLimitations:
      benchmarkTaskId === "wildfire" && fireOverlay
        ? fireOverlay.knownTemporalLimitations || []
        : [],
    fireSource:
      benchmarkTaskId === "wildfire" && fireOverlay
        ? {
            providerId: fireOverlay.providerId || fireOverlay.source || "firms",
            queryMode: fireOverlay.queryMode || fireOverlay.config?.mode || "nrt",
            benchmarkMode: fireOverlay.benchmarkMode || null,
            products: fireOverlay.products || fireOverlay.config?.products || [],
            pointCount: fireOverlay.summary?.pointCount || 0,
            clusterCount: fireOverlay.summary?.clusterCount || 0,
          }
        : null,
    findings,
    generatedAt: new Date().toISOString(),
  };
}
