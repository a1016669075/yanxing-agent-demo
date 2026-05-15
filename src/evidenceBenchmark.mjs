import { evaluateReviewedBenchmarkCase } from "./benchmarkCases.mjs";
import { createGeoMemory, normalizeGeoMemory } from "./geoMemory.mjs";
import { runEvidencePlannerMission } from "./evidencePlanner.mjs";

function round(value, digits = 3) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function summarizeAccuracy(scenario, processedRois = []) {
  const accuracy = evaluateReviewedBenchmarkCase({
    scenario,
    predictedRois: processedRois,
  });

  if (!accuracy || accuracy.available === false) {
    return {
      available: false,
      precision: null,
      recall: null,
      f1: null,
      accuracyScore: null,
    };
  }

  return {
    available: true,
    precision: accuracy.metrics.precision,
    recall: accuracy.metrics.recall,
    f1: accuracy.metrics.f1,
    accuracyScore: accuracy.accuracyScore,
  };
}

function summarizeArm({ label, scenario, agentRun, plannerRun = null }) {
  const processedRois = agentRun?.result?.state?.processedRois || [];
  const abstained = processedRois.length === 0;
  const accuracy = summarizeAccuracy(scenario, processedRois);
  const telemetry = plannerRun?.telemetry || {
    externalAssetCalls: 0,
    repeatedDownloads: 0,
    averageActionCount: agentRun?.result?.workflowSteps?.length || 0,
    trajectoryLogCompleteness: 0,
  };

  return {
    label,
    outputProduct: agentRun?.result?.state?.outputProduct || null,
    finalAccuracy: accuracy,
    endToEndLatencyMs: Math.round(Number(agentRun?.result?.state?.consumedLatency || 0) * 1000),
    externalAssetCalls: telemetry.externalAssetCalls,
    repeatedDownloads: telemetry.repeatedDownloads,
    repeatedComputations: Math.max(0, telemetry.repeatedDownloads),
    averageActionCount: telemetry.averageActionCount,
    abstentionRate: abstained ? 1 : 0,
    selectiveAccuracy: abstained ? null : accuracy.accuracyScore,
    validRegionUsage: round(Number(scenario?.analysis?.validPixelRatio) || 0, 4),
    trajectoryLogCompleteness: telemetry.trajectoryLogCompleteness,
    evidencePathLength: plannerRun?.evidencePath?.length || 0,
    fallbackUsed: Boolean(plannerRun?.fallbackUsed),
  };
}

export async function runEvidenceBenchmarkSuite({
  scenario,
  options,
  runAgentMission,
  runBaselineMission,
  geoMemoryInput = createGeoMemory(),
} = {}) {
  const geoMemory = normalizeGeoMemory(geoMemoryInput);
  const arms = [];

  const baselineRun = runBaselineMission(scenario, options);
  arms.push(
    summarizeArm({
      label: "fixed_workflow_baseline",
      scenario,
      agentRun: { result: baselineRun },
    })
  );

  const memoryOnlyPlanner = await runEvidencePlannerMission(scenario, options, geoMemory, {
    useGeoMemory: true,
    useContextSelection: false,
  });
  const memoryOnlyRun = runAgentMission(memoryOnlyPlanner.scenario, options);
  arms.push(
    summarizeArm({
      label: "memory_only",
      scenario: memoryOnlyPlanner.scenario,
      agentRun: memoryOnlyRun,
      plannerRun: memoryOnlyPlanner,
    })
  );

  const contextOnlyPlanner = await runEvidencePlannerMission(scenario, options, createGeoMemory(), {
    useGeoMemory: false,
    useContextSelection: true,
  });
  const contextOnlyRun = runAgentMission(contextOnlyPlanner.scenario, options);
  arms.push(
    summarizeArm({
      label: "context_selection_only",
      scenario: contextOnlyPlanner.scenario,
      agentRun: contextOnlyRun,
      plannerRun: contextOnlyPlanner,
    })
  );

  const fullPlanner = await runEvidencePlannerMission(scenario, options, geoMemory, {
    useGeoMemory: true,
    useContextSelection: true,
  });
  const fullPlannerRun = runAgentMission(fullPlanner.scenario, options);
  arms.push(
    summarizeArm({
      label: "full_planner",
      scenario: fullPlanner.scenario,
      agentRun: fullPlannerRun,
      plannerRun: fullPlanner,
    })
  );

  return {
    generatedAt: new Date().toISOString(),
    taskId: scenario?.type || "unknown",
    arms,
  };
}
