import {
  scenarios,
  getScenarioById,
  getTimelineBounds,
  getDefaultObservation,
  materializeScenarioAt,
  observationFromParts,
  formatObservationLabel,
  toInputDateValue,
  dateValueToDayIndex,
} from "./scenarios.mjs";
import {
  enrichScenarioWithRemoteData,
  fetchGlobalOverview,
  fetchBasemapProxyStatus,
  fetchStaticPredictionBundle,
  getAnalysisValidRegion,
  getRemoteSensingDiagnostics,
  tryEnhanceScenarioWithLocalModel,
} from "./remoteSensing.mjs";
import {
  buildNarrative,
  buildReportPayload,
  createMemory,
  findRelevantEpisodes,
  getOptionPreset,
  normalizeMemory,
  runAgentMission,
  runBaselineMission,
} from "./engine.mjs";
import { toolCatalog } from "./workflows.mjs";
import {
  buildPhaseGroups,
  deliveryPrinciples,
  getCurrentIterationModule,
  getNextIterationModules,
  summarizeIterationPlan,
  validateIterationPlan,
} from "./iterationPlan.mjs";
import {
  getAnalysisLayerConfig,
  getImageryLayerConfig,
  layerCatalog,
  layerCatalogHealth,
  summarizeLayerCatalog,
} from "./layerCatalog.mjs";
import {
  addPolygonVertex,
  beginBboxDraft,
  cancelDraft,
  clearAllRois,
  commitBboxDraft,
  commitPolygonDraft,
  createDrawingState,
  deleteSelectedRoi,
  moveVertex,
  roiSummary,
  roiToFeature,
  selectRoi,
  selectedRoi,
  setDrawingMode,
  updateBboxDraft,
} from "./roiDrawing.mjs";
import { formatRoiJson, normalizeRoiDefinition, roiInputPresets } from "./roiSchema.mjs";
import {
  modelRegistry,
  modelRegistryVersion,
  recommendModels,
  summarizeModelRegistry,
  validateModelRegistry,
} from "./modelRegistry.mjs";
import { evaluatePreprocessGate } from "./preprocessGate.mjs";
import { buildInferenceExecutionPlan, summarizeInferenceRun } from "./inferenceRunner.mjs";
import { roisToFeatureCollection, summarizeFeatureCollection } from "./vectorPostprocess.mjs";
import { buildS2CloudlessEstimate } from "./s2cloudlessAdapter.mjs";
import { buildFmaskEstimate } from "./fmaskAdapter.mjs";
import { buildAlignmentPlan } from "./resampleAlignment.mjs";
import {
  lookupJsonTile,
  sliceFeatureCollectionToJsonTiles,
  summarizeJsonTileBundle,
} from "./jsonTileSlicer.mjs";
import { buildVectorTilePreview, summarizeVectorTilePreview } from "./vectorTileDelivery.mjs";
import {
  PRECOMPUTE_QUEUE_KEY,
  completePrecomputeJob,
  enqueuePrecomputeJob,
  failPrecomputeJob,
  retryPrecomputeJob,
  startNextPrecomputeJob,
  summarizePrecomputeQueue,
} from "./asyncPrecomputeQueue.mjs";
import { evaluateOfflineRun } from "./offlineEvalHarness.mjs";
import {
  artifactIndexKey,
  createArtifactEntry,
  summarizeArtifactIndex,
  upsertArtifactIndex,
} from "./cacheIndex.mjs";
import {
  SURFACE_MODE_KEY,
  isLocalHostname,
  resolveSurfaceMode,
  surfaceModeMeta,
} from "./surfaceMode.mjs";
import {
  adaptiveFocusProfile,
  bboxToPercentRect,
  buildFocusScenario,
  describeFocusBbox,
  percentRectToBbox,
} from "./globalFocus.mjs";
import {
  createGlobalViewportState,
  globalViewportStyle,
  panGlobalViewport,
  scaleGlobalViewport,
  worldPointFromViewportPoint,
} from "./globalViewport.mjs";
import { buildAgentDecisionSnapshot, buildDecisionMemoryCueSummary } from "./agentDecision.mjs";
import { buildAgentLoopSnapshot } from "./agentLoop.mjs";
import { buildSceneLocatorSnapshot } from "./sceneLocator.mjs";
import { capabilityForTask, getTaskById, summarizeTaskCatalog, taskCatalog } from "./taskCatalog.mjs";
import { buildPlanningMissionSnapshot } from "./taskPlanning.mjs";
import { buildOperationalResultInterpretation } from "./resultInterpretation.mjs";
import { buildOverlayPointsFromRois, clipOverlayPointsToValidRegion } from "./anomalyOverlay.mjs";
import { buildAnomalyMarkerModel } from "./anomalySemiology.mjs";

const scenarioSelect = document.querySelector("#scenarioSelect");
const taskTypeSelect = document.querySelector("#taskTypeSelect");
const budgetInput = document.querySelector("#budgetInput");
const budgetValue = document.querySelector("#budgetValue");
const powerModeSelect = document.querySelector("#powerModeSelect");
const downlinkSelect = document.querySelector("#downlinkSelect");
const runButton = document.querySelector("#runButton");
const sceneRunButton = document.querySelector("#sceneRunButton");
const exportButton = document.querySelector("#exportButton");
const resetMemoryButton = document.querySelector("#resetMemoryButton");
const workspaceSwitcher = document.querySelector("#workspaceSwitcher");
const showcaseModeButton = document.querySelector("#showcaseModeButton");
const workbenchModeButton = document.querySelector("#workbenchModeButton");
const workspaceModeHint = document.querySelector("#workspaceModeHint");
const agentDecisionPanel = document.querySelector("#agentDecisionPanel");
const globalOverviewCanvas = document.querySelector("#globalOverviewCanvas");
const globalSelectionStatus = document.querySelector("#globalSelectionStatus");
const globalApplySelectionButton = document.querySelector("#globalApplySelectionButton");
const globalClearSelectionButton = document.querySelector("#globalClearSelectionButton");
const globalSelectModeButton = document.querySelector("#globalSelectModeButton");
const globalPanModeButton = document.querySelector("#globalPanModeButton");
const globalZoomOutButton = document.querySelector("#globalZoomOutButton");
const globalZoomResetButton = document.querySelector("#globalZoomResetButton");
const globalZoomInButton = document.querySelector("#globalZoomInButton");
const globalViewportHint = document.querySelector("#globalViewportHint");
const capabilitySummary = document.querySelector("#capabilitySummary");
const capabilityBoard = document.querySelector("#capabilityBoard");
const agentLoopPanel = document.querySelector("#agentLoopPanel");

const overlayToggle = document.querySelector("#overlayToggle");
const decloudPreviewToggle = document.querySelector("#decloudPreviewToggle");
const dateInput = document.querySelector("#dateInput");
const dateSlider = document.querySelector("#dateSlider");
const hourSlider = document.querySelector("#hourSlider");
const hourValue = document.querySelector("#hourValue");
const timelineLabel = document.querySelector("#timelineLabel");
const timelineBadge = document.querySelector("#timelineBadge");
const timelineStartLabel = document.querySelector("#timelineStartLabel");
const timelineCurrentLabel = document.querySelector("#timelineCurrentLabel");
const timelineEndLabel = document.querySelector("#timelineEndLabel");

const missionBrief = document.querySelector("#missionBrief");
const workflowPlan = document.querySelector("#workflowPlan");
const executionLog = document.querySelector("#executionLog");
const sceneMap = document.querySelector("#sceneMap");
const metricsCards = document.querySelector("#metricsCards");
const compareTable = document.querySelector("#compareTable");
const compareExplain = document.querySelector("#compareExplain");
const showcaseSummary = document.querySelector("#showcaseSummary");
const narrativePanel = document.querySelector("#narrativePanel");
const memoryPanel = document.querySelector("#memoryPanel");
const iterationSummary = document.querySelector("#iterationSummary");
const iterationBoard = document.querySelector("#iterationBoard");
const roiPresetSelect = document.querySelector("#roiPresetSelect");
const roiPresetHint = document.querySelector("#roiPresetHint");
const roiInput = document.querySelector("#roiInput");
const roiValidateButton = document.querySelector("#roiValidateButton");
const roiResetButton = document.querySelector("#roiResetButton");
const roiValidationStatus = document.querySelector("#roiValidationStatus");
const roiValidationChecks = document.querySelector("#roiValidationChecks");
const roiValidationOutput = document.querySelector("#roiValidationOutput");
const roiDrawModeSelect = document.querySelector("#roiDrawModeSelect");
const roiPolygonCompleteButton = document.querySelector("#roiPolygonCompleteButton");
const roiSubmitButton = document.querySelector("#roiSubmitButton");
const roiDeleteButton = document.querySelector("#roiDeleteButton");
const roiClearButton = document.querySelector("#roiClearButton");
const roiDrawStatusTitle = document.querySelector("#roiDrawStatusTitle");
const roiDrawStatusText = document.querySelector("#roiDrawStatusText");
const roiDrawList = document.querySelector("#roiDrawList");
const roiDrawCanvas = document.querySelector("#roiDrawCanvas");
const layerCatalogSummary = document.querySelector("#layerCatalogSummary");
const layerCatalogBoard = document.querySelector("#layerCatalogBoard");
const proxySummary = document.querySelector("#proxySummary");
const stacProviderSelect = document.querySelector("#stacProviderSelect");
const stacCollectionSelect = document.querySelector("#stacCollectionSelect");
const stacSourceSelect = document.querySelector("#stacSourceSelect");
const stacWindowSelect = document.querySelector("#stacWindowSelect");
const stacSearchButton = document.querySelector("#stacSearchButton");
const stacContext = document.querySelector("#stacContext");
const stacSummary = document.querySelector("#stacSummary");
const stacResults = document.querySelector("#stacResults");
const laadsProductSelect = document.querySelector("#laadsProductSelect");
const laadsSourceSelect = document.querySelector("#laadsSourceSelect");
const laadsWindowSelect = document.querySelector("#laadsWindowSelect");
const laadsPlanCountSelect = document.querySelector("#laadsPlanCountSelect");
const laadsSearchButton = document.querySelector("#laadsSearchButton");
const laadsPlanButton = document.querySelector("#laadsPlanButton");
const laadsContext = document.querySelector("#laadsContext");
const laadsSummary = document.querySelector("#laadsSummary");
const laadsResults = document.querySelector("#laadsResults");
const laadsPlan = document.querySelector("#laadsPlan");
const assetSourceSelect = document.querySelector("#assetSourceSelect");
const assetWindowSourceSelect = document.querySelector("#assetWindowSourceSelect");
const assetUrlInput = document.querySelector("#assetUrlInput");
const assetInspectButton = document.querySelector("#assetInspectButton");
const assetContext = document.querySelector("#assetContext");
const assetSummary = document.querySelector("#assetSummary");
const assetContractOutput = document.querySelector("#assetContractOutput");
const modelRegistrySummary = document.querySelector("#modelRegistrySummary");
const modelRegistryBoard = document.querySelector("#modelRegistryBoard");
const cloudMaskProductSelect = document.querySelector("#cloudMaskProductSelect");
const cloudMaskSourceSelect = document.querySelector("#cloudMaskSourceSelect");
const cloudMaskWindowSelect = document.querySelector("#cloudMaskWindowSelect");
const cloudMaskThresholdInput = document.querySelector("#cloudMaskThresholdInput");
const cloudMaskThresholdValue = document.querySelector("#cloudMaskThresholdValue");
const cloudMaskSearchButton = document.querySelector("#cloudMaskSearchButton");
const cloudMaskContext = document.querySelector("#cloudMaskContext");
const cloudMaskSummary = document.querySelector("#cloudMaskSummary");
const cloudMaskResults = document.querySelector("#cloudMaskResults");
const preprocessGateSummary = document.querySelector("#preprocessGateSummary");
const runnerRunButton = document.querySelector("#runnerRunButton");
const runnerContext = document.querySelector("#runnerContext");
const runnerSummary = document.querySelector("#runnerSummary");
const vectorBuildButton = document.querySelector("#vectorBuildButton");
const vectorSummary = document.querySelector("#vectorSummary");
const vectorOutput = document.querySelector("#vectorOutput");
const cacheRegisterButton = document.querySelector("#cacheRegisterButton");
const cacheResetButton = document.querySelector("#cacheResetButton");
const cacheSummary = document.querySelector("#cacheSummary");
const cacheBoard = document.querySelector("#cacheBoard");
const s2cloudlessButton = document.querySelector("#s2cloudlessButton");
const fmaskButton = document.querySelector("#fmaskButton");
const alignmentButton = document.querySelector("#alignmentButton");
const advancedPreprocessSummary = document.querySelector("#advancedPreprocessSummary");
const advancedPreprocessBoard = document.querySelector("#advancedPreprocessBoard");
const jsonTileZoomSelect = document.querySelector("#jsonTileZoomSelect");
const jsonTileBuildButton = document.querySelector("#jsonTileBuildButton");
const jsonTileSummary = document.querySelector("#jsonTileSummary");
const jsonTileBoard = document.querySelector("#jsonTileBoard");
const vectorTileBuildButton = document.querySelector("#vectorTileBuildButton");
const vectorTileSummary = document.querySelector("#vectorTileSummary");
const vectorTileBoard = document.querySelector("#vectorTileBoard");
const queueEnqueueButton = document.querySelector("#queueEnqueueButton");
const queueRetryButton = document.querySelector("#queueRetryButton");
const queueSummary = document.querySelector("#queueSummary");
const queueBoard = document.querySelector("#queueBoard");
const evalRunButton = document.querySelector("#evalRunButton");
const evalSummary = document.querySelector("#evalSummary");
const evalOutput = document.querySelector("#evalOutput");

const MEMORY_KEY = "sat-atmo-agent-memory";
const ARTIFACT_INDEX_KEY = artifactIndexKey;
const LOCAL_WORKBENCH_ENABLED = isLocalHostname(window.location.hostname);
const SCENE_CACHE_LIMIT = 18;
const DECISION_PREVIEW_CACHE_LIMIT = 24;

const STATUS_LABELS = {
  planned: "待执行",
  ok: "完成",
  failed: "失败",
  repair: "已修复",
  warn: "提示",
};

const POWER_MODE_LABELS = {
  constrained: "受限",
  balanced: "均衡",
  burst: "冲刺",
};

const DOWNLINK_LABELS = {
  focused: "聚焦重点区域",
  balanced: "兼顾范围与重点",
  full: "保留更多全局信息",
};

const PRODUCT_LABELS = {
  "quantitative-retrieval": "定量反演结果",
  "anomaly-heatmap": "异常热区结果",
  "thermal-hotspot-map": "热异常热点图",
};

const TYPE_LABELS = {
  dust: "沙尘任务",
  pollution: "污染任务",
  mixed: "混合任务",
  wildfire: "热异常任务",
};

const RULE_REASON_LABELS = {
  cloud_contamination: "云污染超阈值",
  budget_overrun: "预计超出时延预算",
  low_radiometric_quality: "辐射质量不足",
  uncertainty_too_high: "结果置信度偏低",
};

const RULE_ACTION_LABELS = {
  insert_cloud_mask: "插入云掩膜",
  replace_with_fast_inversion: "切换快速反演",
  degrade_to_heatmap: "降级为热区输出",
};

let latestReport = null;
let latestObservedScenario = null;
let latestObservedScenarioIntent = "preview";
let refreshToken = 0;
let previewTimer = null;
let previewAbortController = null;
let globalOverviewAbortController = null;
let roiDrawingState = createDrawingState();
let roiDrawingSceneKey = "";
let roiDrawingDrag = null;
let latestProxyStatus = null;
let stacCatalog = null;
let latestStacResult = null;
let laadsCatalog = null;
let latestLaadsResult = null;
let latestLaadsPlan = null;
let latestAssetInspection = null;
let latestModelRuntime = null;
let latestStaticPredictionBundle = null;
let cloudMaskCatalog = null;
let latestCloudMaskResult = null;
let latestPreprocessGate = null;
let latestInferenceRun = null;
let latestVectorCollection = null;
let latestS2cloudlessEstimate = null;
let latestFmaskEstimate = null;
let latestAlignmentPlan = null;
let latestJsonTileBundle = null;
let latestVectorTilePreview = null;
let latestEvalReport = null;
let queueTickTimer = null;
let workbenchBootstrapped = false;
let currentSurfaceMode = resolveSurfaceMode({
  hostname: window.location.hostname,
  storedMode: LOCAL_WORKBENCH_ENABLED ? localStorage.getItem(SURFACE_MODE_KEY) : null,
});
let globalOverview = null;
let globalOverviewRefreshToken = 0;
let pendingGlobalSelection = null;
let activeGlobalSelection = null;
let globalSelectionDraft = null;
let globalPanDrag = null;
let globalViewport = createGlobalViewportState();
let globalInteractionMode = "select";
let latestSceneLoadSummary = null;
let latestSceneOverlayDiagnostics = null;

const sceneCache = new Map();
const decisionPreviewCache = new Map();

function readMemory() {
  try {
    const parsed = JSON.parse(localStorage.getItem(MEMORY_KEY) || "null");
    return normalizeMemory(parsed);
  } catch {
    return createMemory();
  }
}

function writeMemory(memory) {
  localStorage.setItem(MEMORY_KEY, JSON.stringify(normalizeMemory(memory)));
}

function readArtifactIndex() {
  try {
    const parsed = JSON.parse(localStorage.getItem(ARTIFACT_INDEX_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeArtifactIndex(index) {
  localStorage.setItem(ARTIFACT_INDEX_KEY, JSON.stringify(index));
}

function readPrecomputeQueue() {
  try {
    const parsed = JSON.parse(localStorage.getItem(PRECOMPUTE_QUEUE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writePrecomputeQueue(queue) {
  localStorage.setItem(PRECOMPUTE_QUEUE_KEY, JSON.stringify(queue));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function formatPercent(value) {
  return `${Math.round(value * 100)}%`;
}

function formatShortDate(date) {
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}.${String(
    date.getDate()
  ).padStart(2, "0")}`;
}

function productLabel(product) {
  return PRODUCT_LABELS[product] ?? "未生成";
}

function statusLabel(status) {
  return STATUS_LABELS[status] ?? status;
}

function powerModeLabel(mode) {
  return POWER_MODE_LABELS[mode] ?? mode;
}

function downlinkLabel(policy) {
  return DOWNLINK_LABELS[policy] ?? policy;
}

function typeLabel(type) {
  return TYPE_LABELS[type] ?? type;
}

function iterationStatusLabel(status) {
  return (
    {
      current: "当前执行",
      queued: "已切片待做",
      later: "后续扩展",
      done: "已完成",
    }[status] ?? status
  );
}

function toolLabel(stepId) {
  return toolCatalog[stepId]?.label ?? stepId;
}

function selectedSurfaceMode() {
  return currentSurfaceMode;
}

function canUseWorkbench() {
  return LOCAL_WORKBENCH_ENABLED;
}

function persistSurfaceMode(mode) {
  if (!canUseWorkbench()) {
    return;
  }

  localStorage.setItem(SURFACE_MODE_KEY, mode);
}

function renderWorkspaceSwitcher() {
  if (!workspaceSwitcher) {
    return;
  }

  if (!canUseWorkbench()) {
    workspaceSwitcher.hidden = true;
    document.body.dataset.surfaceMode = "showcase";
    return;
  }

  const meta = surfaceModeMeta(selectedSurfaceMode());
  workspaceSwitcher.hidden = false;
  document.body.dataset.surfaceMode = selectedSurfaceMode();
  workspaceModeHint.textContent = meta.hint;
  showcaseModeButton.classList.toggle("is-active", selectedSurfaceMode() === "showcase");
  workbenchModeButton.classList.toggle("is-active", selectedSurfaceMode() === "workbench");
  showcaseModeButton.setAttribute("aria-pressed", String(selectedSurfaceMode() === "showcase"));
  workbenchModeButton.setAttribute("aria-pressed", String(selectedSurfaceMode() === "workbench"));
}

function ensureSurfaceMode(mode) {
  currentSurfaceMode = canUseWorkbench()
    ? resolveSurfaceMode({ hostname: window.location.hostname, storedMode: mode })
    : "showcase";
  persistSurfaceMode(currentSurfaceMode);
  renderWorkspaceSwitcher();
}

function baseScenario() {
  return getScenarioById(scenarioSelect.value || scenarios[0].id);
}

function currentObservation() {
  return observationFromParts(Number(dateSlider.value), Number(hourSlider.value));
}

function buildScenarioSnapshot(observation = currentObservation()) {
  const template = baseScenario();
  if (activeGlobalSelection?.bbox) {
    return buildFocusScenario(template, observation, activeGlobalSelection);
  }
  return materializeScenarioAt(template.id, observation);
}

function activeSelectionSummary(selection = activeGlobalSelection) {
  if (!selection?.bbox) {
    return null;
  }

  const bboxInfo = describeFocusBbox(selection.bbox);
  const profile = adaptiveFocusProfile(selection.bbox);
  return {
    ...bboxInfo,
    profile,
    label: selection.label || `全球选区 ${bboxInfo.label}`,
  };
}

function buildSceneLoadSummary(snapshot) {
  const scaleLabel = snapshot.focusSelection?.scaleLabel || "预设区域";
  const analysisWidth = Math.max(180, Number(snapshot.analysisProfile?.sampleWidth) || 360);
  const route = snapshot.focusSelection
    ? "先使用低分辨率全球总览锁定区域，再按需刷新当前区域底图。"
    : "直接复用当前预设场景的区域底图与异常提取缓存。";

  return {
    title: `${scaleLabel} 按需加载`,
    detail: `${route} 当前异常提取采样宽度约为 ${analysisWidth}px，用于控制切换日期和区域时的加载压力。`,
  };
}

function invalidateObservedScenario() {
  latestObservedScenario = null;
  latestObservedScenarioIntent = "preview";
  latestSceneOverlayDiagnostics = null;
}

function scenarioForAgentExecution(scenario, gate) {
  if (!scenario || !gate) {
    return scenario;
  }

  const adjusted = JSON.parse(JSON.stringify(scenario));
  adjusted.cloudCover = Math.max(Number(scenario.cloudCover) || 0, Number(gate.cloudRatio) || 0);
  adjusted.radiometricQuality = Math.min(
    Number(scenario.radiometricQuality) || 0,
    Number(gate.effectiveQuality) || Number(scenario.radiometricQuality) || 0
  );
  adjusted.analysis = {
    ...adjusted.analysis,
    gateState: gate.state,
    gateLabel: gate.label,
    gateRecommendedAction: gate.recommendedAction,
  };

  if (gate.state === "blocked") {
    adjusted.lowContrast = true;
    adjusted.analysis.summary =
      scenario.type === "wildfire"
        ? `${adjusted.analysis.summary} 当前门禁建议仅保留热点确认结果，并暂停继续进入深度复核链路。`
        : `${adjusted.analysis.summary} 当前门禁已阻断定量反演，执行链路会优先退回异常热区输出。`;
  } else if (gate.state === "warn") {
    adjusted.lowContrast = adjusted.lowContrast || adjusted.radiometricQuality < 0.58;
    adjusted.analysis.summary =
      scenario.type === "wildfire"
        ? `${adjusted.analysis.summary} 当前门禁建议谨慎解释热点结果，并把当前输出视为后续局部复核入口。`
        : `${adjusted.analysis.summary} 当前门禁建议先清洗或降级，执行链路会更保守地处理异常结果。`;
  }

  return adjusted;
}

function recommendedModelSummary(scenario) {
  const availability = buildModelAvailability(scenario, latestModelRuntime, latestStaticPredictionBundle);
  const recommended = recommendModels(
    {
      taskType: scenario.type,
      sensorText: scenario.sensor,
      scaleMeters: estimateSceneScaleMeters(scenario),
      radiometricQuality: scenario.radiometricQuality,
      staticPredictionAvailable: availability["static-scene-prediction"].available,
    },
    availability
  );

  return recommended[0] ?? null;
}

function renderAgentDecisionPanel(
  scenario = latestObservedScenario ?? buildScenarioSnapshot(),
  options = currentOptions()
) {
  const task = currentTask();
  const gate =
    latestPreprocessGate ??
    evaluatePreprocessGate({
      scenario,
      cloudMaskResult: latestCloudMaskResult,
      threshold: currentCloudMaskThreshold(),
    });
  const report = reportMatchesScenario(scenario) ? latestReport : null;
  const previewPlan = getDecisionPreviewPlan({ task, scenario, options, gate, report });
  const model =
    task.status === "ready"
      ? recommendedModelSummary(scenario)
      : {
          label: task.modelTools.slice(0, 2).join(" / "),
          description: "当前以工具链规划为主，端到端执行链路待接入。",
          runtimeStatus: {
            label: task.statusLabel,
          },
        };
  const planForDisplay = {
    ...previewPlan,
    steps: previewPlan.steps.map(toolLabel),
  };
  const memoryCue = buildDecisionMemoryCue(scenario, task, options, previewPlan);
  const snapshot = buildAgentDecisionSnapshot({
    scenario: {
      ...scenario,
      type: task.id,
      title: task.status === "ready" ? scenario.title : `${task.label} · ${scenario.title}`,
      mission:
        task.status === "ready"
          ? scenario.mission
          : `围绕当前区域生成“${task.label}”任务的智能体求解方案，突出数据选择、去云门禁和模型工具组织。`,
    },
    options,
    gate,
    plan: planForDisplay,
    model,
    report,
    memoryCue,
    labels: {
      typeLabel,
      downlinkLabel,
      productLabel,
    },
  });

  agentDecisionPanel.innerHTML = `
    ${snapshot.cards
      .map(
        (card) => `
          <div class="brief-card decision-card ${card.state || ""}">
            <span>${card.title}</span>
            <strong>${card.strong}</strong>
            <p>${card.detail}</p>
          </div>
        `
      )
      .join("")}
    <div class="compare-note decision-note">
      <span>${snapshot.note.title}</span>
      <p>${snapshot.note.detail}</p>
    </div>
  `;

  renderAgentLoopPanel(scenario, options, {
    task,
    gate,
    model,
    report,
    plan: planForDisplay,
  });
}

function renderAgentLoopPanel(
  scenario = latestObservedScenario ?? buildScenarioSnapshot(),
  options = currentOptions(),
  context = null
) {
  if (!agentLoopPanel) {
    return;
  }

  const task = context?.task ?? currentTask();
  const gate =
    context?.gate ??
    latestPreprocessGate ??
    evaluatePreprocessGate({
      scenario,
      cloudMaskResult: latestCloudMaskResult,
      threshold: currentCloudMaskThreshold(),
    });
  const report = context?.report ?? (reportMatchesScenario(scenario) ? latestReport : null);
  const model =
    context?.model ??
    (task.status === "ready"
      ? recommendedModelSummary(scenario)
      : {
          label: task.modelTools.slice(0, 2).join(" / "),
        });
  const plan =
    context?.plan ??
    (task.status === "ready"
      ? {
          steps: (
            report?.agentPlan ?? runAgentMission(scenarioForAgentExecution(scenario, gate), options, readMemory()).plan
          ).steps.map(toolLabel),
        }
      : {
          steps: buildPlanningMissionSnapshot({
            task,
            scenario,
            gate,
            options,
            focusScaleLabel: scenario.focusSelection?.scaleLabel || "当前区域",
          }).steps.map((step) => step.title),
        });

  const snapshot = buildAgentLoopSnapshot({
    task,
    scenario,
    gate,
    model,
    plan,
    report,
    options,
  });

  agentLoopPanel.innerHTML = snapshot.stages
    .map(
      (stage) => `
        <article class="agent-loop-card ${stage.state}">
          <span>${stage.title}</span>
          <strong>${stage.strong}</strong>
          <p>${stage.detail}</p>
        </article>
      `
    )
    .join("");
}

function renderShowcaseSummary(scenario = latestObservedScenario ?? buildScenarioSnapshot(), options = currentOptions()) {
  if (!showcaseSummary) {
    return;
  }

  const task = currentTask();
  const report = reportMatchesScenario(scenario) ? latestReport : null;
  const gate =
    latestPreprocessGate ??
    evaluatePreprocessGate({
      scenario,
      cloudMaskResult: latestCloudMaskResult,
      threshold: currentCloudMaskThreshold(),
    });
  const operationalResult = report?.mode === "operational" ? report.agentResult : null;
  const focusLabel = scenario.focusSelection?.label || scenario.title;
  const scaleLabel = scenario.focusSelection?.scaleLabel || "预设区域";
  const validPixelLabel =
    gate && Number.isFinite(gate.validPixelRatio) ? formatPercent(gate.validPixelRatio) : "待评估";
  const confidenceLabel =
    operationalResult && Number.isFinite(operationalResult.metrics?.confidence)
      ? `${Math.round(operationalResult.metrics.confidence)}%`
      : task.status === "ready"
        ? "待执行"
        : task.statusLabel;
  const outputLabel =
    operationalResult?.state?.outputProduct
      ? productLabel(operationalResult.state.outputProduct)
      : currentTaskMode() === "planning"
        ? "智能体规划中"
        : "等待执行检测";
  const nextActionDetail = operationalResult
    ? operationalResult.state?.processedRois?.length
      ? `已锁定 ${operationalResult.state.processedRois.length} 个重点区域，可继续进入结果解释或深度研判。`
      : operationalResult.success
        ? "当前场景已完成主链执行，可继续查看结果解释与可信度边界。"
        : "当前场景未形成稳定输出，建议优先检查去云门禁与观测时刻。"
    : currentTaskMode() === "planning"
      ? "当前任务将先生成规划方案，再决定是否进入真实执行链路。"
      : "当前摘要基于预览态，正式演示时可直接点击开始演示进入执行链。";

  showcaseSummary.innerHTML = `
    <div class="showcase-summary-grid">
      <article class="brief-card showcase-card">
        <span>区域与任务</span>
        <strong>${focusLabel}</strong>
        <p>${scaleLabel} · ${task.label} · ${scenario.focusSelection?.strategyText || scenario.mission}</p>
      </article>
      <article class="brief-card showcase-card">
        <span>观测与数据</span>
        <strong>${scenario.observation.label}</strong>
        <p>${scenario.imagery.sourceLabel} · ${scenario.analysis.sourceLabel}</p>
      </article>
      <article class="brief-card showcase-card">
        <span>去云门禁</span>
        <strong>${validPixelLabel}</strong>
        <p>${gate?.summary || "当前正在根据云量、质量与时空对齐评估是否进入正式异常检测。"}</p>
      </article>
      <article class="brief-card showcase-card">
        <span>输出动作</span>
        <strong>${outputLabel}</strong>
        <p>结果可信度 ${confidenceLabel} · ${nextActionDetail}</p>
      </article>
    </div>
  `;
}

function renderCapabilityPanel(scenario = latestObservedScenario ?? buildScenarioSnapshot()) {
  const summary = summarizeTaskCatalog(taskCatalog);
  const scaleKey = scenario.focusSelection?.scaleKey || "regional";
  const task = currentTask();
  const selectedCapability = capabilityForTask(task.id, scaleKey);
  const showcaseMode = selectedSurfaceMode() === "showcase";
  const tasksForDisplay = showcaseMode ? taskCatalog.filter((entry) => entry.id === task.id) : taskCatalog;

  capabilitySummary.innerHTML = `
    <div class="capability-summary-grid">
      <div class="brief-card">
        <span>任务覆盖</span>
        <strong>${summary.total} 类任务</strong>
        <p>其中原型可运行 ${summary.ready} 类，工具链待接入 ${summary.adapting} 类，规划中 ${summary.planned} 类。</p>
      </div>
      <div class="brief-card">
        <span>数据来源</span>
        <strong>${summary.dataSourceCount} 类数据源</strong>
        <p>包括 MODIS、VIIRS、Sentinel-2、Landsat 8/9、云掩膜等链路。</p>
      </div>
      <div class="brief-card">
        <span>模型与工具</span>
        <strong>${summary.modelToolCount} 类能力组件</strong>
        <p>覆盖异常提取、连续反演、变化检测、热点检测与结果后处理。</p>
      </div>
      <div class="brief-card">
        <span>当前建议</span>
        <strong>${selectedCapability?.label || "等待选择任务"}</strong>
        <p>${selectedCapability?.recommendedStrategy || "智能体会根据当前区域尺度自动匹配更合适的数据和模型链路。"} 所有定量模型默认都在去云后的有效区域上执行。</p>
      </div>
    </div>
  `;

  capabilityBoard.innerHTML = `
    <div class="capability-card-grid">
      ${tasksForDisplay
        .map((task) => {
          const capability = capabilityForTask(task.id, scaleKey);
          const isSelected = task.id === currentTask().id;
          return `
            <article class="capability-card ${isSelected ? "selected" : ""}">
              <div class="capability-card-top">
                <div>
                  <span>${task.category}</span>
                  <strong>${task.label}</strong>
                </div>
                <span class="capability-badge ${task.status}">${task.statusLabel}</span>
              </div>
              <p>${task.note}</p>
              <div class="capability-list">
                <div>
                  <span>推荐尺度</span>
                  <strong>${task.supportedScales.join(" / ")}</strong>
                </div>
                <div>
                  <span>数据链路</span>
                  <strong>${task.dataSources.slice(0, 3).join(" / ")}</strong>
                </div>
                <div>
                  <span>模型与工具</span>
                  <strong>${task.modelTools.slice(0, 3).join(" / ")}</strong>
                </div>
                <div>
                  <span>去云规则</span>
                  <strong>${task.cloudRule}</strong>
                </div>
                <div>
                  <span>当前区域建议</span>
                  <strong>${capability?.supportedAtScale ? capability.recommendedStrategy : "当前区域尺度不是该任务的优先适用范围。"}</strong>
                </div>
              </div>
            </article>
          `;
        })
        .join("")}
    </div>
    ${
      showcaseMode
        ? `
          <div class="compare-note capability-showcase-note">
            <span>展示收口</span>
            <p>展示版默认只突出当前任务的能力边界，避免把未接通的任务链路与研发中面板混入同一层叙事。</p>
          </div>
        `
        : ""
    }
  `;
}

function globalScreenPointFromEvent(event) {
  const frame = globalOverviewCanvas.querySelector(".global-overview-frame");
  if (!frame) {
    return null;
  }

  const rect = frame.getBoundingClientRect();
  if (!rect.width || !rect.height) {
    return null;
  }

  return {
    x: clamp((event.clientX - rect.left) / rect.width, 0, 1),
    y: clamp((event.clientY - rect.top) / rect.height, 0, 1),
  };
}

function globalPointFromEvent(event) {
  const screenPoint = globalScreenPointFromEvent(event);
  if (!screenPoint) {
    return null;
  }

  return worldPointFromViewportPoint(screenPoint, globalViewport);
}

function selectionFromDraft(draft = globalSelectionDraft) {
  if (!draft?.start || !draft?.current) {
    return null;
  }

  const left = Math.min(draft.start.x, draft.current.x) * 100;
  const top = Math.min(draft.start.y, draft.current.y) * 100;
  const width = Math.abs(draft.start.x - draft.current.x) * 100;
  const height = Math.abs(draft.start.y - draft.current.y) * 100;
  const bbox = percentRectToBbox({ left, top, width, height });
  const summary = describeFocusBbox(bbox);

  return {
    bbox,
    label: `全球选区 ${summary.label}`,
  };
}

function selectionMatches(left, right) {
  if (!left?.bbox || !right?.bbox) {
    return false;
  }

  return left.bbox.every((value, index) => value === right.bbox[index]);
}

function globalZoomLabel() {
  return `${globalViewport.zoom.toFixed(1)}x`;
}

function renderGlobalOverviewControls() {
  if (!globalViewportHint) {
    return;
  }

  const hasOverview = Boolean(globalOverview?.src);
  const hint =
    globalInteractionMode === "pan"
      ? "当前为拖动画面模式，可在放大后的总览底图上平移视图。"
      : "当前为框选模式，可在放大后的总览底图上直接拖拽截选区域。";

  globalSelectModeButton?.classList.toggle("is-active", globalInteractionMode === "select");
  globalPanModeButton?.classList.toggle("is-active", globalInteractionMode === "pan");
  globalSelectModeButton?.setAttribute("aria-pressed", String(globalInteractionMode === "select"));
  globalPanModeButton?.setAttribute("aria-pressed", String(globalInteractionMode === "pan"));
  if (globalZoomOutButton) {
    globalZoomOutButton.disabled = !hasOverview || globalViewport.zoom <= 1.01;
  }
  if (globalZoomResetButton) {
    globalZoomResetButton.disabled = !hasOverview || globalViewport.zoom <= 1.01;
  }
  if (globalZoomInButton) {
    globalZoomInButton.disabled = !hasOverview || globalViewport.zoom >= 5.99;
  }
  globalViewportHint.textContent = `${hint} 当前缩放 ${globalZoomLabel()}。支持滚轮缩放；放大后可切换到拖动画面模式继续浏览。`;
}

function ensureGlobalOverviewShell() {
  let frame = globalOverviewCanvas.querySelector(".global-overview-frame");
  let image = globalOverviewCanvas.querySelector(".global-overview-image");
  let layer = globalOverviewCanvas.querySelector(".global-selection-layer");
  let footnote = globalOverviewCanvas.querySelector(".global-overview-footnote");

  if (!frame || !image || !layer || !footnote) {
    globalOverviewCanvas.innerHTML = `
      <div class="global-overview-frame">
        <img class="global-overview-image" alt="" draggable="false" />
        <div class="global-selection-layer"></div>
      </div>
      <div class="global-overview-footnote"></div>
    `;
    frame = globalOverviewCanvas.querySelector(".global-overview-frame");
    image = globalOverviewCanvas.querySelector(".global-overview-image");
    layer = globalOverviewCanvas.querySelector(".global-selection-layer");
    footnote = globalOverviewCanvas.querySelector(".global-overview-footnote");
  }

  return { frame, image, layer, footnote };
}

function renderGlobalSelectionStatus() {
  const pending = activeSelectionSummary(pendingGlobalSelection);
  const active = activeSelectionSummary(activeGlobalSelection);

  if (!pending && !active) {
    globalSelectionStatus.innerHTML = `
      <div class="brief-card">
        <span>当前状态</span>
        <strong>等待从全球底图中圈定区域</strong>
        <p>可先放大到目标附近，再拖拽截选区域，随后点击“应用到当前任务”。智能体会根据区域跨度自动选择更合适的数据分辨率与处理策略。</p>
      </div>
      <div class="brief-card">
        <span>性能策略</span>
        <strong>先低分总览，后局部高分</strong>
        <p>当前只加载一张低分全球总览图。真正的区域底图会在你应用选区后再按需请求，避免拖拽时反复重渲染。</p>
      </div>
      <div class="brief-card">
        <span>当前视图</span>
        <strong>${globalZoomLabel()}</strong>
        <p>${globalInteractionMode === "pan" ? "正在拖动画面" : "正在框选区域"} · 鼠标滚轮可缩放，放大后可切换到拖动画面模式浏览细节。</p>
      </div>
    `;
    globalApplySelectionButton.disabled = true;
    globalClearSelectionButton.disabled = true;
    renderGlobalOverviewControls();
    return;
  }

  const preview = pending ?? active;
  const modeText = pending
    ? active
      ? "下方区域视图仍在使用上一次已应用的选区。若要切换，请点击“应用到当前任务”。"
      : "点击“应用到当前任务”后，下方“场景示意”会切换为该区域的放大视图。"
    : "下方“场景示意”已经切换为该区域的放大视图，可以直接开始智能体处理。";
  globalSelectionStatus.innerHTML = `
    <div class="brief-card">
      <span>${pending ? "待应用区域" : "当前区域"}</span>
      <strong>${preview.label}</strong>
      <p>中心 ${preview.label.replace("全球选区 ", "")} · 跨度 ${preview.lonSpan}° × ${preview.latSpan}° · ${preview.scaleLabel}</p>
    </div>
    <div class="brief-card">
      <span>智能体建议</span>
      <strong>${preview.profile.sensorLabel}</strong>
      <p>${preview.profile.strategyText}</p>
    </div>
    <div class="brief-card">
      <span>当前模式</span>
      <strong>${active ? "已应用到区域视图" : "尚未应用到区域视图"}</strong>
      <p>${modeText}</p>
    </div>
    <div class="brief-card">
      <span>当前视图</span>
      <strong>${globalZoomLabel()}</strong>
      <p>${globalInteractionMode === "pan" ? "拖动画面模式" : "框选区域模式"} · 放大后可更精细地截选局地目标。</p>
    </div>
  `;
  globalApplySelectionButton.disabled = !pending;
  globalClearSelectionButton.disabled = !active && !pending;
  renderGlobalOverviewControls();
}

function renderGlobalOverviewPanel() {
  if (!globalOverview?.src) {
    globalOverviewCanvas.innerHTML = '<div class="empty-state">正在加载全球总览底图，稍后即可从中框选任意区域。</div>';
    renderGlobalOverviewControls();
    renderGlobalSelectionStatus();
    return;
  }

  const shell = ensureGlobalOverviewShell();
  shell.frame.dataset.interactionMode = globalInteractionMode;
  if (shell.image.dataset.sceneSrc !== globalOverview.src) {
    shell.image.src = globalOverview.src;
    shell.image.dataset.sceneSrc = globalOverview.src;
  }
  shell.image.alt = "全球遥感总览底图";
  shell.image.decoding = "async";
  const viewportStyle = globalViewportStyle(globalViewport);
  shell.image.style.width = `${viewportStyle.widthPercent}%`;
  shell.image.style.height = `${viewportStyle.heightPercent}%`;
  shell.image.style.left = `${viewportStyle.leftPercent}%`;
  shell.image.style.top = `${viewportStyle.topPercent}%`;
  shell.layer.style.width = `${viewportStyle.widthPercent}%`;
  shell.layer.style.height = `${viewportStyle.heightPercent}%`;
  shell.layer.style.left = `${viewportStyle.leftPercent}%`;
  shell.layer.style.top = `${viewportStyle.topPercent}%`;

  const activeRect = activeGlobalSelection ? bboxToPercentRect(activeGlobalSelection.bbox) : null;
  const pendingSelection = selectionFromDraft() ?? pendingGlobalSelection;
  const pendingRect = pendingSelection ? bboxToPercentRect(pendingSelection.bbox) : null;

  const overlays = [];
  if (activeRect) {
    overlays.push(`
      <div class="global-selection-box" style="left:${activeRect.left}%;top:${activeRect.top}%;width:${activeRect.width}%;height:${activeRect.height}%;">
        <div class="global-selection-tag">
          <strong>当前区域</strong>
          <span>${activeGlobalSelection.label}</span>
        </div>
      </div>
    `);
  }
  if (pendingRect && !selectionMatches(pendingSelection, activeGlobalSelection)) {
    overlays.push(`
      <div class="global-selection-box pending" style="left:${pendingRect.left}%;top:${pendingRect.top}%;width:${pendingRect.width}%;height:${pendingRect.height}%;">
        <div class="global-selection-tag">
          <strong>待应用区域</strong>
          <span>${pendingSelection.label}</span>
        </div>
      </div>
    `);
  }
  if (globalSelectionDraft?.start && globalSelectionDraft?.current) {
    const left = Math.min(globalSelectionDraft.start.x, globalSelectionDraft.current.x) * 100;
    const top = Math.min(globalSelectionDraft.start.y, globalSelectionDraft.current.y) * 100;
    const width = Math.abs(globalSelectionDraft.start.x - globalSelectionDraft.current.x) * 100;
    const height = Math.abs(globalSelectionDraft.start.y - globalSelectionDraft.current.y) * 100;
    overlays.push(
      `<div class="global-selection-draft" style="left:${left}%;top:${top}%;width:${width}%;height:${height}%"></div>`
    );
  }

  shell.layer.innerHTML = overlays.join("");
  shell.footnote.textContent = `${globalOverview.sourceLabel}。${globalOverview.note} 当前视图缩放 ${globalZoomLabel()}。`;
  renderGlobalSelectionStatus();
}

async function refreshGlobalOverviewPanel() {
  const token = ++globalOverviewRefreshToken;
  if (globalOverviewAbortController) {
    globalOverviewAbortController.abort();
  }
  globalOverviewAbortController = new AbortController();
  const requestedDay = toInputDateValue(currentObservation());
  if (globalOverview?.day !== requestedDay) {
    globalOverview = null;
    renderGlobalOverviewPanel();
  }

  let overview;
  try {
    overview = await fetchGlobalOverview(currentObservation(), {
      signal: globalOverviewAbortController.signal,
    });
  } catch (error) {
    if (isAbortError(error)) {
      return;
    }
    throw error;
  }
  if (token !== globalOverviewRefreshToken) {
    return;
  }

  globalOverview = overview;
  renderGlobalOverviewPanel();
}

function applyPendingGlobalSelection() {
  if (!pendingGlobalSelection?.bbox) {
    return;
  }

  applyGlobalSelectionState(pendingGlobalSelection);
  pendingGlobalSelection = null;
  renderGlobalOverviewPanel();
}

function applyGlobalSelectionState(selection) {
  const normalized = activeSelectionSummary(selection);
  if (!normalized?.bbox) {
    return;
  }

  activeGlobalSelection = {
    bbox: normalized.bbox,
    label: selection.label || `全球选区 ${normalized.label}`,
    scaleLabel: normalized.scaleLabel,
    strategyText: normalized.profile.strategyText,
    centerLabel: normalized.label,
    lonSpan: normalized.lonSpan,
    latSpan: normalized.latSpan,
  };
  invalidateObservedScenario();
  clearResultPanels();
  resetDataAccessPanels();
  scheduleScenarioPreview();
}

function clearGlobalSelection() {
  pendingGlobalSelection = null;
  activeGlobalSelection = null;
  globalSelectionDraft = null;
  globalPanDrag = null;
  globalViewport = createGlobalViewportState();
  globalInteractionMode = "select";
  invalidateObservedScenario();
  clearResultPanels();
  resetDataAccessPanels();
  scheduleScenarioPreview();
  renderGlobalOverviewPanel();
}

function renderScenarioSelect() {
  scenarioSelect.innerHTML = scenarios
    .map((scenario) => `<option value="${scenario.id}">${scenario.title}</option>`)
    .join("");
}

function readyTaskScenarioId(taskId) {
  return (
    {
      dust: "dust-frontier",
      pollution: "urban-plume",
      mixed: "twilight-edge",
      wildfire: "indochina-hotspot",
    }[taskId] ?? null
  );
}

function currentTask() {
  return getTaskById(taskTypeSelect.value) ?? getTaskById(baseScenario().type) ?? taskCatalog[0];
}

function currentTaskMode() {
  return currentTask().status === "ready" ? "operational" : "planning";
}

function renderTaskTypeSelect() {
  taskTypeSelect.innerHTML = taskCatalog
    .map((task) => `<option value="${task.id}">${task.label} · ${task.statusLabel}</option>`)
    .join("");
}

function updateRunActionLabels() {
  const mode = currentTaskMode();
  if (mode === "planning") {
    runButton.textContent = "生成求解方案";
    sceneRunButton.textContent = "用当前时刻生成方案";
    return;
  }

  runButton.textContent = "开始演示";
  sceneRunButton.textContent = "用当前时刻开始演示";
}

function renderIterationBoard() {
  const summary = summarizeIterationPlan();
  const validation = validateIterationPlan();
  const currentModule = getCurrentIterationModule();
  const nextModules = getNextIterationModules(3);
  const phaseGroups = buildPhaseGroups();

  iterationSummary.innerHTML = `
    <div class="iteration-summary-grid">
      <div class="brief-card iteration-focus-card">
        <span>当前执行</span>
        <strong>${currentModule.title}</strong>
        <p>${currentModule.summary}</p>
      </div>
      <div class="brief-card iteration-focus-card">
        <span>本轮输出</span>
        <strong>${currentModule.output}</strong>
        <p>输入：${currentModule.input} · 复杂度 ${currentModule.complexity} · 依赖：${currentModule.dependencies.join(
          "、"
        )}</p>
      </div>
      <div class="brief-card iteration-focus-card">
        <span>门禁状态</span>
        <strong>${validation.ok ? "已通过结构校验" : "存在结构问题"}</strong>
        <p>总模块 ${summary.total} 个 · 当前 ${summary.byStatus.current} 个 · 排队 ${summary.byStatus.queued} 个</p>
      </div>
    </div>
    <div class="iteration-rule-list">
      ${deliveryPrinciples
        .map(
          (principle, index) => `
            <div class="compare-note iteration-rule-card">
              <span>开发原则 ${index + 1}</span>
              <p>${principle}</p>
            </div>
          `
        )
        .join("")}
    </div>
    <div class="iteration-next-card">
      <span>下一批候选模块</span>
      <strong>${nextModules.map((module) => module.title).join(" · ")}</strong>
      <p>等你确认当前模块展示方式和切片粒度后，再进入下一步实现。</p>
    </div>
  `;

  iterationBoard.innerHTML = phaseGroups
    .map(
      (phase, phaseIndex) => `
        <section class="iteration-stage">
          <div class="iteration-stage-head">
            <div>
              <span>阶段 ${phaseIndex + 1}</span>
              <strong>${phase.label}</strong>
            </div>
            <p>${phase.description}</p>
          </div>
          <div class="iteration-stage-meta">
            <span>共 ${phase.counts.total} 个模块</span>
            <span>当前 ${phase.counts.current}</span>
            <span>待做 ${phase.counts.queued}</span>
            <span>后续 ${phase.counts.later}</span>
          </div>
          <div class="iteration-module-grid">
            ${phase.modules
              .map(
                (module) => `
                  <article class="iteration-module-card ${module.status}">
                    <div class="iteration-module-top">
                      <span class="iteration-status-badge ${module.status}">${iterationStatusLabel(
                        module.status
                      )}</span>
                      <span class="iteration-size-badge">复杂度 ${module.complexity}</span>
                    </div>
                    <strong>${module.title}</strong>
                    <p>${module.summary}</p>
                    <div class="iteration-module-meta">
                      <div><span>输入</span><strong>${module.input}</strong></div>
                      <div><span>输出</span><strong>${module.output}</strong></div>
                      <div><span>依赖</span><strong>${module.dependencies.join("、")}</strong></div>
                    </div>
                    <div class="iteration-acceptance">
                      <span>验收标准</span>
                      ${module.acceptance
                        .map(
                          (item, index) => `
                            <div class="iteration-check-item">
                              <strong>${index + 1}.</strong>
                              <p>${item}</p>
                            </div>
                          `
                        )
                        .join("")}
                    </div>
                  </article>
                `
              )
              .join("")}
          </div>
        </section>
      `
    )
    .join("");
}

function selectedRoiPreset() {
  return roiInputPresets.find((preset) => preset.id === roiPresetSelect.value) ?? roiInputPresets[0];
}

function renderRoiPresetSelect() {
  roiPresetSelect.innerHTML = roiInputPresets
    .map((preset) => `<option value="${preset.id}">${preset.label}</option>`)
    .join("");
}

function fillRoiInputFromPreset() {
  const preset = selectedRoiPreset();
  roiPresetHint.innerHTML = `
    <div class="compare-note">
      <span>当前示例</span>
      <p>${preset.description}</p>
    </div>
  `;
  roiInput.value = formatRoiJson(preset.value);
}

function renderRoiValidationSuccess(normalizedRoi) {
  roiValidationStatus.innerHTML = `
    <div class="brief-card roi-status-card ok">
      <span>校验结果</span>
      <strong>ROI 合法，可进入下一环节</strong>
      <p>已统一为 EPSG:4326 Polygon 结构，并补齐 bbox、面积和中心点信息。</p>
    </div>
  `;

  roiValidationChecks.innerHTML = `
    <div class="brief-card roi-check-card">
      <span>输入来源</span>
      <strong>${normalizedRoi.sourceType === "bbox" ? "bbox 输入" : "polygon 输入"}</strong>
      <p>统一输出同一套 ROI 契约，后续检索与推理不再区分输入来源。</p>
    </div>
    <div class="brief-card roi-check-card">
      <span>边界框</span>
      <strong>${normalizedRoi.bbox.join(", ")}</strong>
      <p>最小外接框已自动归一化，可直接用于 STAC 检索和切片索引。</p>
    </div>
    <div class="brief-card roi-check-card">
      <span>面积与中心</span>
      <strong>${normalizedRoi.areaSquareKm} km²</strong>
      <p>中心点 ${normalizedRoi.centroid.join(", ")} · 顶点数 ${normalizedRoi.vertexCount}</p>
    </div>
  `;

  roiValidationOutput.textContent = formatRoiJson(normalizedRoi);
}

function renderRoiValidationError(error) {
  roiValidationStatus.innerHTML = `
    <div class="brief-card roi-status-card fail">
      <span>校验结果</span>
      <strong>ROI 不合法，已阻止进入后续流程</strong>
      <p>${error.message}</p>
    </div>
  `;

  roiValidationChecks.innerHTML = `
    <div class="brief-card roi-check-card">
      <span>当前门禁</span>
      <strong>结构化校验未通过</strong>
      <p>这一步会在进入 STAC 检索、推理和结果切片前提前拦截错误输入。</p>
    </div>
    <div class="brief-card roi-check-card">
      <span>重点检查</span>
      <strong>坐标范围 / 自交 / 闭合性</strong>
      <p>本模块当前只负责最基础的 bbox / polygon 契约校验，不处理绘制和编辑。</p>
    </div>
  `;

  roiValidationOutput.textContent = error.stack || error.message;
}

function validateRoiLabInput() {
  try {
    const parsed = JSON.parse(roiInput.value);
    const normalized = normalizeRoiDefinition(parsed, {
      id: parsed?.id ?? parsed?.properties?.id ?? "roi-lab-input",
    });
    renderRoiValidationSuccess(normalized);
  } catch (error) {
    renderRoiValidationError(error);
  } finally {
    renderStacContextPanel();
    renderLaadsContextPanel();
    renderAssetContextPanel();
  }
}

function activeRoiDrawingScenario() {
  return latestObservedScenario ?? buildScenarioSnapshot();
}

function drawingSceneSignature(scenario) {
  return `${scenario.id}:${scenario.focusSelection?.cacheKey || "preset"}:${scenario.observation.dateValue}:${String(
    scenario.observation.hour
  ).padStart(2, "0")}`;
}

function drawingPointFromEvent(event) {
  const rect = roiDrawCanvas.getBoundingClientRect();
  if (!rect.width || !rect.height) {
    return null;
  }

  return {
    x: (event.clientX - rect.left) / rect.width,
    y: (event.clientY - rect.top) / rect.height,
  };
}

function drawingPointsToPercent(points) {
  return points.map((point) => `${(point.x * 100).toFixed(2)},${(point.y * 100).toFixed(2)}`).join(" ");
}

function syncRoiDrawingScene(scenario, { preserveMode = true } = {}) {
  const signature = drawingSceneSignature(scenario);
  if (signature === roiDrawingSceneKey) {
    return;
  }

  const nextMode = preserveMode ? roiDrawingState.mode : "bbox";
  roiDrawingState = createDrawingState(nextMode);
  roiDrawingSceneKey = signature;
}

function ensureRoiDrawCanvasShell(scenario) {
  let frame = roiDrawCanvas.querySelector(".roi-draw-frame");
  let image = roiDrawCanvas.querySelector(".roi-draw-image");
  let overlay = roiDrawCanvas.querySelector(".roi-draw-overlay");
  let footnote = roiDrawCanvas.querySelector(".roi-draw-footnote");

  if (!frame || !image || !overlay || !footnote) {
    roiDrawCanvas.innerHTML = `
      <div class="roi-draw-frame">
        <img class="roi-draw-image" alt="" draggable="false" />
        <svg class="roi-draw-overlay" viewBox="0 0 100 100" preserveAspectRatio="none"></svg>
      </div>
      <div class="roi-draw-footnote"></div>
    `;
    frame = roiDrawCanvas.querySelector(".roi-draw-frame");
    image = roiDrawCanvas.querySelector(".roi-draw-image");
    overlay = roiDrawCanvas.querySelector(".roi-draw-overlay");
    footnote = roiDrawCanvas.querySelector(".roi-draw-footnote");
  }

  frame.style.setProperty("--scene-ratio", scenario.imagery.aspectRatio);
  if (image.dataset.sceneSrc !== scenario.imagery.src) {
    image.src = scenario.imagery.src;
    image.dataset.sceneSrc = scenario.imagery.src;
  }
  image.alt = `${scenario.title} ROI 绘制底图`;

  return { overlay, footnote };
}

function renderRoiDrawingLab(scenario = activeRoiDrawingScenario()) {
  if (!scenario?.imagery?.src) {
    roiDrawCanvas.innerHTML = '<div class="empty-state">正在加载当前场景底图，稍后可在这里进行 ROI 绘制。</div>';
    roiDrawStatusTitle.textContent = "等待底图";
    roiDrawStatusText.textContent = "当前场景底图加载完成后，就可以直接开始框选或描点。";
    roiDrawList.innerHTML = '<div class="empty-state">当前还没有已绘制的 ROI。</div>';
    return;
  }

  const selected = selectedRoi(roiDrawingState);
  const draft = roiDrawingState.draft;
  const handles = selected
    ? selected.points
        .map(
          (point, index) => `
            <circle
              class="roi-draw-handle"
              cx="${(point.x * 100).toFixed(2)}"
              cy="${(point.y * 100).toFixed(2)}"
              r="1.35"
              data-roi-id="${selected.id}"
              data-handle-index="${index}"
            ></circle>
          `
        )
        .join("")
    : "";

  const shapes = roiDrawingState.rois
    .map((roi) => {
      const selectedClass = roi.id === roiDrawingState.selectedRoiId ? " selected" : "";
      if (roi.type === "bbox") {
        const bounds = roi.bounds;
        return `
          <rect
            class="roi-draw-shape bbox${selectedClass}"
            x="${(bounds.minX * 100).toFixed(2)}"
            y="${(bounds.minY * 100).toFixed(2)}"
            width="${((bounds.maxX - bounds.minX) * 100).toFixed(2)}"
            height="${((bounds.maxY - bounds.minY) * 100).toFixed(2)}"
            data-roi-id="${roi.id}"
          ></rect>
        `;
      }

      return `
        <polygon
          class="roi-draw-shape polygon${selectedClass}"
          points="${drawingPointsToPercent(roi.points)}"
          data-roi-id="${roi.id}"
        ></polygon>
      `;
    })
    .join("");

  let draftMarkup = "";
  if (draft?.type === "bbox") {
    const minX = Math.min(draft.anchor.x, draft.current.x);
    const minY = Math.min(draft.anchor.y, draft.current.y);
    const maxX = Math.max(draft.anchor.x, draft.current.x);
    const maxY = Math.max(draft.anchor.y, draft.current.y);
    draftMarkup = `
      <rect
        class="roi-draw-draft"
        x="${(minX * 100).toFixed(2)}"
        y="${(minY * 100).toFixed(2)}"
        width="${((maxX - minX) * 100).toFixed(2)}"
        height="${((maxY - minY) * 100).toFixed(2)}"
      ></rect>
    `;
  } else if (draft?.type === "polygon" && draft.points.length) {
    draftMarkup = `
      <polyline class="roi-draw-draft-line" points="${drawingPointsToPercent(draft.points)}"></polyline>
      ${draft.points
        .map(
          (point) => `
            <circle
              class="roi-draw-draft-point"
              cx="${(point.x * 100).toFixed(2)}"
              cy="${(point.y * 100).toFixed(2)}"
              r="1.1"
            ></circle>
          `
        )
        .join("")}
    `;
  }

  const shell = ensureRoiDrawCanvasShell(scenario);
  shell.overlay.innerHTML = `${shapes}${draftMarkup}${handles}`;
  shell.footnote.textContent = `当前底图：${scenario.imagery.sourceLabel}。${
    roiDrawingState.mode === "bbox"
      ? "框选模式下请在图上按下并拖拽。"
      : "多边形模式下请单击图面逐点描绘，再点击“完成多边形”。"
  }`;

  roiDrawStatusTitle.textContent = selected
    ? "已选中 ROI"
    : draft
    ? draft.type === "bbox"
      ? "正在框选 ROI"
      : `多边形草稿：${draft.points.length} 个顶点`
    : "等待绘制";
  roiDrawStatusText.textContent = selected
    ? `${roiSummary(selected)}。拖动控制点可编辑，点击“提交到 ROI 校验”可生成结构化结果。`
    : draft
    ? "当前草稿尚未提交为正式 ROI。"
    : "当前还没有正式 ROI。你可以先框选一个区域，或切换到多边形模式逐点描绘。";

  if (!roiDrawingState.rois.length) {
    roiDrawList.innerHTML = '<div class="empty-state">当前还没有已绘制的 ROI。</div>';
    return;
  }

  roiDrawList.innerHTML = roiDrawingState.rois
    .map(
      (roi) => `
        <button class="roi-draw-item${roi.id === roiDrawingState.selectedRoiId ? " active" : ""}" data-roi-item-id="${roi.id}">
          <span>${roi.id}</span>
          <strong>${roi.type === "bbox" ? "框选 ROI" : "多边形 ROI"}</strong>
          <small>${roi.points.length} 个控制点</small>
        </button>
      `
    )
    .join("");
}

function submitSelectedRoiToValidation() {
  const scenario = activeRoiDrawingScenario();
  const selected = selectedRoi(roiDrawingState);
  if (!selected || !scenario?.imageryProfile?.bbox) {
    return;
  }

  const feature = roiToFeature(selected, scenario.imageryProfile.bbox, {
    scenario_id: scenario.id,
    observation: scenario.observation.label,
  });
  roiInput.value = formatRoiJson(feature);
  validateRoiLabInput();
}

function renderLayerCatalogPanel() {
  const summary = summarizeLayerCatalog(layerCatalog);

  layerCatalogSummary.innerHTML = `
    <div class="layer-summary-grid">
      <div class="brief-card layer-summary-card">
        <span>配置版本</span>
        <strong>${summary.version}</strong>
        <p>页面、场景和图层解析都从这一版配置读取，便于回放与追溯。</p>
      </div>
      <div class="brief-card layer-summary-card">
        <span>门禁状态</span>
        <strong>${layerCatalogHealth.ok ? "已通过 fail-fast 校验" : "配置存在问题"}</strong>
        <p>imagery ${summary.imageryCount} 层 · analysis ${summary.analysisCount} 层 · 传感器 ${summary.sensorCount} 类</p>
      </div>
      <div class="brief-card layer-summary-card">
        <span>单一来源</span>
        <strong>配置变更无需改渲染逻辑</strong>
        <p>底图候选顺序、分析层标签、图例地址和提供方信息都由配置中心统一维护。</p>
      </div>
    </div>
  `;

  const imageryCards = layerCatalog.imageryLayers
    .slice()
    .sort((left, right) => left.defaultPriority - right.defaultPriority)
    .map(
      (layer) => `
        <article class="layer-card">
          <div class="layer-card-top">
            <span class="layer-badge">底图候选</span>
            <span class="layer-priority">优先级 ${layer.defaultPriority}</span>
          </div>
          <strong>${layer.label}</strong>
          <p>${layer.description}</p>
          <div class="layer-meta-grid">
            <div><span>传感器</span><strong>${layer.sensor} / ${layer.platform}</strong></div>
            <div><span>提供方</span><strong>${layer.provider}</strong></div>
            <div><span>更新频率</span><strong>${layer.cadenceLabel}</strong></div>
            <div><span>图层名</span><strong>${layer.layer}</strong></div>
          </div>
        </article>
      `
    )
    .join("");

  const analysisCards = layerCatalog.analysisLayers
    .map(
      (layer) => `
        <article class="layer-card analysis">
          <div class="layer-card-top">
            <span class="layer-badge analysis">分析层</span>
            <span class="layer-priority">${layer.task}</span>
          </div>
          <strong>${layer.label}</strong>
          <p>${layer.description}</p>
          <div class="layer-meta-grid">
            <div><span>传感器</span><strong>${layer.sensor} / ${layer.platform}</strong></div>
            <div><span>提供方</span><strong>${layer.provider}</strong></div>
            <div><span>默认方法</span><strong>${layer.defaultMethodLabel}</strong></div>
            <div><span>图例地址</span><strong>已配置</strong></div>
          </div>
        </article>
      `
    )
    .join("");

  const scenarioBindings = scenarios
    .map((scenario) => {
      const imageryLabels = scenario.imageryProfile.dailyLayers
        .map((id) => getImageryLayerConfig(id).label)
        .join(" → ");
      const analysisLayer = getAnalysisLayerConfig(scenario.analysisProfile.layerId);

      return `
        <article class="layer-binding-card">
          <span>场景绑定</span>
          <strong>${scenario.title}</strong>
          <p>${scenario.sensor}</p>
          <div class="layer-binding-line"><strong>底图回退链：</strong><span>${imageryLabels}</span></div>
          <div class="layer-binding-line"><strong>分析层：</strong><span>${analysisLayer.label}</span></div>
        </article>
      `;
    })
    .join("");

  layerCatalogBoard.innerHTML = `
    <section class="layer-section">
      <div class="layer-section-head">
        <div>
          <span>底图配置</span>
          <strong>候选真彩色遥感底图</strong>
        </div>
        <p>当前日期切换和回退顺序都由配置中心控制，不再散落在多个文件里。</p>
      </div>
      <div class="layer-card-grid">${imageryCards}</div>
    </section>
    <section class="layer-section">
      <div class="layer-section-head">
        <div>
          <span>分析配置</span>
          <strong>异常提取与图例来源</strong>
        </div>
        <p>分析层标签、图例地址和默认异常提取方法统一从配置中心读取。</p>
      </div>
      <div class="layer-card-grid">${analysisCards}</div>
    </section>
    <section class="layer-section">
      <div class="layer-section-head">
        <div>
          <span>场景绑定</span>
          <strong>每个演示场景实际使用的配置</strong>
        </div>
        <p>后续新增图层或切换优先级时，这里的绑定关系会自动更新。</p>
      </div>
      <div class="layer-binding-grid">${scenarioBindings}</div>
    </section>
  `;
}

function renderBasemapProxyPanel(status = latestProxyStatus) {
  if (!status) {
    proxySummary.innerHTML = `
      <div class="proxy-summary-grid">
        <div class="brief-card">
          <span>代理状态</span>
          <strong>正在检测本地代理</strong>
          <p>页面启动后会检查是否已接入本地 GIBS 代理服务。</p>
        </div>
      </div>
    `;
    return;
  }

  if (!status.available) {
    proxySummary.innerHTML = `
      <div class="proxy-summary-grid">
        <div class="brief-card">
          <span>当前模式</span>
          <strong>直连官方 GIBS</strong>
          <p>当前运行环境没有接入本地代理，原因：${status.reason || "unknown"}。</p>
        </div>
        <div class="brief-card">
          <span>说明</span>
          <strong>缓存与错误码不可见</strong>
          <p>只有在本地通过 \`node server.js\` 运行时，才会启用本地代理与缓存统计。</p>
        </div>
      </div>
    `;
    return;
  }

  proxySummary.innerHTML = `
    <div class="proxy-summary-grid">
      <div class="brief-card">
        <span>当前模式</span>
        <strong>本地代理已启用</strong>
        <p>上游：${status.upstream} · 最近一次缓存结果：${status.lastCacheStatus}</p>
      </div>
      <div class="brief-card">
        <span>缓存统计</span>
        <strong>${status.entries} 条缓存记录</strong>
        <p>命中 ${status.hits} 次 · 未命中 ${status.misses} 次 · 写入 ${status.writes} 次</p>
      </div>
      <div class="brief-card">
        <span>最近请求</span>
        <strong>${status.lastRequestAt ? status.lastRequestAt.replace("T", " ").slice(0, 19) : "暂无"}</strong>
        <p>${status.lastKey ? `最近 key：${status.lastKey}` : "当前还没有代理请求。"}</p>
      </div>
    </div>
  `;
}

async function refreshBasemapProxyPanel() {
  latestProxyStatus = await fetchBasemapProxyStatus();
  renderBasemapProxyPanel(latestProxyStatus);
}

function isoDateShift(dateValue, offsetDays) {
  const base = new Date(`${dateValue}T00:00:00`);
  base.setDate(base.getDate() + offsetDays);
  return `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, "0")}-${String(base.getDate()).padStart(2, "0")}`;
}

function truncateMiddle(value, head = 42, tail = 18) {
  const text = String(value || "");
  if (text.length <= head + tail + 3) {
    return text;
  }
  return `${text.slice(0, head)}...${text.slice(-tail)}`;
}

function currentSpatialTemporalContext(sourceValue, windowDays) {
  const scenario = activeRoiDrawingScenario();
  const endDate = scenario.observation.dateValue;
  const normalizedWindow = Math.max(1, Number(windowDays) || 1);
  const startDate = isoDateShift(endDate, -(normalizedWindow - 1));

  if (sourceValue === "roi") {
    const parsed = JSON.parse(roiInput.value);
    const normalized = normalizeRoiDefinition(parsed, {
      id: parsed?.id ?? parsed?.properties?.id ?? "roi-lab-input",
    });

    return {
      bbox: normalized.bbox,
      sourceLabel: `已校验 ROI：${normalized.id}`,
      startDate,
      endDate,
      scene: scenario,
    };
  }

  return {
    bbox: scenario.imageryProfile.bbox,
    sourceLabel: `当前场景范围：${scenario.title}`,
    startDate,
    endDate,
    scene: scenario,
  };
}

async function loadStacCatalog() {
  try {
    const response = await fetch("/api/stac-catalog");
    if (!response.ok) {
      throw new Error(`目录加载失败：${response.status}`);
    }

    stacCatalog = await response.json();
  } catch (error) {
    stacCatalog = null;
    stacSummary.innerHTML = `
      <div class="brief-card">
        <span>目录状态</span>
        <strong>STAC 目录加载失败</strong>
        <p>${error.message}</p>
      </div>
    `;
  }
}

function selectedStacProvider() {
  return stacCatalog?.providers?.find((provider) => provider.id === stacProviderSelect.value) ?? null;
}

function renderStacCatalogControls() {
  if (!stacCatalog?.providers?.length) {
    stacProviderSelect.innerHTML = '<option value="">本地 STAC 目录不可用</option>';
    stacCollectionSelect.innerHTML = '<option value="">暂无 collection</option>';
    return;
  }

  stacProviderSelect.innerHTML = stacCatalog.providers
    .map((provider) => `<option value="${provider.id}">${provider.label}</option>`)
    .join("");
  stacProviderSelect.value = stacCatalog.defaultProviderId;
  renderStacCollectionOptions();
}

function renderStacCollectionOptions() {
  const provider = selectedStacProvider();
  if (!provider) {
    stacCollectionSelect.innerHTML = '<option value="">暂无 collection</option>';
    return;
  }

  stacCollectionSelect.innerHTML = provider.collections
    .map((collection) => `<option value="${collection.id}">${collection.label}</option>`)
    .join("");
}

function currentStacRequestContext() {
  return currentSpatialTemporalContext(stacSourceSelect.value, stacWindowSelect.value);
}

function renderStacContextPanel() {
  try {
    const context = currentStacRequestContext();
    const provider = selectedStacProvider();
    stacContext.innerHTML = `
      <div class="stac-summary-grid">
        <div class="brief-card">
          <span>当前检索上下文</span>
          <strong>${context.sourceLabel}</strong>
          <p>时间范围 ${context.startDate} 到 ${context.endDate} · bbox ${context.bbox.join(", ")}</p>
        </div>
        <div class="brief-card">
          <span>Provider 说明</span>
          <strong>${provider?.label || "未选择 provider"}</strong>
          <p>${provider?.description || "当前还没有可用的 provider 描述。"}</p>
        </div>
      </div>
    `;
  } catch (error) {
    stacContext.innerHTML = `
      <div class="brief-card">
        <span>当前检索上下文</span>
        <strong>无法使用已校验 ROI</strong>
        <p>${error.message}</p>
      </div>
    `;
  }
}

function renderStacResults(result = latestStacResult) {
  if (!result) {
    stacSummary.innerHTML = `
      <div class="brief-card">
        <span>检索状态</span>
        <strong>等待执行 STAC 检索</strong>
        <p>当前模块只验证 bbox、时间范围和 collection 是否能被统一送入 STAC 搜索接口。</p>
      </div>
    `;
    stacResults.innerHTML = '<div class="empty-state">运行检索后，这里会列出返回的 STAC Items。</div>';
    return;
  }

  stacSummary.innerHTML = `
    <div class="stac-summary-grid">
      <div class="brief-card">
        <span>Provider</span>
        <strong>${result.providerLabel}</strong>
        <p>${result.request.sourceLabel}</p>
      </div>
      <div class="brief-card">
        <span>结果概览</span>
        <strong>${result.itemCount} 个 Items</strong>
        <p>共抓取 ${result.pagesFetched} 页 · collections: ${result.request.collections.join(", ")} · 过滤 ${result.filteredOutCount || 0} 个非目标 Items</p>
      </div>
      <div class="brief-card">
        <span>时间范围</span>
        <strong>${result.request.datetime.replace("T00:00:00Z/", " 至 ").replace("T23:59:59Z", "")}</strong>
        <p>limit ${result.request.limit} · bbox ${result.request.bbox.join(", ")}</p>
      </div>
    </div>
  `;

  if (!result.features.length) {
    stacResults.innerHTML = '<div class="empty-state">当前查询没有返回 Items，这是正常空结果，说明适配器已经完成了空结果处理。</div>';
    return;
  }

  stacResults.innerHTML = result.features
    .map(
      (item) => `
        <article class="stac-item-card">
          <span>${item.collection}</span>
          <strong>${item.id}</strong>
          <p>${item.datetime || "无时间字段"} · 云量 ${
            item.cloudCover === null || item.cloudCover === undefined ? "未知" : `${item.cloudCover}`
          } · assets ${item.assets}</p>
          <p>${item.primaryAssetUrl ? `首选资产：${truncateMiddle(item.primaryAssetUrl, 38, 16)}` : "当前结果没有可直接读取的首选资产 URL"}</p>
        </article>
      `
    )
    .join("");
}

async function runStacSearch() {
  if (!stacCatalog) {
    await loadStacCatalog();
    renderStacCatalogControls();
  }

  let context;
  try {
    context = currentStacRequestContext();
  } catch (error) {
    stacSummary.innerHTML = `
      <div class="brief-card">
        <span>检索状态</span>
        <strong>STAC 检索未执行</strong>
        <p>${error.message}</p>
      </div>
    `;
    return;
  }

  stacSearchButton.disabled = true;
  stacSearchButton.textContent = "检索中...";
  stacSummary.innerHTML = `
    <div class="brief-card">
      <span>检索状态</span>
      <strong>正在请求 STAC 接口</strong>
      <p>${context.sourceLabel} · ${context.startDate} 到 ${context.endDate}</p>
    </div>
  `;

  try {
    const payload = {
      providerId: stacProviderSelect.value,
      collections: [stacCollectionSelect.value],
      bbox: context.bbox,
      startDate: context.startDate,
      endDate: context.endDate,
      limit: selectedStacProvider()?.defaultLimit || 6,
      sourceLabel: context.sourceLabel,
    };
    const response = await fetch("/api/stac-search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.message || result.error || "STAC 检索失败");
    }

    latestStacResult = result;
    renderStacResults(result);
    renderAdvancedPreprocessPanel();
    syncAssetUrlInputFromSource();
  } catch (error) {
    latestStacResult = null;
    renderAdvancedPreprocessPanel();
    stacSummary.innerHTML = `
      <div class="brief-card">
        <span>检索状态</span>
        <strong>STAC 检索失败</strong>
        <p>${error.message}</p>
      </div>
    `;
    stacResults.innerHTML = '<div class="empty-state">本次没有返回结果，请检查 provider、collection 或 ROI 约束。</div>';
  } finally {
    stacSearchButton.disabled = false;
    stacSearchButton.textContent = "检索 STAC Items";
  }
}

async function loadLaadsCatalog() {
  try {
    const response = await fetch("/api/laads-catalog");
    if (!response.ok) {
      throw new Error(`目录加载失败：${response.status}`);
    }

    laadsCatalog = await response.json();
  } catch (error) {
    laadsCatalog = null;
    laadsSummary.innerHTML = `
      <div class="brief-card">
        <span>目录状态</span>
        <strong>LAADS 产品目录加载失败</strong>
        <p>${error.message}</p>
      </div>
    `;
  }
}

function selectedLaadsProduct() {
  return laadsCatalog?.products?.find((product) => product.id === laadsProductSelect.value) ?? null;
}

function renderLaadsCatalogControls() {
  if (!laadsCatalog?.products?.length) {
    laadsProductSelect.innerHTML = '<option value="">暂无可用 product</option>';
    return;
  }

  laadsProductSelect.innerHTML = laadsCatalog.products
    .map((product) => `<option value="${product.id}">${product.label}</option>`)
    .join("");
  laadsProductSelect.value = laadsCatalog.defaultProductId;
}

function currentLaadsRequestContext() {
  return currentSpatialTemporalContext(laadsSourceSelect.value, laadsWindowSelect.value);
}

function renderLaadsContextPanel() {
  try {
    const context = currentLaadsRequestContext();
    const product = selectedLaadsProduct();
    laadsContext.innerHTML = `
      <div class="stac-summary-grid">
        <div class="brief-card">
          <span>当前检索上下文</span>
          <strong>${context.sourceLabel}</strong>
          <p>时间范围 ${context.startDate} 到 ${context.endDate} · bbox ${context.bbox.join(", ")}</p>
        </div>
        <div class="brief-card">
          <span>Product 说明</span>
          <strong>${product?.label || "未选择 product"}</strong>
          <p>${product?.description || "当前还没有可用的 product 描述。"}${product?.requiresToken ? " 下载正式文件时需要 Earthdata token。" : ""}</p>
        </div>
      </div>
    `;
  } catch (error) {
    laadsContext.innerHTML = `
      <div class="brief-card">
        <span>当前检索上下文</span>
        <strong>无法使用已校验 ROI</strong>
        <p>${error.message}</p>
      </div>
    `;
  }
}

function renderLaadsPlan(plan = latestLaadsPlan) {
  if (!plan) {
    laadsPlan.innerHTML = '<div class="empty-state">完成检索后，可把前 1 个、前 3 个或全部结果生成带 token 占位符的下载计划。</div>';
    return;
  }

  laadsPlan.innerHTML = `
    <div class="brief-card">
      <span>下载计划</span>
      <strong>${plan.fileCount} 个文件 · ${plan.totalSizeMb} MB</strong>
      <p>目标目录 ${plan.targetDirectory} · 认证方式 ${plan.authMode}</p>
    </div>
    <div class="laads-plan-grid">
      <pre>${plan.powerShellScript}</pre>
      <pre>${plan.shellScript}</pre>
    </div>
  `;
}

function renderLaadsResults(result = latestLaadsResult) {
  if (!result) {
    laadsSummary.innerHTML = `
      <div class="brief-card">
        <span>检索状态</span>
        <strong>等待执行 LAADS 检索</strong>
        <p>当前模块先验证官方 MODIS 产品能否按 ROI 和日期稳定返回文件列表。</p>
      </div>
    `;
    laadsResults.innerHTML = '<div class="empty-state">运行检索后，这里会列出返回的官方文件。</div>';
    renderLaadsPlan();
    return;
  }

  laadsSummary.innerHTML = `
    <div class="stac-summary-grid">
      <div class="brief-card">
        <span>Product</span>
        <strong>${result.productLabel}</strong>
        <p>${result.request.sourceLabel}</p>
      </div>
      <div class="brief-card">
        <span>结果概览</span>
        <strong>${result.itemCount} 个文件</strong>
        <p>共抓取 ${result.pagesFetched} 页 · 过滤 ${result.filteredOutCount || 0} 个非目标文件</p>
      </div>
      <div class="brief-card">
        <span>时间范围</span>
        <strong>${result.request.startDate} 至 ${result.request.endDate}</strong>
        <p>bbox ${result.request.bbox.join(", ")} · limit ${result.request.limit}</p>
      </div>
    </div>
  `;

  if (!result.items.length) {
    laadsResults.innerHTML = '<div class="empty-state">当前查询没有返回文件，这是正常空结果，说明 LAADS 适配器已完成空结果处理。</div>';
    renderLaadsPlan();
    return;
  }

  laadsResults.innerHTML = result.items
    .map(
      (item) => `
        <article class="laads-item-card">
          <span>${item.productId}</span>
          <strong>${item.name}</strong>
          <p>${item.datetime || item.dataDay || "无时间字段"} · ${item.fileType.toUpperCase()} · ${item.sizeMb ?? "未知"} MB</p>
          <p>${item.downloadsLink ? `下载入口：${truncateMiddle(item.downloadsLink, 40, 18)}` : "当前文件没有暴露下载链接"}</p>
        </article>
      `
    )
    .join("");
  renderLaadsPlan();
}

async function runLaadsSearch() {
  if (!laadsCatalog) {
    await loadLaadsCatalog();
    renderLaadsCatalogControls();
  }

  let context;
  try {
    context = currentLaadsRequestContext();
  } catch (error) {
    laadsSummary.innerHTML = `
      <div class="brief-card">
        <span>检索状态</span>
        <strong>LAADS 检索未执行</strong>
        <p>${error.message}</p>
      </div>
    `;
    return;
  }

  laadsSearchButton.disabled = true;
  laadsSearchButton.textContent = "检索中...";
  laadsSummary.innerHTML = `
    <div class="brief-card">
      <span>检索状态</span>
      <strong>正在请求 LAADS 官方接口</strong>
      <p>${context.sourceLabel} · ${context.startDate} 到 ${context.endDate}</p>
    </div>
  `;

  try {
    const payload = {
      productId: laadsProductSelect.value,
      bbox: context.bbox,
      startDate: context.startDate,
      endDate: context.endDate,
      limit: 6,
      sourceLabel: context.sourceLabel,
    };
    const response = await fetch("/api/laads-search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.message || result.error || "LAADS 检索失败");
    }

    latestLaadsResult = result;
    latestLaadsPlan = null;
    renderLaadsResults(result);
    renderAdvancedPreprocessPanel();
    syncAssetUrlInputFromSource();
  } catch (error) {
    latestLaadsResult = null;
    latestLaadsPlan = null;
    renderAdvancedPreprocessPanel();
    laadsSummary.innerHTML = `
      <div class="brief-card">
        <span>检索状态</span>
        <strong>LAADS 检索失败</strong>
        <p>${error.message}</p>
      </div>
    `;
    laadsResults.innerHTML = '<div class="empty-state">本次没有返回结果，请检查 product、时间窗口或 ROI 约束。</div>';
    renderLaadsPlan();
  } finally {
    laadsSearchButton.disabled = false;
    laadsSearchButton.textContent = "检索 LAADS 文件";
  }
}

function selectedLaadsPlanItems() {
  if (!latestLaadsResult?.items?.length) {
    return [];
  }

  if (laadsPlanCountSelect.value === "all") {
    return latestLaadsResult.items;
  }

  const count = Math.max(1, Number(laadsPlanCountSelect.value) || 1);
  return latestLaadsResult.items.slice(0, count);
}

async function runLaadsPlan() {
  const items = selectedLaadsPlanItems();
  if (!items.length) {
    latestLaadsPlan = null;
    laadsPlan.innerHTML = '<div class="empty-state">当前还没有检索结果，先运行 LAADS 检索再生成下载计划。</div>';
    return;
  }

  laadsPlanButton.disabled = true;
  laadsPlanButton.textContent = "生成中...";

  try {
    const response = await fetch("/api/laads-download-plan", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        productId: latestLaadsResult.productId,
        items,
        targetDirectory: "./data/laads",
      }),
    });
    const plan = await response.json();
    if (!response.ok) {
      throw new Error(plan.message || plan.error || "下载计划生成失败");
    }

    latestLaadsPlan = plan;
    renderLaadsPlan(plan);
  } catch (error) {
    latestLaadsPlan = null;
    laadsPlan.innerHTML = `<div class="empty-state">${error.message}</div>`;
  } finally {
    laadsPlanButton.disabled = false;
    laadsPlanButton.textContent = "生成下载计划";
  }
}

function resolveAssetTarget() {
  if (assetSourceSelect.value === "manual") {
    return {
      assetUrl: assetUrlInput.value.trim(),
      sourceType: "manual",
      sourceLabel: "手动输入 URL",
    };
  }

  if (assetSourceSelect.value === "laads") {
    const file = latestLaadsResult?.items?.find((item) => item.downloadsLink);
    return {
      assetUrl: file?.downloadsLink || "",
      sourceType: "laads_latest",
      sourceLabel: file ? `LAADS：${file.name}` : "LAADS 检索结果为空",
    };
  }

  const item = latestStacResult?.features?.find((feature) => feature.primaryAssetUrl);
  return {
    assetUrl: item?.primaryAssetUrl || "",
    sourceType: "stac_latest",
    sourceLabel: item ? `STAC：${item.id}` : "STAC 结果没有首选资产",
  };
}

function syncAssetUrlInputFromSource() {
  const target = resolveAssetTarget();
  assetUrlInput.disabled = assetSourceSelect.value !== "manual";
  if (assetSourceSelect.value !== "manual") {
    assetUrlInput.value = target.assetUrl || "";
  }
  renderAssetContextPanel();
}

function currentAssetInspectContext() {
  const spatial = currentSpatialTemporalContext(assetWindowSourceSelect.value, 1);
  const target = resolveAssetTarget();

  if (!target.assetUrl) {
    throw new Error("当前来源还没有可用资产 URL，请先执行对应检索或改用手动输入。");
  }

  return {
    assetUrl: target.assetUrl,
    sourceType: target.sourceType,
    sourceLabel: `${target.sourceLabel} · ${spatial.sourceLabel}`,
    window: {
      bbox: spatial.bbox,
      width: 512,
      height: 512,
    },
  };
}

function renderAssetContextPanel() {
  try {
    const context = currentAssetInspectContext();
    assetContext.innerHTML = `
      <div class="asset-summary-grid">
        <div class="brief-card">
          <span>当前资产</span>
          <strong>${truncateMiddle(context.assetUrl, 44, 20)}</strong>
          <p>${context.sourceLabel}</p>
        </div>
        <div class="brief-card">
          <span>窗口契约</span>
          <strong>${context.window.width} × ${context.window.height}</strong>
          <p>bbox ${context.window.bbox.join(", ")} · EPSG:4326</p>
        </div>
        <div class="brief-card">
          <span>读取目标</span>
          <strong>先验证读取策略，再决定是否进入真正 patch 读取</strong>
          <p>这一版只做资产检查和窗口契约，不直接读像元。</p>
        </div>
      </div>
    `;
  } catch (error) {
    assetContext.innerHTML = `
      <div class="brief-card">
        <span>当前资产</span>
        <strong>无法构造资产检查请求</strong>
        <p>${error.message}</p>
      </div>
    `;
  }
}

function renderAssetInspection(result = latestAssetInspection) {
  if (!result) {
    assetSummary.innerHTML = `
      <div class="brief-card">
        <span>检查状态</span>
        <strong>等待执行资产检查</strong>
        <p>当前模块先判断资产是否支持远端窗口读取，再决定走哪条后续链路。</p>
      </div>
    `;
    assetContractOutput.textContent = "// 运行资产检查后，这里会输出统一窗口契约 JSON。";
    return;
  }

  assetSummary.innerHTML = `
    <div class="asset-summary-grid">
      <div class="brief-card">
        <span>资产类型</span>
        <strong>${result.readPlan.formatLabel}</strong>
        <p>${result.request.sourceLabel}</p>
      </div>
      <div class="brief-card">
        <span>HTTP 能力</span>
        <strong>${result.probe.accessible ? "可访问" : "不可访问"}</strong>
        <p>HEAD ${result.probe.headStatus ?? "无"} · Range ${result.probe.supportsHttpRange ? "支持" : "不支持"} · content-type ${result.probe.contentType || "未知"}</p>
      </div>
      <div class="brief-card">
        <span>读取策略</span>
        <strong>${result.readPlan.reader}</strong>
        <p>${result.readPlan.suggestedNextStep}</p>
      </div>
    </div>
  `;
  assetContractOutput.textContent = JSON.stringify(result.windowContract, null, 2);
}

async function runAssetInspection() {
  let context;
  try {
    context = currentAssetInspectContext();
  } catch (error) {
    latestAssetInspection = null;
    assetSummary.innerHTML = `
      <div class="brief-card">
        <span>检查状态</span>
        <strong>资产检查未执行</strong>
        <p>${error.message}</p>
      </div>
    `;
    assetContractOutput.textContent = "";
    return;
  }

  assetInspectButton.disabled = true;
  assetInspectButton.textContent = "检查中...";
  assetSummary.innerHTML = `
    <div class="brief-card">
      <span>检查状态</span>
      <strong>正在探测资产访问能力</strong>
      <p>${truncateMiddle(context.assetUrl, 52, 18)}</p>
    </div>
  `;

  try {
    const response = await fetch("/api/asset-inspect", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(context),
    });
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.message || result.error || "资产检查失败");
    }

    latestAssetInspection = result;
    renderAssetInspection(result);
  } catch (error) {
    latestAssetInspection = null;
    assetSummary.innerHTML = `
      <div class="brief-card">
        <span>检查状态</span>
        <strong>资产检查失败</strong>
        <p>${error.message}</p>
      </div>
    `;
    assetContractOutput.textContent = "";
  } finally {
    assetInspectButton.disabled = false;
    assetInspectButton.textContent = "检查资产读取策略";
  }
}

async function fetchModelRuntimeStatus() {
  try {
    const response = await fetch("/api/model-status");
    if (!response.ok) {
      return {
        available: false,
        reason: `status_${response.status}`,
      };
    }
    return response.json();
  } catch {
    return {
      available: false,
      reason: "network_error",
    };
  }
}

function estimateSceneScaleMeters(scenario) {
  const sensorText = `${scenario.sensor || ""} ${scenario.imagery?.sourceLabel || ""}`;
  if (sensorText.includes("Sentinel")) {
    return 10;
  }
  if (sensorText.includes("Landsat")) {
    return 30;
  }
  if (sensorText.includes("VIIRS")) {
    return 750;
  }
  return 1000;
}

function buildModelAvailability(scenario, runtimeStatus, staticBundle) {
  const dateValue = scenario.observation.dateValue;
  return {
    "local-aod-inversion-net":
      scenario.supportsLocalModel === false
        ? {
            available: false,
            reason: "focus_selection_unregistered",
          }
        : runtimeStatus || {
            available: false,
            reason: "not_checked",
          },
    "static-scene-prediction": {
      available: Boolean(staticBundle?.predictions?.[scenario.id]?.[dateValue]),
    },
  };
}

function renderModelRegistryPanel(scenario = activeRoiDrawingScenario(), runtimeStatus = latestModelRuntime, staticBundle = null) {
  const validation = validateModelRegistry();
  const summary = summarizeModelRegistry(modelRegistry);
  const availability = buildModelAvailability(scenario, runtimeStatus, staticBundle);
  const recommended = recommendModels(
    {
      taskType: scenario.type,
      sensorText: scenario.sensor,
      scaleMeters: estimateSceneScaleMeters(scenario),
      radiometricQuality: scenario.radiometricQuality,
      staticPredictionAvailable: availability["static-scene-prediction"].available,
    },
    availability
  );

  modelRegistrySummary.innerHTML = `
    <div class="model-summary-grid">
      <div class="brief-card">
        <span>注册表版本</span>
        <strong>${modelRegistryVersion}</strong>
        <p>共 ${summary.total} 个模型条目 · runtime ${Object.entries(summary.runtimes)
          .map(([key, value]) => `${key}:${value}`)
          .join(" · ")}</p>
      </div>
      <div class="brief-card">
        <span>结构校验</span>
        <strong>${validation.ok ? "已通过 fail-fast 校验" : "注册表存在问题"}</strong>
        <p>${validation.ok ? "当前每个模型都声明了 task、sensor、scale 和 runtime。" : validation.errors.join("；")}</p>
      </div>
      <div class="brief-card">
        <span>当前推荐</span>
        <strong>${recommended[0]?.label || "暂无推荐"}</strong>
        <p>${recommended[0]?.runtimeStatus?.detail || "等待当前场景与运行时状态完成匹配。"}</p>
      </div>
    </div>
  `;

  modelRegistryBoard.innerHTML = `
    <div class="model-card-grid">
      ${recommended
        .map(
          (model) => `
            <article class="model-card">
              <div class="model-card-top">
                <span class="model-badge ${model.runtimeStatus.state}">${model.runtimeStatus.label}</span>
                <span class="model-runtime">${model.runtime}</span>
              </div>
              <strong>${model.label}</strong>
              <p>${model.description}</p>
              <div class="model-meta-grid">
                <div>
                  <span>任务类型</span>
                  <strong>${model.tasks.join(" / ")}</strong>
                </div>
                <div>
                  <span>分辨率范围</span>
                  <strong>${model.scaleRangeMeters[0]}-${model.scaleRangeMeters[1]} m</strong>
                </div>
                <div>
                  <span>输出</span>
                  <strong>${model.outputs.join(" / ")}</strong>
                </div>
              </div>
              <p>传感器提示：${model.sensorHints.join(", ")} · 版本 ${model.version} · 推荐分 ${model.recommendationScore}</p>
            </article>
          `
        )
        .join("")}
    </div>
  `;
}

async function refreshModelRegistryPanel() {
  const scenario = latestObservedScenario ?? buildScenarioSnapshot();
  const [runtimeStatus, staticBundle] = await Promise.all([fetchModelRuntimeStatus(), fetchStaticPredictionBundle()]);
  latestModelRuntime = runtimeStatus;
  latestStaticPredictionBundle = staticBundle;
  renderModelRegistryPanel(scenario, runtimeStatus, staticBundle);
  renderAgentDecisionPanel(scenario, currentOptions());
}

function currentCloudMaskThreshold() {
  return Number(cloudMaskThresholdInput.value) || 0.45;
}

function renderCloudMaskThreshold() {
  cloudMaskThresholdValue.textContent = `${Math.round(currentCloudMaskThreshold() * 100)}%`;
}

async function loadCloudMaskCatalog() {
  try {
    const response = await fetch("/api/cloud-mask-catalog");
    if (!response.ok) {
      throw new Error(`目录加载失败：${response.status}`);
    }
    cloudMaskCatalog = await response.json();
  } catch (error) {
    cloudMaskCatalog = null;
    cloudMaskSummary.innerHTML = `
      <div class="brief-card">
        <span>目录状态</span>
        <strong>云掩膜目录加载失败</strong>
        <p>${error.message}</p>
      </div>
    `;
  }
}

function selectedCloudMaskProduct() {
  return cloudMaskCatalog?.products?.find((product) => product.id === cloudMaskProductSelect.value) ?? null;
}

function renderCloudMaskCatalogControls() {
  if (!cloudMaskCatalog?.products?.length) {
    cloudMaskProductSelect.innerHTML = '<option value="">暂无可用 product</option>';
    return;
  }

  cloudMaskProductSelect.innerHTML = cloudMaskCatalog.products
    .map((product) => `<option value="${product.id}">${product.label}</option>`)
    .join("");
  cloudMaskProductSelect.value = cloudMaskCatalog.defaultProductId;
}

function currentCloudMaskRequestContext() {
  return currentSpatialTemporalContext(cloudMaskSourceSelect.value, cloudMaskWindowSelect.value);
}

function renderCloudMaskContextPanel() {
  try {
    const context = currentCloudMaskRequestContext();
    const product = selectedCloudMaskProduct();
    cloudMaskContext.innerHTML = `
      <div class="stac-summary-grid">
        <div class="brief-card">
          <span>当前检索上下文</span>
          <strong>${context.sourceLabel}</strong>
          <p>时间范围 ${context.startDate} 到 ${context.endDate} · bbox ${context.bbox.join(", ")}</p>
        </div>
        <div class="brief-card">
          <span>Product 说明</span>
          <strong>${product?.label || "未选择 product"}</strong>
          <p>${product?.description || "当前还没有可用的 product 描述。"} · 阈值 ${Math.round(currentCloudMaskThreshold() * 100)}%</p>
        </div>
      </div>
    `;
  } catch (error) {
    cloudMaskContext.innerHTML = `
      <div class="brief-card">
        <span>当前检索上下文</span>
        <strong>无法使用已校验 ROI</strong>
        <p>${error.message}</p>
      </div>
    `;
  }
}

function renderCloudMaskResults(result = latestCloudMaskResult) {
  if (!result) {
    cloudMaskSummary.innerHTML = `
      <div class="brief-card">
        <span>检索状态</span>
        <strong>等待执行云掩膜检索</strong>
        <p>当前模块会优先检索 MOD35 / CLDMSK 官方文件，再进入预处理门禁评估。</p>
      </div>
    `;
    cloudMaskResults.innerHTML = '<div class="empty-state">运行检索后，这里会列出可用的云掩膜文件。</div>';
    return;
  }

  cloudMaskSummary.innerHTML = `
    <div class="stac-summary-grid">
      <div class="brief-card">
        <span>Product</span>
        <strong>${result.productLabel}</strong>
        <p>${result.request.sourceLabel}</p>
      </div>
      <div class="brief-card">
        <span>结果概览</span>
        <strong>${result.itemCount} 个文件</strong>
        <p>估计覆盖 ${formatPercent(result.estimatedCoverage)} · 门限 ${Math.round(result.request.threshold * 100)}%</p>
      </div>
      <div class="brief-card">
        <span>可用度</span>
        <strong>${Math.round(result.confidence * 100)}%</strong>
        <p>时间范围 ${result.request.startDate} 至 ${result.request.endDate}</p>
      </div>
    </div>
  `;

  if (!result.items.length) {
    cloudMaskResults.innerHTML = '<div class="empty-state">当前查询没有返回文件，后续预处理门禁会自动转入缺测回退逻辑。</div>';
    return;
  }

  cloudMaskResults.innerHTML = result.items
    .map(
      (item) => `
        <article class="cloud-mask-item-card">
          <span>${item.productId}</span>
          <strong>${item.name}</strong>
          <p>${item.datetime || item.dataDay || "无时间字段"} · ${item.fileType.toUpperCase()} · ${item.sizeMb ?? "未知"} MB</p>
          <p>${item.downloadsLink ? `下载入口：${truncateMiddle(item.downloadsLink, 40, 18)}` : "当前文件没有暴露下载链接"}</p>
        </article>
      `
    )
    .join("");
}

function recomputePreprocessGate() {
  const scenario = latestObservedScenario ?? buildScenarioSnapshot();
  latestPreprocessGate = evaluatePreprocessGate({
    scenario,
    cloudMaskResult: latestCloudMaskResult,
    threshold: currentCloudMaskThreshold(),
  });
  renderPreprocessGatePanel(latestPreprocessGate, scenario);
  renderAgentDecisionPanel(scenario, currentOptions());
}

function renderPreprocessGatePanel(gate = latestPreprocessGate, scenario = latestObservedScenario) {
  const currentScenario = scenario ?? buildScenarioSnapshot();
  if (!gate) {
    preprocessGateSummary.innerHTML = `
      <div class="brief-card">
        <span>门禁状态</span>
        <strong>等待云掩膜结果</strong>
        <p>当前还没有云掩膜检索结果，系统会先使用场景原始云量做保守估计。</p>
      </div>
    `;
    return;
  }

  preprocessGateSummary.innerHTML = `
    <div class="cache-summary-grid">
      <div class="brief-card preprocess-state-card ${gate.state}">
        <span>门禁结论</span>
        <strong>${gate.label}</strong>
        <p>${gate.recommendedAction}</p>
      </div>
      <div class="brief-card">
        <span>质量估计</span>
        <strong>有效像元 ${formatPercent(gate.validPixelRatio)}</strong>
        <p>估计云比 ${formatPercent(gate.cloudRatio)} · 有效质量 ${formatPercent(gate.effectiveQuality)}</p>
      </div>
      <div class="brief-card">
        <span>当前场景</span>
        <strong>${currentScenario.title}</strong>
        <p>原始云量 ${formatPercent(currentScenario.cloudCover)} · 原始辐射质量 ${formatPercent(currentScenario.radiometricQuality)}</p>
      </div>
    </div>
    <div class="compare-note">
      <span>触发原因</span>
      <p>${gate.reasons.length ? gate.reasons.join("；") : "当前没有触发额外风险项，可直接进入推理。"}${gate.maskFiles ? ` · 已检索 ${gate.maskFiles} 个官方云掩膜文件` : ""}</p>
    </div>
  `;
}

async function runCloudMaskSearch() {
  if (!cloudMaskCatalog) {
    await loadCloudMaskCatalog();
    renderCloudMaskCatalogControls();
  }

  let context;
  try {
    context = currentCloudMaskRequestContext();
  } catch (error) {
    cloudMaskSummary.innerHTML = `
      <div class="brief-card">
        <span>检索状态</span>
        <strong>云掩膜检索未执行</strong>
        <p>${error.message}</p>
      </div>
    `;
    return;
  }

  cloudMaskSearchButton.disabled = true;
  cloudMaskSearchButton.textContent = "检索中...";

  try {
    const response = await fetch("/api/cloud-mask-search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        productId: cloudMaskProductSelect.value,
        bbox: context.bbox,
        startDate: context.startDate,
        endDate: context.endDate,
        threshold: currentCloudMaskThreshold(),
        limit: 6,
        sourceLabel: context.sourceLabel,
      }),
    });
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.message || result.error || "云掩膜检索失败");
    }

    latestCloudMaskResult = result;
    renderCloudMaskResults(result);
    recomputePreprocessGate();
  } catch (error) {
    latestCloudMaskResult = null;
    cloudMaskSummary.innerHTML = `
      <div class="brief-card">
        <span>检索状态</span>
        <strong>云掩膜检索失败</strong>
        <p>${error.message}</p>
      </div>
    `;
    cloudMaskResults.innerHTML = '<div class="empty-state">本次没有返回结果，后续门禁会回退到场景原始云量估计。</div>';
    recomputePreprocessGate();
  } finally {
    cloudMaskSearchButton.disabled = false;
    cloudMaskSearchButton.textContent = "检索云掩膜文件";
  }
}

async function currentRecommendedModelsSnapshot(scenario) {
  const [runtimeStatus, staticBundle] = await Promise.all([fetchModelRuntimeStatus(), fetchStaticPredictionBundle()]);
  latestModelRuntime = runtimeStatus;
  latestStaticPredictionBundle = staticBundle;
  const availability = buildModelAvailability(scenario, runtimeStatus, staticBundle);
  const recommended = recommendModels(
    {
      taskType: scenario.type,
      sensorText: scenario.sensor,
      scaleMeters: estimateSceneScaleMeters(scenario),
      radiometricQuality: scenario.radiometricQuality,
      staticPredictionAvailable: availability["static-scene-prediction"].available,
    },
    availability
  );

  return {
    recommended,
    runtimeStatus,
    staticBundle,
  };
}

function renderRunnerContext() {
  const scenario = latestObservedScenario ?? buildScenarioSnapshot();
  runnerContext.innerHTML = `
    <div class="cache-summary-grid">
      <div class="brief-card">
        <span>当前场景</span>
        <strong>${scenario.title}</strong>
        <p>${scenario.observation.label}</p>
      </div>
      <div class="brief-card">
        <span>预处理门禁</span>
        <strong>${latestPreprocessGate?.label || "等待评估"}</strong>
        <p>${latestPreprocessGate?.recommendedAction || "先执行云掩膜检索或沿用场景估计。"}</p>
      </div>
      <div class="brief-card">
        <span>Runner 目标</span>
        <strong>优先跑通最小推理闭环</strong>
        <p>本模块会在本地推理、静态回放和规则降级之间自动选一条路径。</p>
      </div>
    </div>
  `;
}

function renderInferenceRunSummary(run = latestInferenceRun) {
  if (!run) {
    runnerSummary.innerHTML = `
      <div class="brief-card">
        <span>执行状态</span>
        <strong>等待执行推理 Runner</strong>
        <p>点击上方按钮后，这里会显示本次实际走了哪条推理路径。</p>
      </div>
    `;
    return;
  }

  runnerSummary.innerHTML = `
    <div class="cache-summary-grid">
      <div class="brief-card">
        <span>执行路径</span>
        <strong>${run.plan.modelLabel}</strong>
        <p>${run.plan.recommendedAction}</p>
      </div>
      <div class="brief-card">
        <span>运行结果</span>
        <strong>${productLabel(run.summary.outputProduct)}</strong>
        <p>ROI ${run.summary.roiCount} 个 · 耗时 ${run.summary.elapsedMs} ms · fallback ${run.summary.fallbackUsed ? "是" : "否"}</p>
      </div>
      <div class="brief-card">
        <span>说明</span>
        <strong>${run.sourceLabel}</strong>
        <p>${run.note}</p>
      </div>
    </div>
  `;
}

async function runInferenceRunnerPanel() {
  if (previewAbortController) {
    previewAbortController.abort();
  }
  const scenario =
    latestObservedScenarioIntent === "execution" && latestObservedScenario
      ? latestObservedScenario
      : await getObservedScenario(buildScenarioSnapshot(), { intent: "execution" });
  latestObservedScenario = scenario;
  latestObservedScenarioIntent = "execution";
  if (!latestPreprocessGate) {
    recomputePreprocessGate();
  }

  runnerRunButton.disabled = true;
  runnerRunButton.textContent = "执行中...";
  runnerSummary.innerHTML = `
    <div class="brief-card">
      <span>执行状态</span>
      <strong>正在组织推理链路</strong>
      <p>智能体正在结合预处理门禁、模型路由和当前区域结果，选择最合适的执行入口。</p>
    </div>
  `;

  try {
    const snapshot = await currentRecommendedModelsSnapshot(scenario);
    const plan = buildInferenceExecutionPlan({
      recommendedModels: snapshot.recommended,
      preprocessGate: latestPreprocessGate,
      taskType: scenario.type,
    });
    const startedAt = performance.now();
    let rois = scenario.rois;
    let outputProduct = scenario.type === "wildfire" ? "thermal-hotspot-map" : "quantitative-retrieval";
    let fallbackUsed = false;
    let sourceLabel = "规则型回退";
    let note = "当前使用页面已有 ROI 结果继续推进。";

    if (plan.runner === "python_local") {
      const query = new URLSearchParams({
        scene: scenario.id,
        date: scenario.observation.dateValue,
      });
      const response = await fetch(`api/model-infer?${query.toString()}`);
      if (response.ok) {
        const payload = await response.json();
        rois = Array.isArray(payload.rois) && payload.rois.length ? payload.rois : scenario.rois;
        outputProduct = payload.output_product || (scenario.type === "wildfire" ? "thermal-hotspot-map" : "quantitative-retrieval");
        fallbackUsed = Boolean(payload.fallback_used);
        sourceLabel = "本地 Python 推理";
        note = payload.summary || "已调用本地连续反演模型。";
      } else {
        fallbackUsed = true;
        outputProduct = scenario.type === "wildfire" ? "thermal-hotspot-map" : "anomaly-heatmap";
        sourceLabel = "本地模型不可用，降级为规则型结果";
        note = scenario.type === "wildfire" ? "模型接口返回失败，已自动退回到页面已有热点确认结果。" : "模型接口返回失败，已自动退回到页面已有 ROI。";
      }
    } else if (plan.runner === "static_replay") {
      const payload = snapshot.staticBundle?.predictions?.[scenario.id]?.[scenario.observation.dateValue];
      if (payload) {
        rois = Array.isArray(payload.rois) && payload.rois.length ? payload.rois : scenario.rois;
        outputProduct = scenario.type === "wildfire" ? "thermal-hotspot-map" : "quantitative-retrieval";
        fallbackUsed = Boolean(payload.fallback_used);
        sourceLabel = "静态预测回放";
        note = payload.summary || "已回放当前日期的静态预测结果。";
      }
    } else if (plan.runner === "degraded_heatmap") {
      rois = scenario.rois.slice(0, Math.max(1, Math.min(2, scenario.rois.length)));
      outputProduct = "anomaly-heatmap";
      fallbackUsed = true;
      sourceLabel = "门禁阻断后降级";
      note = "由于预处理门禁未通过，当前只保留少量热区结果。";
    } else {
      outputProduct =
        scenario.type === "wildfire"
          ? "thermal-hotspot-map"
          : latestPreprocessGate?.state === "warn"
            ? "anomaly-heatmap"
            : "quantitative-retrieval";
      sourceLabel = scenario.type === "wildfire" ? "官方热异常专题结果" : "官方 AOD 连通域结果";
      note =
        scenario.type === "wildfire"
          ? "当前直接复用页面已有热点簇结果，生成最小热点确认输出。"
          : "当前直接复用页面已有异常 ROI 作为最小推理输出。";
    }

    const elapsedMs = performance.now() - startedAt;
    latestInferenceRun = {
      plan,
      summary: summarizeInferenceRun({
        plan,
        elapsedMs,
        roiCount: rois.length,
        fallbackUsed,
        outputProduct,
      }),
      rois,
      outputProduct,
      sourceLabel,
      note,
    };
    renderInferenceRunSummary(latestInferenceRun);
    renderAgentDecisionPanel(scenario, currentOptions());
  } finally {
    runnerRunButton.disabled = false;
    runnerRunButton.textContent = "执行最小推理";
  }
}

function renderVectorSummary(collection = latestVectorCollection) {
  if (!collection) {
    vectorSummary.innerHTML = `
      <div class="brief-card">
        <span>矢量状态</span>
        <strong>等待生成 GeoJSON</strong>
        <p>当前模块会把场景 ROI 或推理结果转成统一的 FeatureCollection。</p>
      </div>
    `;
    vectorOutput.textContent = "";
    return;
  }

  const summary = summarizeFeatureCollection(collection);
  vectorSummary.innerHTML = `
    <div class="cache-summary-grid">
      <div class="brief-card">
        <span>要素数量</span>
        <strong>${summary.featureCount}</strong>
        <p>其中重点区域 ${summary.selectedCount} 个</p>
      </div>
      <div class="brief-card">
        <span>面积汇总</span>
        <strong>${summary.totalAreaKm2} km²</strong>
        <p>当前是基于 ROI 包围框的近似面积估计。</p>
      </div>
      <div class="brief-card">
        <span>数据结构</span>
        <strong>GeoJSON FeatureCollection</strong>
        <p>可作为后续切片、缓存和回放的统一中间产物。</p>
      </div>
    </div>
  `;
  vectorOutput.textContent = JSON.stringify(collection, null, 2);
}

function buildVectorCollection() {
  const scenario = latestObservedScenario ?? buildScenarioSnapshot();
  const result = reportMatchesScenario(scenario) ? latestReport?.agentResult : null;
  const rois = latestInferenceRun?.rois || result?.state?.processedRois || scenario.rois;
  const selectedIds = latestInferenceRun?.rois
    ? latestInferenceRun.rois.map((roi) => roi.id)
    : result?.state?.processedRois?.map((roi) => roi.id) || [];
  const modelId = latestInferenceRun?.plan?.modelId || "scene-roi";

  latestVectorCollection = roisToFeatureCollection({
    sceneBbox: scenario.imageryProfile.bbox,
    rois,
    sceneId: scenario.id,
    dateValue: scenario.observation.dateValue,
    modelId,
    selectedIds,
  });
  latestJsonTileBundle = null;
  latestVectorTilePreview = null;
  renderVectorSummary(latestVectorCollection);
  renderJsonTilePanel();
  renderVectorTilePanel();
}

function renderArtifactIndexPanel(index = readArtifactIndex()) {
  const summary = summarizeArtifactIndex(index);
  cacheSummary.innerHTML = `
    <div class="cache-summary-grid">
      <div class="brief-card">
        <span>缓存条目</span>
        <strong>${summary.total}</strong>
        <p>本地仅保存最近 24 条产物索引，用于快速回放和对比。</p>
      </div>
      <div class="brief-card">
        <span>模型分布</span>
        <strong>${Object.keys(summary.models).length || 0} 类</strong>
        <p>${Object.entries(summary.models)
          .map(([key, value]) => `${key}:${value}`)
          .join(" · ") || "当前还没有登记任何模型产物。"}</p>
      </div>
      <div class="brief-card">
        <span>最新产物</span>
        <strong>${summary.latest?.sceneId || "暂无"}</strong>
        <p>${summary.latest ? `${summary.latest.dateValue} · ${summary.latest.modelId} · ${summary.latest.featureCount} 个要素` : "点击“登记当前产物”后，这里会显示最新快照。"}</p>
      </div>
    </div>
  `;

  cacheBoard.innerHTML = index.length
    ? index
        .map(
          (entry) => `
            <article class="cache-item-card">
              <span>${entry.sceneId}</span>
              <strong>${entry.modelId}</strong>
              <p>${entry.dateValue} · ${entry.outputProduct} · 版本 ${entry.versionTag}</p>
              <p>要素 ${entry.featureCount} 个 · 重点 ${entry.selectedCount} 个 · 面积 ${entry.totalAreaKm2} km²</p>
            </article>
          `
        )
        .join("")
    : '<div class="empty-state">当前还没有登记缓存索引，等矢量结果生成后可以把它注册进来。</div>';
}

function registerCurrentArtifact() {
  if (!latestVectorCollection) {
    buildVectorCollection();
  }
  const scenario = latestObservedScenario ?? buildScenarioSnapshot();
  const featureSummary = summarizeFeatureCollection(latestVectorCollection);
  const modelId = latestInferenceRun?.plan?.modelId || "scene-roi";
  const versionTag = modelRegistry.find((model) => model.id === modelId)?.version || "local-dev";
  const entry = createArtifactEntry({
    sceneId: scenario.id,
    dateValue: scenario.observation.dateValue,
    modelId,
    featureSummary,
    outputProduct: latestInferenceRun?.outputProduct || "quantitative-retrieval",
    versionTag,
  });
  const nextIndex = upsertArtifactIndex(readArtifactIndex(), entry);
  writeArtifactIndex(nextIndex);
  renderArtifactIndexPanel(nextIndex);
}

function resetArtifactIndexPanel() {
  writeArtifactIndex([]);
  renderArtifactIndexPanel([]);
}

function currentPreferredSpatialContext() {
  try {
    return currentSpatialTemporalContext("roi", 1);
  } catch {
    return currentSpatialTemporalContext("scenario", 1);
  }
}

function renderAdvancedPreprocessPanel() {
  const scenario = latestObservedScenario ?? buildScenarioSnapshot();
  const providerLabel = latestStacResult?.providerLabel || selectedStacProvider()?.label || "等待 STAC 检索";
  const candidateCollections = latestStacResult?.request?.collections?.join(" · ") || "尚未建立高分数据上下文";

  advancedPreprocessSummary.innerHTML = `
    <div class="cache-summary-grid">
      <div class="brief-card">
        <span>高分数据上下文</span>
        <strong>${providerLabel}</strong>
        <p>${candidateCollections}</p>
      </div>
      <div class="brief-card">
        <span>当前场景质量</span>
        <strong>${scenario.title}</strong>
        <p>云量 ${formatPercent(scenario.cloudCover)} · 辐射质量 ${formatPercent(
          scenario.radiometricQuality
        )}</p>
      </div>
      <div class="brief-card">
        <span>对齐准备度</span>
        <strong>${latestAlignmentPlan ? `${latestAlignmentPlan.stackDepth} 路输入` : "等待生成"}</strong>
        <p>${latestAlignmentPlan ? `目标 ${latestAlignmentPlan.targetResolutionMeters}m · 网格 ${latestAlignmentPlan.gridShape.join(" × ")}` : "先跑 s2cloudless / Fmask 或对齐方案。"}</p>
      </div>
    </div>
  `;

  const cards = [];

  if (latestS2cloudlessEstimate) {
    cards.push(`
      <article class="advanced-preprocess-card">
        <span>s2cloudless</span>
        <strong>${latestS2cloudlessEstimate.label}</strong>
        <p>候选 ${latestS2cloudlessEstimate.itemCount} 景 · 云概率 ${
          latestS2cloudlessEstimate.meanCloudProbability === null
            ? "暂无"
            : formatPercent(latestS2cloudlessEstimate.meanCloudProbability)
        } · 覆盖 ${
          latestS2cloudlessEstimate.maskCoverage === null
            ? "暂无"
            : formatPercent(latestS2cloudlessEstimate.maskCoverage)
        }</p>
        <p>${latestS2cloudlessEstimate.recommendedAction}</p>
      </article>
    `);
  }

  if (latestFmaskEstimate) {
    cards.push(`
      <article class="advanced-preprocess-card">
        <span>Fmask</span>
        <strong>${latestFmaskEstimate.label}</strong>
        <p>候选 ${latestFmaskEstimate.itemCount} 景 · 云影覆盖 ${
          latestFmaskEstimate.cloudShadowCoverage === null
            ? "暂无"
            : formatPercent(latestFmaskEstimate.cloudShadowCoverage)
        }</p>
        <p>${latestFmaskEstimate.recommendedAction}</p>
      </article>
    `);
  }

  if (latestAlignmentPlan) {
    cards.push(`
      <article class="advanced-preprocess-card">
        <span>重采样与对齐</span>
        <strong>${latestAlignmentPlan.targetResolutionMeters}m ${latestAlignmentPlan.method}</strong>
        <p>输入 ${latestAlignmentPlan.stackDepth} 路 · 预期像元 ${latestAlignmentPlan.expectedPixels}</p>
        <p>${latestAlignmentPlan.steps.join(" · ")}</p>
      </article>
    `);
  }

  advancedPreprocessBoard.innerHTML = cards.length
    ? cards.join("")
    : '<div class="empty-state">这里会显示 s2cloudless、Fmask 和重采样对齐的结果摘要。</div>';
}

function runS2cloudlessEstimate() {
  const scenario = latestObservedScenario ?? buildScenarioSnapshot();
  latestS2cloudlessEstimate = buildS2CloudlessEstimate({
    scenario,
    stacResult: latestStacResult,
    threshold: Number(cloudMaskThresholdInput.value) || 0.45,
  });
  renderAdvancedPreprocessPanel();
}

function runFmaskEstimate() {
  const scenario = latestObservedScenario ?? buildScenarioSnapshot();
  latestFmaskEstimate = buildFmaskEstimate({
    scenario,
    stacResult: latestStacResult,
    threshold: 0.35,
  });
  renderAdvancedPreprocessPanel();
}

function runAlignmentPlan() {
  const scenario = latestObservedScenario ?? buildScenarioSnapshot();
  const context = currentPreferredSpatialContext();
  const collections = latestStacResult?.request?.collections || [];
  const targetResolutionMeters = collections.some((collection) => collection.includes("sentinel-2"))
    ? 60
    : 500;
  latestAlignmentPlan = buildAlignmentPlan({
    scenario,
    bbox: context.bbox,
    stacResult: latestStacResult,
    laadsResult: latestLaadsResult,
    targetResolutionMeters,
    method: targetResolutionMeters <= 60 ? "cubic" : "bilinear",
  });
  renderAdvancedPreprocessPanel();
}

function renderJsonTilePanel(bundle = latestJsonTileBundle) {
  if (!bundle) {
    jsonTileSummary.innerHTML = `
      <div class="brief-card">
        <span>切片状态</span>
        <strong>等待 GeoJSON 结果</strong>
        <p>先生成矢量结果，再按缩放级别切成 JSON tiles。</p>
      </div>
    `;
    jsonTileBoard.innerHTML = '<div class="empty-state">这里会列出每个 tile 的要素数量和大小估计。</div>';
    return;
  }

  const summary = summarizeJsonTileBundle(bundle);
  jsonTileSummary.innerHTML = `
    <div class="cache-summary-grid">
      <div class="brief-card">
        <span>缩放级别</span>
        <strong>z${summary.zoom}</strong>
        <p>${summary.tileCount} 个 tile · ${summary.totalFeatures} 个切片要素</p>
      </div>
      <div class="brief-card">
        <span>体积估计</span>
        <strong>${summary.totalKb} KB</strong>
        <p>最大单 tile ${summary.maxTileKb} KB</p>
      </div>
    </div>
  `;

  jsonTileBoard.innerHTML = bundle.tiles.length
    ? bundle.tiles
        .map(
          (tile) => `
            <article class="json-tile-card">
              <span>${tile.key}</span>
              <strong>${tile.featureCount} 个要素</strong>
              <p>bbox ${tile.bbox.map((value) => value.toFixed(2)).join(", ")}</p>
              <p>估计 ${Math.round(tile.estimatedBytes / 1024)} KB</p>
            </article>
          `
        )
        .join("")
    : '<div class="empty-state">当前切片结果为空，请缩小 ROI 或重新生成矢量结果。</div>';
}

function buildJsonTiles() {
  if (!latestVectorCollection) {
    buildVectorCollection();
  }
  latestJsonTileBundle = sliceFeatureCollectionToJsonTiles(latestVectorCollection, {
    zoom: Number(jsonTileZoomSelect.value) || 6,
  });
  renderJsonTilePanel(latestJsonTileBundle);
}

function renderVectorTilePanel(preview = latestVectorTilePreview) {
  if (!preview) {
    vectorTileSummary.innerHTML = `
      <div class="brief-card">
        <span>交付状态</span>
        <strong>等待 JSON tiles</strong>
        <p>先切出 JSON tiles，再生成 TileJSON / MVT 交付预览。</p>
      </div>
    `;
    vectorTileBoard.innerHTML = '<div class="empty-state">这里会展示矢量瓦片路径模板和每个 tile 的交付估计。</div>';
    return;
  }

  const summary = summarizeVectorTilePreview(preview);
  vectorTileSummary.innerHTML = `
    <div class="cache-summary-grid">
      <div class="brief-card">
        <span>图层</span>
        <strong>${summary.layerId}</strong>
        <p>${summary.tileCount} 个 tile</p>
      </div>
      <div class="brief-card">
        <span>体积估计</span>
        <strong>${summary.averageTileKb} KB</strong>
        <p>最大单 tile ${summary.maxTileKb} KB</p>
      </div>
    </div>
  `;

  vectorTileBoard.innerHTML = preview.entries.length
    ? preview.entries
        .map(
          (entry) => `
            <article class="vector-tile-card">
              <span>${entry.key}</span>
              <strong>${entry.path}</strong>
              <p>${entry.featureCount} 个要素 · 估计 ${Math.round(entry.estimatedBytes / 1024)} KB</p>
            </article>
          `
        )
        .join("")
    : '<div class="empty-state">当前还没有可交付的 tile 清单。</div>';
}

function buildVectorTilePreviewPanel() {
  if (!latestJsonTileBundle) {
    buildJsonTiles();
  }
  latestVectorTilePreview = buildVectorTilePreview(latestJsonTileBundle);
  renderVectorTilePanel(latestVectorTilePreview);
}

function renderQueuePanel(queue = readPrecomputeQueue()) {
  const summary = summarizePrecomputeQueue(queue);
  queueSummary.innerHTML = `
    <div class="cache-summary-grid">
      <div class="brief-card">
        <span>任务总数</span>
        <strong>${summary.total}</strong>
        <p>queued ${summary.byStatus.queued} · running ${summary.byStatus.running} · done ${summary.byStatus.done}</p>
      </div>
      <div class="brief-card">
        <span>最近任务</span>
        <strong>${summary.latest?.spec?.sceneId || "暂无"}</strong>
        <p>${summary.latest ? `${summary.latest.spec.dateValue} · ${summary.latest.spec.artifactType}` : "把当前场景产物加入队列后，这里会显示最新任务。"}</p>
      </div>
    </div>
  `;

  queueBoard.innerHTML = queue.length
    ? queue
        .map(
          (job) => `
            <article class="queue-item-card ${job.status}">
              <span>${job.spec.artifactType}</span>
              <strong>${job.spec.sceneId}</strong>
              <p>${job.spec.dateValue} · z${job.spec.zoom} · ${job.spec.modelId}</p>
              <p>状态 ${job.status} · 尝试 ${job.attempts}${job.result ? ` · 结果 ${JSON.stringify(job.result)}` : ""}${job.error ? ` · 错误 ${job.error}` : ""}</p>
            </article>
          `
        )
        .join("")
    : '<div class="empty-state">当前还没有排队任务，适合在生成 tiles 或交付清单后再加入。</div>';
}

function schedulePrecomputeProcessing() {
  if (queueTickTimer) {
    return;
  }

  const queue = readPrecomputeQueue();
  if (queue.some((job) => job.status === "running")) {
    return;
  }

  const started = startNextPrecomputeJob(queue);
  if (!started.job) {
    return;
  }

  writePrecomputeQueue(started.queue);
  renderQueuePanel(started.queue);

  queueTickTimer = window.setTimeout(() => {
    const currentQueue = readPrecomputeQueue();
    try {
      const result = {
        tileCount: latestJsonTileBundle?.tileCount || 0,
        vectorTileCount: latestVectorTilePreview?.tileCount || 0,
      };
      const completedQueue = completePrecomputeJob(currentQueue, started.job.id, result);
      writePrecomputeQueue(completedQueue);
      renderQueuePanel(completedQueue);
    } catch (error) {
      const failedQueue = failPrecomputeJob(currentQueue, started.job.id, error.message);
      writePrecomputeQueue(failedQueue);
      renderQueuePanel(failedQueue);
    } finally {
      queueTickTimer = null;
      if (readPrecomputeQueue().some((job) => job.status === "queued")) {
        schedulePrecomputeProcessing();
      }
    }
  }, 900);
}

function enqueueCurrentPrecomputeJob() {
  if (!latestJsonTileBundle) {
    buildJsonTiles();
  }
  const scenario = latestObservedScenario ?? buildScenarioSnapshot();
  const queue = readPrecomputeQueue();
  const { queue: nextQueue } = enqueuePrecomputeJob(queue, {
    artifactType: latestVectorTilePreview ? "vector-tiles" : "json-tiles",
    sceneId: scenario.id,
    dateValue: scenario.observation.dateValue,
    zoom: latestJsonTileBundle?.zoom || Number(jsonTileZoomSelect.value) || 6,
    modelId: latestInferenceRun?.plan?.modelId || "scene-roi",
  });
  writePrecomputeQueue(nextQueue);
  renderQueuePanel(nextQueue);
  schedulePrecomputeProcessing();
}

function retryFailedPrecomputeJobs() {
  const queue = readPrecomputeQueue();
  const failed = queue.find((job) => job.status === "failed");
  if (!failed) {
    renderQueuePanel(queue);
    return;
  }
  const retried = retryPrecomputeJob(queue, failed.id);
  writePrecomputeQueue(retried);
  renderQueuePanel(retried);
  schedulePrecomputeProcessing();
}

function renderOfflineEvalPanel(report = latestEvalReport) {
  if (!report) {
    evalSummary.innerHTML = `
      <div class="brief-card">
        <span>评测状态</span>
        <strong>等待运行离线评测</strong>
        <p>这里会汇总预处理、推理、切片和交付链路的可重复评测结果。</p>
      </div>
    `;
    evalOutput.textContent = "";
    return;
  }

  evalSummary.innerHTML = `
    <div class="cache-summary-grid">
      <div class="brief-card">
        <span>总体结论</span>
        <strong>${report.verdict}</strong>
        <p>综合得分 ${report.overall}</p>
      </div>
      <div class="brief-card">
        <span>关键分项</span>
        <strong>推理 ${report.scores.inference}</strong>
        <p>预处理 ${report.scores.preprocess} · 交付 ${report.scores.delivery} · 资源 ${report.scores.resource}</p>
      </div>
      <div class="brief-card">
        <span>案例基准</span>
        <strong>${report.benchmarkCoverage?.ready || 0}/${report.benchmarkCoverage?.total || 0}</strong>
        <p>目录 ${report.benchmarkCatalog?.total || 0} 条 · 当前任务 ${report.benchmarkCoverage?.taskId || "unknown"}</p>
      </div>
      <div class="brief-card">
        <span>案例精度</span>
        <strong>${
          report.caseAccuracy?.available
            ? `F1 ${(report.caseAccuracy.metrics?.f1 * 100).toFixed(0)}%`
            : report.caseAccuracy?.available === false
              ? "局部视图未对齐"
              : "暂无匹配案例"
        }</strong>
        <p>${
          report.caseAccuracy?.available
            ? `IoU ${(report.caseAccuracy.metrics?.meanIoU * 100).toFixed(0)}% · ${report.caseAccuracy.label}`
            : `reviewed cases ${report.reviewedCaseCatalog?.total || 0} 条`
        }</p>
      </div>
    </div>
  `;
  evalOutput.textContent = JSON.stringify(report, null, 2);
}

function runOfflineEvalPanel() {
  const scenario = latestObservedScenario ?? buildScenarioSnapshot();
  if (!latestVectorCollection) {
    buildVectorCollection();
  }
  latestEvalReport = evaluateOfflineRun({
    scenario,
    preprocessGate: latestPreprocessGate,
    inferenceRun: latestInferenceRun,
    vectorCollection: latestVectorCollection,
    jsonTileBundle: latestJsonTileBundle,
    queueSummary: summarizePrecomputeQueue(readPrecomputeQueue()),
    report: latestReport,
  });
  renderOfflineEvalPanel(latestEvalReport);
}

function currentSceneKey() {
  const observation = currentObservation();
  const snapshot = buildScenarioSnapshot(observation);
  return `${snapshot.id}:${snapshot.focusSelection?.cacheKey || "preset"}:${toInputDateValue(
    observation
  )}:${String(observation.getHours()).padStart(2, "0")}`;
}

function currentOptions() {
  return {
    budgetMin: Number(budgetInput.value),
    powerMode: powerModeSelect.value,
    downlinkPolicy: downlinkSelect.value,
  };
}

function reportMatchesScenario(scenario) {
  return (
    latestReport &&
    latestReport.scenario.id === scenario.id &&
    latestReport.scenario.observation.iso === scenario.observation.iso &&
    (latestReport.scenario.focusSelection?.cacheKey || "preset") === (scenario.focusSelection?.cacheKey || "preset") &&
    latestReport.taskId === currentTask().id
  );
}

function renderTimelineStatus(snapshot = null) {
  const observation = currentObservation();
  timelineLabel.textContent = formatObservationLabel(observation);
  timelineCurrentLabel.textContent = formatShortDate(observation);
  dateInput.value = toInputDateValue(observation);
  hourValue.textContent = `${String(observation.getHours()).padStart(2, "0")}:00`;

  if (snapshot) {
    timelineBadge.textContent = `云量 ${formatPercent(snapshot.cloudCover)} · 质量 ${formatPercent(
      snapshot.radiometricQuality
    )}`;
    return;
  }

  timelineBadge.textContent = "正在加载真实遥感影像与异常提取结果";
}

function seedControls() {
  const scenario = scenarios[1] ?? scenarios[0];
  const preset = getOptionPreset(scenario);
  const timeline = getTimelineBounds();
  const observation = getDefaultObservation();

  scenarioSelect.value = scenario.id;
  budgetInput.value = String(preset.budgetMin);
  powerModeSelect.value = preset.powerMode;
  downlinkSelect.value = preset.downlinkPolicy;
  budgetValue.textContent = `${preset.budgetMin} 分钟`;

  dateSlider.max = String(timeline.totalDays - 1);
  dateSlider.value = String(observation.dayIndex);
  hourSlider.value = String(observation.hour);
  dateInput.min = toInputDateValue(timeline.start);
  dateInput.max = toInputDateValue(timeline.end);
  timelineStartLabel.textContent = formatShortDate(timeline.start);
  timelineEndLabel.textContent = formatShortDate(timeline.end);

  renderTimelineStatus();
}

function renderMissionBrief(scenario, options) {
  const focusCard = scenario.focusSelection
    ? `
      <div class="brief-card">
        <span>全球选区</span>
        <strong>${scenario.focusSelection.label}</strong>
        <p>${scenario.focusSelection.scaleLabel} · 跨度 ${scenario.focusSelection.lonSpan}° × ${scenario.focusSelection.latSpan}° · ${scenario.focusSelection.strategyText}</p>
      </div>
    `
    : "";

  missionBrief.innerHTML = `
    <div class="mission-grid">
      <div class="brief-card">
        <span>任务目标</span>
        <strong>${scenario.title}</strong>
        <p>${scenario.mission}</p>
      </div>
      <div class="brief-card">
        <span>观测时刻</span>
        <strong>${scenario.observation.label}</strong>
        <p>${scenario.observation.summary}</p>
      </div>
      <div class="brief-card">
        <span>底图与工具</span>
        <strong>${scenario.imagery.sourceLabel}</strong>
        <p>${scenario.analysis.sourceLabel}</p>
      </div>
      <div class="brief-card">
        <span>场景压力</span>
        <strong>云量 ${formatPercent(scenario.cloudCover)} · 质量 ${formatPercent(
          scenario.radiometricQuality
        )}</strong>
        <p>${scenario.description}</p>
      </div>
      <div class="brief-card">
        <span>当前约束</span>
        <strong>${options.budgetMin} 分钟时延预算</strong>
        <p>${scenario.bandwidthBudgetMb} MB 下传预算 · ${powerModeLabel(
          options.powerMode
        )}功耗模式 · ${downlinkLabel(options.downlinkPolicy)}</p>
      </div>
      <div class="brief-card">
        <span>候选区域</span>
        <strong>${scenario.rois.length} 个候选区域</strong>
        <p>${scenario.sensor} · ${typeLabel(scenario.type)} · 异常密度 ${formatPercent(
          scenario.anomalyDensity
        )}</p>
      </div>
      ${focusCard}
    </div>
  `;
}

function renderMissionBriefLoading(snapshot, options) {
  const focusCard = snapshot.focusSelection
    ? `
      <div class="brief-card">
        <span>全球选区</span>
        <strong>${snapshot.focusSelection.label}</strong>
        <p>${snapshot.focusSelection.scaleLabel} · ${snapshot.focusSelection.strategyText}</p>
      </div>
    `
    : "";

  missionBrief.innerHTML = `
    <div class="mission-grid">
      <div class="brief-card">
        <span>任务目标</span>
        <strong>${snapshot.title}</strong>
        <p>${snapshot.mission}</p>
      </div>
      <div class="brief-card">
        <span>观测时刻</span>
        <strong>${snapshot.observation.label}</strong>
        <p>正在调用官方遥感图层，请稍候。</p>
      </div>
      <div class="brief-card">
        <span>当前约束</span>
        <strong>${options.budgetMin} 分钟时延预算</strong>
        <p>${powerModeLabel(options.powerMode)}功耗模式 · ${downlinkLabel(
          options.downlinkPolicy
        )}</p>
      </div>
      ${focusCard}
    </div>
  `;
}

function renderWorkflowPlan(plan, result = null) {
  const statuses = new Map();
  const stepSequence = result?.workflowSteps ?? plan.steps;

  if (result) {
    result.logs.forEach((log) => {
      if (log.type === "step" || log.type === "repair") {
        statuses.set(log.stepId, log.status);
      }
    });
  }

  workflowPlan.innerHTML = stepSequence
    .map((stepId, index) => {
      const status = statuses.get(stepId) || "planned";
      const badgeClass =
        status === "ok"
          ? "ok"
          : status === "failed"
          ? "fail"
          : status === "repair"
          ? "repair"
          : "warn";

      return `
        <div class="workflow-step">
          <small>步骤 ${index + 1}</small>
          <strong>${toolCatalog[stepId].label}</strong>
          <div class="status-line">
            <span class="badge ${badgeClass}">${statusLabel(status)}</span>
          </div>
          <small>${toolCatalog[stepId].summary}</small>
        </div>
      `;
    })
    .join("");
}

async function renderLogs(logs) {
  executionLog.innerHTML = "";

  for (const log of logs) {
    const badgeClass =
      log.status === "ok"
        ? "ok"
        : log.status === "failed"
        ? "fail"
        : log.status === "repair"
        ? "repair"
        : "warn";

    const div = document.createElement("div");
    div.className = "log-entry";
    div.innerHTML = `
      <div class="status-line">
        <span class="badge ${badgeClass}">${statusLabel(log.status)}</span>
        <strong>${log.label}</strong>
      </div>
      <div>${log.message}</div>
      <div class="log-meta">
        <span>累计时延：${log.latency} 分钟</span>
        <span>累计功耗：${log.power}</span>
      </div>
    `;
    executionLog.appendChild(div);
    executionLog.scrollTop = executionLog.scrollHeight;
    await new Promise((resolve) => window.setTimeout(resolve, 180));
  }
}

function renderSceneLoading(snapshot) {
  const focusText = snapshot.focusSelection ? `当前目标区域：${snapshot.focusSelection.label}。` : "";
  const existingFrame = sceneMap.querySelector(".scene-frame");
  const existingOverlay = sceneMap.querySelector(".scene-loading-overlay");

  if (existingFrame && existingOverlay) {
    existingFrame.dataset.loading = "true";
    existingOverlay.hidden = false;
    existingOverlay.innerHTML = `
      <span>SCENE LOADING</span>
      <strong>正在刷新当前区域底图</strong>
      <p>${snapshot.observation.label}</p>
      <p>${focusText}智能体会在保留旧图可视上下文的同时，按需更新新的区域底图和异常结果。</p>
    `;
    return;
  }

  sceneMap.innerHTML = `
    <div class="scene-loading-card">
      <strong>正在加载真实遥感影像</strong>
      <p>${snapshot.observation.label}</p>
      <p>${focusText}正在从官方图层获取底图，并基于 AOD 产品提取异常区域。</p>
    </div>
  `;
}

function ensureSceneMapShell(scenario) {
  let frame = sceneMap.querySelector(".scene-frame");
  let image = sceneMap.querySelector(".scene-image");
  let roiLayer = sceneMap.querySelector(".roi-layer");
  let loadingOverlay = sceneMap.querySelector(".scene-loading-overlay");
  let locator = sceneMap.querySelector(".scene-locator");
  let metaGrid = sceneMap.querySelector(".scene-meta-grid");
  let aux = sceneMap.querySelector(".scene-aux");
  let credit = sceneMap.querySelector(".scene-credit");

  if (!frame || !image || !roiLayer || !loadingOverlay || !locator || !metaGrid || !aux || !credit) {
    sceneMap.innerHTML = `
      <div class="scene-frame">
        <img class="scene-image" alt="" />
        <div class="roi-layer"></div>
        <div class="scene-loading-overlay" hidden></div>
        <div class="scene-locator" hidden></div>
      </div>
      <div class="scene-meta-grid"></div>
      <div class="scene-aux"></div>
      <div class="scene-credit"></div>
    `;
    frame = sceneMap.querySelector(".scene-frame");
    image = sceneMap.querySelector(".scene-image");
    roiLayer = sceneMap.querySelector(".roi-layer");
    loadingOverlay = sceneMap.querySelector(".scene-loading-overlay");
    locator = sceneMap.querySelector(".scene-locator");
    metaGrid = sceneMap.querySelector(".scene-meta-grid");
    aux = sceneMap.querySelector(".scene-aux");
    credit = sceneMap.querySelector(".scene-credit");
  }

  frame.style.setProperty("--scene-ratio", scenario.imagery.aspectRatio);
  frame.dataset.loading = "false";
  image.decoding = "async";

  return { frame, image, roiLayer, loadingOverlay, locator, metaGrid, aux, credit };
}

function resolveSceneImageryView(scenario) {
  const decloudAvailable = Boolean(scenario?.imagery?.decloudPreviewAvailable && scenario?.imagery?.decloudPreviewSrc);
  if (!decloudAvailable && decloudPreviewToggle.checked) {
    decloudPreviewToggle.checked = false;
  }
  decloudPreviewToggle.disabled = !decloudAvailable;

  if (decloudAvailable && decloudPreviewToggle.checked) {
    return {
      mode: "declouded",
      src: scenario.imagery.decloudPreviewSrc,
      label: "去云后预览",
      detail:
        scenario.imagery.decloudPreviewNote ||
        "当前显示的是去云后的视觉预览，可直接检查异常检测前的云抑制效果。",
      available: true,
    };
  }

  return {
    mode: "raw",
    src: scenario.imagery.src,
    label: "遥感原图",
    detail: decloudAvailable
      ? "当前显示的是原始遥感底图。勾选“显示去云后效果”可检查异常检测前实际使用的云抑制结果。"
      : "当前显示的是原始遥感底图。",
    available: decloudAvailable,
  };
}

function renderSceneLocator(shell, scenario) {
  const locator = buildSceneLocatorSnapshot(scenario, globalOverview);
  if (!locator?.overviewSrc) {
    shell.locator.hidden = true;
    shell.locator.innerHTML = "";
    return;
  }

  shell.locator.hidden = false;
  shell.locator.innerHTML = `
    <div class="scene-locator-frame">
      <img class="scene-locator-image" src="${locator.overviewSrc}" alt="全球位置索引" />
      <div class="scene-locator-layer">
        <div
          class="scene-locator-box"
          style="
            left:${locator.rect.left}%;
            top:${locator.rect.top}%;
            width:${locator.rect.width}%;
            height:${locator.rect.height}%;
          "
        ></div>
      </div>
    </div>
    <div class="scene-locator-meta">
      <span>${locator.overviewSourceLabel}</span>
      <strong>${locator.label}</strong>
      <p>${locator.scaleLabel} · ${locator.centerLabel} · ${locator.spanLabel}</p>
    </div>
  `;
}

function buildValidRegionInspectionModel(validRegion = null, { columns = 28, rows = 18 } = {}) {
  const width = Math.max(0, Number(validRegion?.width) || 0);
  const height = Math.max(0, Number(validRegion?.height) || 0);
  const validMask = validRegion?.validMask;

  if (!width || !height || !(validMask instanceof Uint8Array) || !validMask.length) {
    return {
      html: "",
      tileCount: 0,
      validRatio: null,
      blockedRatio: null,
    };
  }

  const safeColumns = clamp(Math.round(columns) || 28, 10, 40);
  const safeRows = clamp(Math.round(rows) || 18, 8, 28);
  const totalPixels = validMask.length;
  let validPixels = 0;

  for (const pixel of validMask) {
    if (pixel === 1) {
      validPixels += 1;
    }
  }

  const validRatio = totalPixels ? validPixels / totalPixels : null;
  const blockedRatio = validRatio == null ? null : 1 - validRatio;
  const tiles = [];
  const percent = (value) => Math.round(value * 1000) / 10;

  for (let row = 0; row < safeRows; row += 1) {
    const y0 = Math.floor((row / safeRows) * height);
    const y1 = Math.max(y0 + 1, Math.floor(((row + 1) / safeRows) * height));
    for (let col = 0; col < safeColumns; col += 1) {
      const x0 = Math.floor((col / safeColumns) * width);
      const x1 = Math.max(x0 + 1, Math.floor(((col + 1) / safeColumns) * width));
      let cellPixels = 0;
      let cellValidPixels = 0;

      for (let y = y0; y < Math.min(y1, height); y += 1) {
        for (let x = x0; x < Math.min(x1, width); x += 1) {
          cellPixels += 1;
          if (validMask[y * width + x] === 1) {
            cellValidPixels += 1;
          }
        }
      }

      const blockedShare = cellPixels ? 1 - cellValidPixels / cellPixels : 0;
      if (blockedShare < 0.08) {
        continue;
      }

      const tileClass =
        blockedShare > 0.72
          ? "valid-region-tile is-blocked"
          : blockedShare > 0.34
            ? "valid-region-tile is-edge"
            : "valid-region-tile is-fringe";
      const alpha = (0.16 + clamp(blockedShare, 0.08, 1) * 0.34).toFixed(2);
      tiles.push(`
        <span
          class="${tileClass}"
          style="left:${percent(col / safeColumns)}%;top:${percent(row / safeRows)}%;width:${percent(1 / safeColumns)}%;height:${percent(1 / safeRows)}%;--mask-alpha:${alpha};"
        ></span>
      `);
    }
  }

  return {
    html: tiles.join(""),
    tileCount: tiles.length,
    validRatio,
    blockedRatio,
  };
}

function renderSceneMap(scenario, result = null) {
  const showAnnotations = overlayToggle.checked;
  const imageryView = resolveSceneImageryView(scenario);
  const decloudInspectionMode = imageryView.mode === "declouded";
  const validRegion = getAnalysisValidRegion(scenario.analysis);
  const hasAnalysisOverlayPoints = Array.isArray(scenario.analysis?.overlayPoints);
  const rawOverlayPoints = hasAnalysisOverlayPoints
    ? scenario.analysis.overlayPoints
    : buildOverlayPointsFromRois(scenario.rois, {
        validRegion,
        minPointsPerRoi: 3,
      });
  const overlayClip = clipOverlayPointsToValidRegion(rawOverlayPoints, validRegion, {
    minPointsPerRoi: 1,
  });
  const visibleRoiIds = new Set(overlayClip.visibleRoiIds);
  const markerScenario = overlayClip.clipApplied
    ? {
        ...scenario,
        rois: (scenario.rois || []).filter((roi, index) =>
          visibleRoiIds.has(roi?.id || `R${index + 1}`)
        ),
      }
    : scenario;
  const markerModel = buildAnomalyMarkerModel({
    scenario: markerScenario,
    result,
    overlayPoints: overlayClip.points,
  });
  const validRegionInspection = decloudInspectionMode
    ? buildValidRegionInspectionModel(validRegion)
    : { html: "", tileCount: 0, validRatio: null, blockedRatio: null };
  latestSceneOverlayDiagnostics = {
    clipApplied: overlayClip.clipApplied,
    validRegionAvailable: Boolean(validRegion),
    sourcePointCount: overlayClip.sourcePointCount,
    visiblePointCount: overlayClip.retainedPoints,
    hiddenPointCount: overlayClip.hiddenPoints,
    visibleRoiCount: overlayClip.visibleRoiIds.length,
    hiddenRoiCount: overlayClip.droppedRoiIds.length,
    visiblePointsAllValid: overlayClip.visiblePointsAllValid,
    semanticMarkersSuppressed: decloudInspectionMode,
    validRegionInspectionTiles: validRegionInspection.tileCount,
    validRegionBlockedRatio: validRegionInspection.blockedRatio,
  };

  const semanticMarkerOverlays = decloudInspectionMode
    ? ""
    : markerModel.markers
        .map(
          (marker) => `
            <span
              class="anomaly-anchor status-${marker.status}"
              style="left:${marker.anchorX}%;top:${marker.anchorY}%;--anchor-size:${marker.anchorSizeRem}rem;"
            ></span>
            <div
              class="anomaly-label status-${marker.status}"
              style="left:${marker.labelX}%;top:${marker.labelY}%;--connector-height:${marker.connectorRem}rem;"
            >
              <strong>${marker.title}</strong>
              <span>${marker.detail}</span>
            </div>
          `
        )
        .join("");

  const overlays = showAnnotations
    ? `${decloudInspectionMode ? validRegionInspection.html : ""}
      ${markerModel.points
        .map((point) => {
          const classes = ["anomaly-point", `band-${point.band}`];
          return `
            <span
              class="${classes.join(" ")}"
              style="left:${point.x}%;top:${point.y}%;--point-size:${point.sizeRem}rem;--point-alpha:${point.alpha.toFixed(2)};"
            ></span>
          `;
        })
        .join("")}
      ${semanticMarkerOverlays}`
    : "";

  const focusCard = scenario.focusSelection
    ? `
      <div class="scene-meta-card">
        <span>全球选区</span>
        <strong>${scenario.focusSelection.label}</strong>
        <p>${scenario.focusSelection.scaleLabel} · ${scenario.focusSelection.strategyText}</p>
      </div>
    `
    : "";
  const loadCard = latestSceneLoadSummary
    ? `
      <div class="scene-meta-card">
        <span>加载策略</span>
        <strong>${latestSceneLoadSummary.title}</strong>
        <p>${latestSceneLoadSummary.detail}</p>
      </div>
    `
    : "";
  const sceneMarkerModeDetail = showAnnotations
    ? decloudInspectionMode
      ? `当前处于去云检查视图，已隐藏摘要标签与锚点，只保留通过有效区裁剪的异常像元点。${overlayClip.clipApplied ? ` 本次额外过滤 ${overlayClip.hiddenPoints} 个无效点，并移除了 ${overlayClip.droppedRoiIds.length} 个无效异常簇。` : ""}`
      : `${markerModel.summary.detail}${
          overlayClip.clipApplied
            ? overlayClip.hiddenPoints || overlayClip.droppedRoiIds.length
              ? ` 标记已按去云后有效区裁剪，过滤 ${overlayClip.hiddenPoints} 个无效异常像元点，隐藏 ${overlayClip.droppedRoiIds.length} 个无效异常簇。`
              : " 标记已按去云后有效区裁剪。"
            : ""
        }`
    : "当前已隐藏异常标记，便于直接对照底图检查云层、纹理与异常位置。";
  const sceneInspectionCard = decloudInspectionMode
    ? `
      <div class="scene-meta-card">
        <span>去云检查</span>
        <strong>${validRegionInspection.validRatio == null ? "已开启像元级检查" : `有效检测区 ${formatPercent(validRegionInspection.validRatio)}`}</strong>
        <p>${
          validRegionInspection.blockedRatio == null
            ? "当前已隐藏摘要标签与锚点，只保留通过有效区裁剪的异常像元点。"
            : `当前已隐藏摘要标签与锚点，只保留通过有效区裁剪的异常像元点。约 ${formatPercent(validRegionInspection.blockedRatio)} 的分析网格因去云被屏蔽。`
        }</p>
      </div>
    `
    : "";
  const sceneLegendItems = decloudInspectionMode
    ? [
        ...markerModel.legend.filter((item) => item.key === "trace" || item.key === "core"),
        ...(validRegionInspection.tileCount
          ? [
              { key: "valid-region-edge", swatchClass: "valid-region-edge", label: "去云边界区" },
              { key: "valid-region-blocked", swatchClass: "valid-region-blocked", label: "去云屏蔽区" },
            ]
          : []),
      ]
    : markerModel.legend;

  const shell = ensureSceneMapShell(scenario);
  shell.loadingOverlay.hidden = true;
  shell.loadingOverlay.innerHTML = "";
  shell.frame.dataset.sceneView = imageryView.mode;
  shell.frame.dataset.decloudAvailable = imageryView.available ? "true" : "false";
  if (shell.image.dataset.sceneSrc !== imageryView.src) {
    shell.image.src = imageryView.src;
    shell.image.dataset.sceneSrc = imageryView.src;
  }
  shell.image.alt = `${scenario.title} ${imageryView.label}`;
  shell.roiLayer.hidden = !showAnnotations;
  shell.roiLayer.innerHTML = showAnnotations ? overlays : "";
  renderSceneLocator(shell, scenario);
  shell.metaGrid.innerHTML = `
    <div class="scene-meta-card">
      <span>当前观测</span>
      <strong>${scenario.observation.label}</strong>
      <p>${scenario.observation.summary}</p>
    </div>
    <div class="scene-meta-card">
      <span>底图来源</span>
      <strong>${scenario.imagery.sourceLabel}</strong>
      <p>${scenario.imagery.note}</p>
    </div>
    <div class="scene-meta-card">
      <span>底图视图</span>
      <strong>${imageryView.label}</strong>
      <p>${imageryView.detail}</p>
    </div>
    <div class="scene-meta-card">
      <span>异常提取</span>
      <strong>${scenario.analysis.sourceLabel}</strong>
      <p>${scenario.analysis.summary}</p>
    </div>
    <div class="scene-meta-card">
      <span>标记模式</span>
      <strong>${showAnnotations ? markerModel.summary.title : "已关闭标记"}</strong>
      <p>${sceneMarkerModeDetail}</p>
    </div>
    ${sceneInspectionCard}
    ${focusCard}
    ${loadCard}
  `;
  shell.aux.innerHTML = showAnnotations
    ? `
      <div class="legend">
        ${sceneLegendItems
          .map(
            (item) => `
              <span class="legend-item">
                <span class="swatch ${item.swatchClass}"></span>
                ${item.label}
              </span>
            `
          )
          .join("")}
      </div>
    `
    : '<div class="scene-compare-note">标记已隐藏，可直接进行目视比对。</div>';
  shell.credit.textContent = scenario.imagery.credit;
}

function renderCompareNotes(notes = []) {
  if (!notes.length) {
    compareExplain.innerHTML =
      '<div class="empty-state">运行完成后，这里会补充资源、可信度来源和结果边界的解读。</div>';
    return;
  }

  compareExplain.innerHTML = notes
    .map(
      (note) => `
        <div class="compare-note">
          <span>${note.title}</span>
          <p>${note.detail}</p>
        </div>
      `
    )
    .join("");
}

function renderMetrics(agentRun, baselineRun, task = currentTask()) {
  const validPixel = latestPreprocessGate ? `${Math.round(latestPreprocessGate.validPixelRatio * 100)}%` : "待评估";
  const interpretation = buildOperationalResultInterpretation({
    task,
    gate: latestPreprocessGate,
    agentRun,
    baselineRun,
  });

  metricsCards.innerHTML = `
    <div class="metric-card">
      <span>输出类型</span>
      <strong>${productLabel(agentRun.result.state.outputProduct)}</strong>
      <p>${agentRun.result.success ? "本次任务完成" : "本次任务失败"}</p>
    </div>
    <div class="metric-card">
      <span>处理区域数</span>
      <strong>${agentRun.result.metrics.processedRois}</strong>
      <p>仅对优先级更高的区域进行处理</p>
    </div>
    <div class="metric-card">
      <span>时延预算占比</span>
      <strong>${agentRun.result.metrics.budgetUsage}%</strong>
      <p>表示本次任务为完成处理实际消耗了多少时延预算，不是单独越低越好。</p>
    </div>
    <div class="metric-card">
      <span>结果置信度</span>
      <strong>${agentRun.result.metrics.confidence}%</strong>
      <p>输出产品在当前条件下的可信水平</p>
    </div>
    <div class="metric-card">
      <span>去云后有效区域</span>
      <strong>${validPixel}</strong>
      <p>当前定量模型默认只在去云后的有效区域上执行，这项指标越高，结果通常越稳。</p>
    </div>
    <div class="metric-card">
      <span>${interpretation.metric.title}</span>
      <strong>${interpretation.metric.strong}</strong>
      <p>${interpretation.metric.detail}</p>
    </div>
  `;

  compareTable.innerHTML = `
    <div class="compare-row">
      <strong>指标</strong>
      <span class="compare-agent">智能体方案</span>
      <span class="compare-baseline">固定流程</span>
    </div>
    <div class="compare-row">
      <strong>是否成功</strong>
      <span class="compare-agent">${agentRun.result.success ? "是" : "否"}</span>
      <span class="compare-baseline">${baselineRun.success ? "是" : "否"}</span>
    </div>
    <div class="compare-row">
      <strong>时延预算占比</strong>
      <span class="compare-agent">${agentRun.result.metrics.budgetUsage}%</span>
      <span class="compare-baseline">${baselineRun.metrics.budgetUsage}%</span>
    </div>
    <div class="compare-row">
      <strong>功耗占比</strong>
      <span class="compare-agent">${agentRun.result.metrics.powerUsage}%</span>
      <span class="compare-baseline">${baselineRun.metrics.powerUsage}%</span>
    </div>
    <div class="compare-row">
      <strong>结果质量</strong>
      <span class="compare-agent">${agentRun.result.metrics.confidence}%</span>
      <span class="compare-baseline">${baselineRun.metrics.confidence}%</span>
    </div>
    <div class="compare-row">
      <strong>去云后有效区域</strong>
      <span class="compare-agent">${validPixel}</span>
      <span class="compare-baseline">固定流程未显式建模</span>
    </div>
    <div class="compare-row">
      <strong>科学收益</strong>
      <span class="compare-agent">${agentRun.result.metrics.scienceYield}</span>
      <span class="compare-baseline">${baselineRun.metrics.scienceYield}</span>
    </div>
  `;

  renderCompareNotes(interpretation.notes);
}

function renderNarrative(narrative) {
  narrativePanel.innerHTML = narrative
    .map(
      (paragraph, index) => `
        <div class="narrative-card">
          <span>说明 ${index + 1}</span>
          <p>${paragraph}</p>
        </div>
      `
    )
    .join("");
}

function renderMemoryLegacy(memory) {
  if (!memory.rules.length) {
    memoryPanel.innerHTML =
      '<div class="empty-state">当前还没有可复用的经验。出现第一次修复后，这里会记录相应的处理规则。</div>';
    return;
  }

  memoryPanel.innerHTML = memory.rules
    .map(
      (rule) => `
        <div class="memory-rule">
          <span>${typeLabel(rule.scope)}</span>
          <strong>${RULE_REASON_LABELS[rule.reason] ?? rule.reason}</strong>
          <div>修复动作：${RULE_ACTION_LABELS[rule.action] ?? rule.action}</div>
          <div>复用次数：${rule.count}</div>
        </div>
      `
    )
    .join("");
}

function currentMemoryEpisodes(scenario = latestObservedScenario ?? buildScenarioSnapshot(), task = currentTask(), limit = 3) {
  return findRelevantEpisodes(readMemory(), {
    taskId: task.id,
    scaleKey: scenario.focusSelection?.scaleKey || "regional",
    scenarioType: scenario.type,
    limit,
  });
}

function buildDecisionMemoryCue(
  scenario = latestObservedScenario ?? buildScenarioSnapshot(),
  task = currentTask(),
  options = currentOptions(),
  plan = null
) {
  const episodes = currentMemoryEpisodes(scenario, task, 3);
  return buildDecisionMemoryCueSummary({
    episodes,
    scenario,
    options,
    plan,
    labels: {
      productLabel,
      downlinkLabel,
    },
  });
}

function renderMemory(memory) {
  const normalized = normalizeMemory(memory);
  const episodes = normalized.episodes.slice(0, 4);
  const rules = normalized.rules;

  if (!episodes.length && !rules.length) {
    memoryPanel.innerHTML =
      '<div class="empty-state">当前还没有可复用的经验。完成一次真实执行后，这里会沉淀智能体案例与修复规则。</div>';
    return;
  }

  const episodeSection = episodes.length
    ? `
      <section class="memory-section">
        <div class="memory-section-head">
          <span>经验案例</span>
          <strong>智能体最近沉淀的可复用任务</strong>
        </div>
        <div class="memory-episode-grid">
          ${episodes
            .map(
              (episode) => `
                <article class="memory-episode-card ${episode.success ? "success" : "warn"}">
                  <span>${typeLabel(episode.taskId)} · ${episode.focusSelection?.scaleLabel || "预设区域"}</span>
                  <strong>${episode.focusSelection?.label || episode.scenarioTitle}</strong>
                  <p>${episode.insight}</p>
                  <div class="memory-meta">
                    <span>${episode.observation.dateValue || "未知日期"} ${String(episode.observation.hour ?? 0).padStart(2, "0")}:00</span>
                    <span>${productLabel(episode.outputProduct)} · ${episode.confidence}%</span>
                    <span>${episode.repairs?.length ? `${episode.repairs.length} 次修复` : "无修复"}</span>
                  </div>
                  <div class="action-row memory-actions">
                    <button
                      type="button"
                      class="ghost-button memory-replay-button"
                      data-memory-episode-id="${episode.id}"
                    >回灌到当前任务</button>
                    <button
                      type="button"
                      class="secondary-button memory-rerun-button"
                      data-memory-rerun-id="${episode.id}"
                    >回灌并复跑</button>
                  </div>
                </article>
              `
            )
            .join("")}
        </div>
      </section>
    `
    : "";

  const ruleSection = rules.length
    ? `
      <section class="memory-section">
        <div class="memory-section-head">
          <span>修复规则</span>
          <strong>系统从失败路径里学到的稳定策略</strong>
        </div>
        <div class="memory-rule-grid">
          ${rules
            .map(
              (rule) => `
                <div class="memory-rule">
                  <span>${typeLabel(rule.scope)}</span>
                  <strong>${RULE_REASON_LABELS[rule.reason] ?? rule.reason}</strong>
                  <div>修复动作：${RULE_ACTION_LABELS[rule.action] ?? rule.action}</div>
                  <div>复用次数：${rule.count}</div>
                </div>
              `
            )
            .join("")}
        </div>
      </section>
    `
    : `
      <section class="memory-section">
        <div class="scene-compare-note">当前还没有形成稳定的失败修复规则，说明这批经验更多是“案例复用”而不是“故障回避”。</div>
      </section>
    `;

  memoryPanel.innerHTML = `${episodeSection}${ruleSection}`;
}

function renderPlanNotes(plan) {
  if (!plan.notes.length) {
    return;
  }

  const noteCard = document.createElement("div");
  noteCard.className = "narrative-card";
  noteCard.innerHTML = `
    <span>规划说明</span>
    <p>${plan.notes.join(" ")}</p>
  `;
  workflowPlan.prepend(noteCard);
}

function clearResultPanels() {
  latestReport = null;
  latestInferenceRun = null;
  latestVectorCollection = null;
  latestJsonTileBundle = null;
  latestVectorTilePreview = null;
  latestEvalReport = null;
  workflowPlan.innerHTML = '<div class="empty-state">点击“开始演示”后，这里会生成对应的处理流程。</div>';
  executionLog.innerHTML = '<div class="empty-state">运行后，这里会显示逐步处理记录。</div>';
  metricsCards.innerHTML = '<div class="empty-state">运行完成后，这里会展示结果指标。</div>';
  compareTable.innerHTML = "";
  compareExplain.innerHTML =
    '<div class="empty-state">运行完成后，这里会补充资源、可信度来源和结果边界的解读。</div>';
  narrativePanel.innerHTML = '<div class="empty-state">运行完成后，这里会生成一段便于汇报的说明文字。</div>';
  if (workbenchBootstrapped) {
    renderInferenceRunSummary();
    renderVectorSummary();
    renderJsonTilePanel();
    renderVectorTilePanel();
    renderOfflineEvalPanel();
  }
  renderAgentDecisionPanel();
  renderShowcaseSummary();
}

function resetDataAccessPanels() {
  latestStacResult = null;
  latestLaadsResult = null;
  latestLaadsPlan = null;
  latestAssetInspection = null;
  latestCloudMaskResult = null;
  latestPreprocessGate = null;
  latestS2cloudlessEstimate = null;
  latestFmaskEstimate = null;
  latestAlignmentPlan = null;
  if (workbenchBootstrapped) {
    renderStacResults();
    renderLaadsResults();
    renderAssetInspection();
    renderCloudMaskResults();
    recomputePreprocessGate();
    renderAdvancedPreprocessPanel();
    syncAssetUrlInputFromSource();
  } else {
    renderAgentDecisionPanel();
  }
}

function setRunButtonsBusy(busy) {
  runButton.disabled = busy;
  sceneRunButton.disabled = busy;
  if (busy) {
    runButton.textContent = currentTaskMode() === "planning" ? "正在生成方案..." : "场景加载中...";
    sceneRunButton.textContent = currentTaskMode() === "planning" ? "正在准备方案..." : "正在准备...";
    return;
  }
  updateRunActionLabels();
}

function cacheKeyForSnapshot(snapshot, intent = "preview") {
  return `${intent}:${snapshot.id}:${snapshot.focusSelection?.cacheKey || "preset"}:${snapshot.observation.dateValue}:${String(
    snapshot.observation.hour
  ).padStart(2, "0")}`;
}

function trimDecisionPreviewCache(preserveKey = null) {
  while (decisionPreviewCache.size > DECISION_PREVIEW_CACHE_LIMIT) {
    const staleKey = decisionPreviewCache.keys().next().value;
    if (!staleKey) {
      return;
    }
    if (preserveKey && staleKey === preserveKey && decisionPreviewCache.size > 1) {
      const value = decisionPreviewCache.get(staleKey);
      decisionPreviewCache.delete(staleKey);
      decisionPreviewCache.set(staleKey, value);
      continue;
    }
    decisionPreviewCache.delete(staleKey);
  }
}

function decisionPreviewCacheKey({ task, scenario, options }) {
  return [
    task.id,
    task.status,
    scenario.id,
    scenario.focusSelection?.cacheKey || "preset",
    scenario.observation.iso,
    options.budgetMin,
    options.powerMode,
    options.downlinkPolicy,
  ].join(":");
}

function planningReportPreviewPlan(report) {
  return {
    workflowLabel: report.planning?.workflowLabel || "规划态：智能体求解链路",
    steps: Array.isArray(report.planning?.steps)
      ? report.planning.steps.map((step) =>
          typeof step === "string" ? step : step?.title || step?.detail || "规划步骤"
        )
      : [],
  };
}

function getDecisionPreviewPlan({ task, scenario, options, gate, report }) {
  if (report?.mode === "planning") {
    return planningReportPreviewPlan(report);
  }

  if (task.status !== "ready") {
    return buildPlanningMissionSnapshot({
      task,
      scenario,
      gate,
      options,
      focusScaleLabel: scenario.focusSelection?.scaleLabel || "当前区域",
    });
  }

  if (report?.agentPlan) {
    return report.agentPlan;
  }

  const key = decisionPreviewCacheKey({ task, scenario, options });
  if (!decisionPreviewCache.has(key)) {
    decisionPreviewCache.set(
      key,
      runAgentMission(scenarioForAgentExecution(scenario, gate), options, readMemory()).plan
    );
    trimDecisionPreviewCache(key);
  }

  return decisionPreviewCache.get(key);
}

function isAbortError(error) {
  return error?.name === "AbortError" || error?.code === 20;
}

async function getObservedScenario(snapshot = null, { intent = "preview", signal } = {}) {
  const baseSnapshot = snapshot ?? buildScenarioSnapshot();
  const key = cacheKeyForSnapshot(baseSnapshot, intent);

  if (!sceneCache.has(key)) {
    sceneCache.set(
      key,
      enrichScenarioWithRemoteData(baseSnapshot, { signal })
        .then((remoteScenario) =>
          tryEnhanceScenarioWithLocalModel(remoteScenario, {
            signal,
            allowPython: intent !== "preview",
          })
        )
        .catch((error) => {
          if (isAbortError(error)) {
            sceneCache.delete(key);
          }
          throw error;
        })
    );
    if (sceneCache.size > SCENE_CACHE_LIMIT) {
      const staleKey = sceneCache.keys().next().value;
      if (staleKey && staleKey !== key) {
        sceneCache.delete(staleKey);
      }
    }
  }

  return sceneCache.get(key);
}

async function refreshScenarioPreview() {
  const token = ++refreshToken;
  if (previewAbortController) {
    previewAbortController.abort();
  }
  previewAbortController = new AbortController();
  const snapshot = buildScenarioSnapshot();
  latestSceneLoadSummary = buildSceneLoadSummary(snapshot);
  latestObservedScenario = null;
  latestObservedScenarioIntent = "preview";
  latestSceneOverlayDiagnostics = null;
  syncRoiDrawingScene(snapshot);
  void refreshGlobalOverviewPanel();
  if (workbenchBootstrapped) {
    void refreshBasemapProxyPanel();
  }

  renderTimelineStatus();
  renderMissionBriefLoading(snapshot, currentOptions());
  renderSceneLoading(snapshot);
  renderRoiDrawingLab(snapshot);
  renderAgentDecisionPanel(snapshot, currentOptions());
  renderShowcaseSummary(snapshot, currentOptions());
  renderCapabilityPanel(snapshot);
  if (workbenchBootstrapped) {
    renderStacContextPanel();
    renderLaadsContextPanel();
    renderCloudMaskContextPanel();
    renderAssetContextPanel();
  }
  recomputePreprocessGate();
  if (workbenchBootstrapped) {
    renderRunnerContext();
    renderAdvancedPreprocessPanel();
  }
  setRunButtonsBusy(true);

  try {
    const scenario = await getObservedScenario(snapshot, {
      intent: "preview",
      signal: previewAbortController.signal,
    });
    if (token !== refreshToken) {
      return;
    }

    latestObservedScenario = scenario;
    latestObservedScenarioIntent = "preview";
    syncRoiDrawingScene(scenario);
    renderTimelineStatus(scenario);
    renderMissionBrief(scenario, currentOptions());
    renderSceneMap(scenario);
    renderRoiDrawingLab(scenario);
    renderAgentDecisionPanel(scenario, currentOptions());
    renderShowcaseSummary(scenario, currentOptions());
    renderCapabilityPanel(scenario);
    if (workbenchBootstrapped) {
      renderStacContextPanel();
      renderLaadsContextPanel();
      renderCloudMaskContextPanel();
      renderAssetContextPanel();
    }
    recomputePreprocessGate();
    if (workbenchBootstrapped) {
      renderRunnerContext();
      renderAdvancedPreprocessPanel();
      void refreshModelRegistryPanel();
    }
  } catch (error) {
    if (!isAbortError(error)) {
      throw error;
    }
  } finally {
    if (token === refreshToken) {
      setRunButtonsBusy(false);
    }
  }
}

function scheduleScenarioPreview() {
  window.clearTimeout(previewTimer);
  previewTimer = window.setTimeout(() => {
    void refreshScenarioPreview();
  }, 220);
}

async function runMission() {
  setRunButtonsBusy(true);
  if (previewAbortController) {
    previewAbortController.abort();
  }

  try {
    const observedScenario =
      currentTaskMode() === "planning"
        ? latestObservedScenario ?? (await getObservedScenario(buildScenarioSnapshot(), { intent: "preview" }))
        : latestObservedScenarioIntent === "execution" && latestObservedScenario
          ? latestObservedScenario
          : await getObservedScenario(buildScenarioSnapshot(), { intent: "execution" });
    const gate =
      latestPreprocessGate ??
      evaluatePreprocessGate({
        scenario: observedScenario,
        cloudMaskResult: latestCloudMaskResult,
        threshold: currentCloudMaskThreshold(),
      });
    latestPreprocessGate = gate;
    const scenario =
      currentTaskMode() === "planning" ? observedScenario : scenarioForAgentExecution(observedScenario, gate);
    latestObservedScenario = scenario;
    latestObservedScenarioIntent = currentTaskMode() === "planning" ? "preview" : "execution";
    latestSceneLoadSummary = buildSceneLoadSummary(scenario);
    renderPreprocessGatePanel(gate, observedScenario);

    const options = currentOptions();
    const task = currentTask();
    const memory = readMemory();

    renderMissionBrief(scenario, options);
    renderSceneMap(scenario);
    executionLog.innerHTML =
      currentTaskMode() === "planning"
        ? '<div class="empty-state">正在生成当前任务的智能体求解方案。</div>'
        : '<div class="empty-state">正在执行本次任务，处理记录会按步骤依次出现。</div>';

    if (currentTaskMode() === "planning") {
      const planning = buildPlanningMissionSnapshot({
        task,
        scenario,
        gate,
        options,
        focusScaleLabel: scenario.focusSelection?.scaleLabel || "当前区域",
      });

      workflowPlan.innerHTML = planning.steps
        .map(
          (step, index) => `
            <div class="workflow-step">
              <small>步骤 ${index + 1}</small>
              <strong>${step.title}</strong>
              <small>${step.detail}</small>
            </div>
          `
        )
        .join("");

      executionLog.innerHTML = planning.steps
        .map(
          (step, index) => `
            <div class="log-entry">
              <div class="status-line">
                <span class="badge warn">规划中</span>
                <strong>${step.title}</strong>
              </div>
              <div>${step.detail}</div>
              <div class="log-meta">
                <span>任务类型：${task.label}</span>
                <span>当前模式：规划态</span>
              </div>
            </div>
          `
        )
        .join("");

      metricsCards.innerHTML = planning.metrics
        .map(
          (metric) => `
            <div class="metric-card">
              <span>${metric.title}</span>
              <strong>${metric.strong}</strong>
              <p>${metric.detail}</p>
            </div>
          `
        )
        .join("");
      compareTable.innerHTML = "";
      renderCompareNotes([
        {
          title: "规划边界",
          detail:
            "当前任务类型还未完全接入真实在线模型链路，因此智能体先输出“求解方案”，而不是伪造一个已经完成的结果。这样可以同时展示任务广度和真实工程边界。",
        },
        {
          title: "骨架价值",
          detail:
            "即便在规划模式下，智能体仍然围绕真实区域、真实时间、真实底图和真实去云门禁做决策，这部分正是后续把新任务接入平台时最重要的骨架。",
        },
      ]);
      renderNarrative(planning.narrative);
      renderMemory(memory);

      latestReport = {
        exportedAt: new Date().toISOString(),
        scenario,
        options,
        taskId: task.id,
        mode: "planning",
        planning,
        memorySnapshot: memory,
      };
      renderAgentDecisionPanel(scenario, options);
      renderShowcaseSummary(scenario, options);
      renderCapabilityPanel(scenario);
      return;
    }

    const agentRun = runAgentMission(scenario, options, memory, { taskId: task.id });
    const baselineRun = runBaselineMission(scenario, options);

    writeMemory(agentRun.memory);
    decisionPreviewCache.clear();

    renderWorkflowPlan(agentRun.plan, agentRun.result);
    renderPlanNotes(agentRun.plan);
    await renderLogs(agentRun.result.logs);
    renderSceneMap(scenario, agentRun.result);
    renderMetrics(agentRun, baselineRun);
    renderNarrative(buildNarrative(scenario, agentRun, baselineRun));
    renderMemory(agentRun.memory);

    latestReport = {
      ...buildReportPayload(scenario, options, agentRun, baselineRun),
      taskId: task.id,
      mode: "operational",
    };
    renderAgentDecisionPanel(scenario, options);
    renderShowcaseSummary(scenario, options);
    renderCapabilityPanel(scenario);
  } finally {
    setRunButtonsBusy(false);
  }
}

function exportReport() {
  if (!latestReport) {
    return;
  }

  const dayTag = latestReport.scenario.observation.dateValue;
  const hourTag = String(latestReport.scenario.observation.hour).padStart(2, "0");
  const blob = new Blob([JSON.stringify(latestReport, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `satatmo-agent-report-${latestReport.scenario.id}-${dayTag}-${hourTag}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function replayMemoryEpisode(episodeId, { runAfterReplay = false } = {}) {
  const memory = readMemory();
  const episode = memory.episodes.find((item) => item.id === episodeId);
  if (!episode) {
    return;
  }

  const replayScenarioId = episode.baseScenarioId || episode.scenarioId;
  if (replayScenarioId) {
    scenarioSelect.value = replayScenarioId;
  }
  if (episode.taskId) {
    taskTypeSelect.value = episode.taskId;
  }
  if (episode.options) {
    budgetInput.value = String(episode.options.budgetMin ?? budgetInput.value);
    powerModeSelect.value = episode.options.powerMode || powerModeSelect.value;
    downlinkSelect.value = episode.options.downlinkPolicy || downlinkSelect.value;
  }
  budgetValue.textContent = `${budgetInput.value} 分钟`;

  if (episode.observation?.dateValue) {
    const nextDayIndex = Math.max(0, Math.min(Number(dateSlider.max) || 0, dateValueToDayIndex(episode.observation.dateValue)));
    dateSlider.value = String(nextDayIndex);
    dateInput.value = episode.observation.dateValue;
  }
  if (episode.observation?.hour !== undefined && episode.observation?.hour !== null) {
    hourSlider.value = String(clamp(Number(episode.observation.hour) || 0, 0, 23));
  }

  if (Array.isArray(episode.focusSelection?.bbox) && episode.focusSelection.bbox.length === 4) {
    pendingGlobalSelection = null;
    applyGlobalSelectionState({
      bbox: episode.focusSelection.bbox,
      label: episode.focusSelection.label || "经验案例选区",
    });
    renderGlobalOverviewPanel();
  } else {
    pendingGlobalSelection = null;
    activeGlobalSelection = null;
    globalSelectionDraft = null;
    globalViewport = createGlobalViewportState();
    globalInteractionMode = "select";
    renderGlobalOverviewPanel();
  }

  invalidateObservedScenario();
  renderTimelineStatus();
  clearResultPanels();
  resetDataAccessPanels();
  updateRunActionLabels();
  renderMemory(memory);
  if (runAfterReplay) {
    window.clearTimeout(previewTimer);
    void runMission();
    return;
  }

  scheduleScenarioPreview();
}

function resetMemory() {
  const cleared = createMemory();
  writeMemory(cleared);
  decisionPreviewCache.clear();
  renderMemory(cleared);
  renderAgentDecisionPanel();
  renderShowcaseSummary();
}

function handleScenarioChange() {
  const preset = getOptionPreset(baseScenario());
  const task = currentTask();
  if (task.status === "ready" && task.id !== baseScenario().type) {
    taskTypeSelect.value = baseScenario().type;
  }
  budgetInput.value = String(preset.budgetMin);
  powerModeSelect.value = preset.powerMode;
  downlinkSelect.value = preset.downlinkPolicy;
  budgetValue.textContent = `${preset.budgetMin} 分钟`;
  invalidateObservedScenario();
  clearResultPanels();
  resetDataAccessPanels();
  updateRunActionLabels();
  scheduleScenarioPreview();
}

function handleDateSliderChange() {
  renderTimelineStatus();
  invalidateObservedScenario();
  clearResultPanels();
  resetDataAccessPanels();
  scheduleScenarioPreview();
}

function handleDateInputChange() {
  dateSlider.value = String(dateValueToDayIndex(dateInput.value));
  renderTimelineStatus();
  invalidateObservedScenario();
  clearResultPanels();
  resetDataAccessPanels();
  scheduleScenarioPreview();
}

function handleHourChange() {
  renderTimelineStatus();
  invalidateObservedScenario();
  clearResultPanels();
  resetDataAccessPanels();
  scheduleScenarioPreview();
}

function handleOptionChange() {
  budgetValue.textContent = `${budgetInput.value} 分钟`;
  clearResultPanels();
  if (latestObservedScenario) {
    renderMissionBrief(latestObservedScenario, currentOptions());
  }
  renderAgentDecisionPanel(latestObservedScenario ?? undefined, currentOptions());
  renderShowcaseSummary(latestObservedScenario ?? undefined, currentOptions());
}

function handleTaskTypeChange() {
  const task = currentTask();
  const presetScenarioId = readyTaskScenarioId(task.id);

  if (task.status === "ready" && presetScenarioId && scenarioSelect.value !== presetScenarioId) {
    scenarioSelect.value = presetScenarioId;
  }

  invalidateObservedScenario();
  clearResultPanels();
  resetDataAccessPanels();
  updateRunActionLabels();
  scheduleScenarioPreview();
}

function handleOverlayToggle() {
  if (!latestObservedScenario) {
    return;
  }

  const result = reportMatchesScenario(latestObservedScenario)
    ? latestReport.agentResult
    : null;

  renderSceneMap(latestObservedScenario, result);
}

function handleMemoryPanelClick(event) {
  const rerunButton = event.target.closest("[data-memory-rerun-id]");
  if (rerunButton) {
    replayMemoryEpisode(rerunButton.dataset.memoryRerunId, { runAfterReplay: true });
    return;
  }

  const replayButton = event.target.closest("[data-memory-episode-id]");
  if (!replayButton) {
    return;
  }

  replayMemoryEpisode(replayButton.dataset.memoryEpisodeId);
}

function handleRoiPresetChange() {
  fillRoiInputFromPreset();
  validateRoiLabInput();
}

function resetRoiPreset() {
  fillRoiInputFromPreset();
  validateRoiLabInput();
}

function handleRoiDrawModeChange() {
  roiDrawingState = setDrawingMode(roiDrawingState, roiDrawModeSelect.value);
  renderRoiDrawingLab(activeRoiDrawingScenario());
}

function handleRoiDrawPointerDown(event) {
  const handle = event.target.closest("[data-handle-index]");
  if (handle) {
    roiDrawingDrag = {
      roiId: handle.dataset.roiId,
      vertexIndex: Number(handle.dataset.handleIndex),
    };
    event.preventDefault();
    return;
  }

  const shape = event.target.closest("[data-roi-id]");
  if (shape) {
    roiDrawingState = selectRoi(roiDrawingState, shape.dataset.roiId);
    renderRoiDrawingLab(activeRoiDrawingScenario());
    return;
  }

  if (roiDrawingState.mode !== "bbox") {
    return;
  }

  const point = drawingPointFromEvent(event);
  if (!point) {
    return;
  }

  roiDrawingState = beginBboxDraft(roiDrawingState, point);
  renderRoiDrawingLab(activeRoiDrawingScenario());
}

function handleRoiDrawPointerMove(event) {
  if (roiDrawingDrag) {
    const point = drawingPointFromEvent(event);
    if (!point) {
      return;
    }

    roiDrawingState = moveVertex(roiDrawingState, roiDrawingDrag.roiId, roiDrawingDrag.vertexIndex, point);
    renderRoiDrawingLab(activeRoiDrawingScenario());
    return;
  }

  if (roiDrawingState.draft?.type !== "bbox") {
    return;
  }

  const point = drawingPointFromEvent(event);
  if (!point) {
    return;
  }

  roiDrawingState = updateBboxDraft(roiDrawingState, point);
  renderRoiDrawingLab(activeRoiDrawingScenario());
}

function handleRoiDrawPointerUp(event) {
  if (roiDrawingDrag) {
    roiDrawingDrag = null;
    return;
  }

  if (roiDrawingState.draft?.type !== "bbox") {
    return;
  }

  const point = drawingPointFromEvent(event);
  const committed = commitBboxDraft(roiDrawingState, point ?? roiDrawingState.draft.current);
  roiDrawingState = committed.state;
  renderRoiDrawingLab(activeRoiDrawingScenario());
}

function handleRoiDrawClick(event) {
  const roiItem = event.target.closest("[data-roi-item-id]");
  if (roiItem) {
    roiDrawingState = selectRoi(roiDrawingState, roiItem.dataset.roiItemId);
    renderRoiDrawingLab(activeRoiDrawingScenario());
    return;
  }

  const hasInteractiveTarget = event.target.closest("[data-handle-index]") || event.target.closest("[data-roi-id]");
  if (hasInteractiveTarget || roiDrawingState.mode !== "polygon") {
    return;
  }

  const point = drawingPointFromEvent(event);
  if (!point) {
    return;
  }

  roiDrawingState = addPolygonVertex(roiDrawingState, point);
  renderRoiDrawingLab(activeRoiDrawingScenario());
}

function handleCompletePolygon() {
  const committed = commitPolygonDraft(roiDrawingState);
  roiDrawingState = committed.state;
  renderRoiDrawingLab(activeRoiDrawingScenario());
}

function handleDeleteSelectedRoi() {
  roiDrawingState = deleteSelectedRoi(roiDrawingState);
  renderRoiDrawingLab(activeRoiDrawingScenario());
}

function handleClearRoiDrawing() {
  roiDrawingState = clearAllRois(roiDrawingState);
  renderRoiDrawingLab(activeRoiDrawingScenario());
}

function handleStacProviderChange() {
  renderStacCollectionOptions();
  renderStacContextPanel();
}

function handleLaadsProductChange() {
  renderLaadsContextPanel();
}

function handleAssetSourceChange() {
  syncAssetUrlInputFromSource();
}

function handleGlobalPointerDown(event) {
  if (!globalOverview?.src) {
    return;
  }

  const screenPoint = globalScreenPointFromEvent(event);
  if (!screenPoint) {
    return;
  }

  if (globalInteractionMode === "pan") {
    globalPanDrag = {
      point: screenPoint,
    };
    return;
  }

  const point = worldPointFromViewportPoint(screenPoint, globalViewport);
  globalSelectionDraft = {
    start: point,
    current: point,
  };
  renderGlobalOverviewPanel();
}

function handleGlobalPointerMove(event) {
  const screenPoint = globalScreenPointFromEvent(event);

  if (globalPanDrag) {
    if (!screenPoint) {
      return;
    }

    globalViewport = panGlobalViewport(globalViewport, {
      x: screenPoint.x - globalPanDrag.point.x,
      y: screenPoint.y - globalPanDrag.point.y,
    });
    globalPanDrag = {
      point: screenPoint,
    };
    renderGlobalOverviewPanel();
    return;
  }

  if (!globalSelectionDraft) {
    return;
  }

  const point = screenPoint ? worldPointFromViewportPoint(screenPoint, globalViewport) : null;
  if (!point) {
    return;
  }

  globalSelectionDraft = {
    ...globalSelectionDraft,
    current: point,
  };
  renderGlobalOverviewPanel();
}

function handleGlobalPointerUp(event) {
  if (globalPanDrag) {
    globalPanDrag = null;
    renderGlobalOverviewControls();
    return;
  }

  if (!globalSelectionDraft) {
    return;
  }

  const screenPoint = globalScreenPointFromEvent(event);
  const point = screenPoint ? worldPointFromViewportPoint(screenPoint, globalViewport) : globalSelectionDraft.current;
  globalSelectionDraft = {
    ...globalSelectionDraft,
    current: point,
  };
  pendingGlobalSelection = selectionFromDraft(globalSelectionDraft);
  globalSelectionDraft = null;
  renderGlobalOverviewPanel();
}

function setGlobalInteractionMode(mode = "select") {
  globalInteractionMode = mode === "pan" ? "pan" : "select";
  globalPanDrag = null;
  renderGlobalOverviewControls();
}

function nudgeGlobalZoom(factor, anchor = { x: 0.5, y: 0.5 }) {
  if (!globalOverview?.src) {
    return;
  }

  globalViewport = scaleGlobalViewport(globalViewport, factor, anchor);
  renderGlobalOverviewPanel();
}

function resetGlobalViewport() {
  globalViewport = createGlobalViewportState();
  globalPanDrag = null;
  renderGlobalOverviewPanel();
}

function handleGlobalWheel(event) {
  if (!globalOverview?.src) {
    return;
  }

  const screenPoint = globalScreenPointFromEvent(event);
  if (!screenPoint) {
    return;
  }

  event.preventDefault();
  const factor = event.deltaY < 0 ? 1.3 : 1 / 1.3;
  globalViewport = scaleGlobalViewport(globalViewport, factor, screenPoint);
  renderGlobalOverviewPanel();
}

function currentDiagnostics() {
  const currentAnalysis = latestObservedScenario?.analysis || null;
  return {
    surfaceMode: selectedSurfaceMode(),
    latestObservedScenarioId: latestObservedScenario?.id || null,
    latestObservedScenarioIntent,
    sceneCacheSize: sceneCache.size,
    decisionPreviewCacheSize: decisionPreviewCache.size,
    activeGlobalSelection,
    pendingGlobalSelection,
    globalViewport,
    globalInteractionMode,
    latestSceneLoadSummary,
    sceneOverlay: latestSceneOverlayDiagnostics,
    sceneAnalysis: currentAnalysis
      ? {
          validPixelRatio: currentAnalysis.validPixelRatio,
          decloudApplied: currentAnalysis.decloudApplied,
          hasValidRegionField: Boolean(currentAnalysis.validRegion),
          hasValidRegion: Boolean(getAnalysisValidRegion(currentAnalysis)),
          validRegionMaskKind: currentAnalysis.validRegion?.validMask?.constructor?.name || null,
          validRegionMaskLength:
            currentAnalysis.validRegion?.validMask?.length ||
            currentAnalysis.validRegion?.validMask?.byteLength ||
            null,
        }
      : null,
    remoteSensing: getRemoteSensingDiagnostics(),
  };
}

function installLocalDebugBridge() {
  if (!canUseWorkbench()) {
    return;
  }

  window.__satAgentDebug = {
    getDiagnostics: () => currentDiagnostics(),
    getCurrentTask: () => currentTask(),
    switchSurfaceMode: (mode) => handleSurfaceModeChange(mode),
    applyGlobalSelection: (selection = {}) => {
      if (!Array.isArray(selection.bbox) || selection.bbox.length !== 4) {
        throw new Error("bbox must contain four numeric values");
      }
      pendingGlobalSelection = null;
      applyGlobalSelectionState({
        bbox: selection.bbox,
        label: selection.label || "自动化测试选区",
      });
      renderGlobalOverviewPanel();
    },
    zoomGlobalOverview: (factor = 1.3) => {
      globalViewport = scaleGlobalViewport(globalViewport, factor);
      renderGlobalOverviewPanel();
    },
    setGlobalInteractionMode: (mode = "select") => {
      setGlobalInteractionMode(mode);
    },
    clearGlobalSelection: () => clearGlobalSelection(),
    replayMemoryEpisode: (episodeId) => replayMemoryEpisode(episodeId),
    replayMemoryAndRun: (episodeId) => replayMemoryEpisode(episodeId, { runAfterReplay: true }),
    waitFor: (ms = 0) => new Promise((resolve) => window.setTimeout(resolve, ms)),
  };
}

function ensureWorkbenchBootstrapped() {
  if (workbenchBootstrapped) {
    return;
  }

  workbenchBootstrapped = true;
  renderIterationBoard();
  renderRoiPresetSelect();
  renderLayerCatalogPanel();
  renderBasemapProxyPanel();
  renderStacResults();
  renderLaadsResults();
  renderCloudMaskThreshold();
  renderCloudMaskResults();
  renderPreprocessGatePanel();
  renderRunnerContext();
  renderInferenceRunSummary();
  renderAssetInspection();
  renderVectorSummary();
  renderAdvancedPreprocessPanel();
  renderJsonTilePanel();
  renderVectorTilePanel();
  renderQueuePanel();
  renderOfflineEvalPanel();
  renderArtifactIndexPanel();
  fillRoiInputFromPreset();
  validateRoiLabInput();
  renderStacContextPanel();
  renderLaadsContextPanel();
  renderCloudMaskContextPanel();
  syncAssetUrlInputFromSource();
  void refreshModelRegistryPanel();
  void loadStacCatalog().then(() => {
    renderStacCatalogControls();
    renderStacContextPanel();
  });
  void loadLaadsCatalog().then(() => {
    renderLaadsCatalogControls();
    renderLaadsContextPanel();
  });
  void loadCloudMaskCatalog().then(() => {
    renderCloudMaskCatalogControls();
    renderCloudMaskContextPanel();
  });
  if (readPrecomputeQueue().some((job) => job.status === "queued")) {
    schedulePrecomputeProcessing();
  }
}

function handleSurfaceModeChange(mode) {
  ensureSurfaceMode(mode);
  if (selectedSurfaceMode() === "workbench") {
    ensureWorkbenchBootstrapped();
  }
  renderShowcaseSummary(latestObservedScenario ?? undefined, currentOptions());
  renderCapabilityPanel(latestObservedScenario ?? undefined);
}

function bootstrap() {
  renderScenarioSelect();
  renderTaskTypeSelect();
  renderGlobalOverviewPanel();
  renderRoiDrawingLab();
  seedControls();
  taskTypeSelect.value = baseScenario().type;
  ensureSurfaceMode(currentSurfaceMode);
  installLocalDebugBridge();
  if (selectedSurfaceMode() === "workbench") {
    ensureWorkbenchBootstrapped();
  }
  clearResultPanels();
  renderMemory(readMemory());
  renderAgentDecisionPanel();
  renderShowcaseSummary();
  renderCapabilityPanel();
  updateRunActionLabels();
  void refreshScenarioPreview();
  if (workbenchBootstrapped && readPrecomputeQueue().some((job) => job.status === "queued")) {
    schedulePrecomputeProcessing();
  }

  scenarioSelect.addEventListener("change", handleScenarioChange);
  taskTypeSelect.addEventListener("change", handleTaskTypeChange);
  budgetInput.addEventListener("input", handleOptionChange);
  powerModeSelect.addEventListener("change", handleOptionChange);
  downlinkSelect.addEventListener("change", handleOptionChange);
  showcaseModeButton.addEventListener("click", () => {
    handleSurfaceModeChange("showcase");
  });
  workbenchModeButton.addEventListener("click", () => {
    handleSurfaceModeChange("workbench");
  });
  overlayToggle.addEventListener("change", handleOverlayToggle);
  decloudPreviewToggle.addEventListener("change", handleOverlayToggle);
  memoryPanel.addEventListener("click", handleMemoryPanelClick);
  globalOverviewCanvas.addEventListener("pointerdown", handleGlobalPointerDown);
  globalOverviewCanvas.addEventListener("wheel", handleGlobalWheel, { passive: false });
  window.addEventListener("pointermove", handleGlobalPointerMove);
  window.addEventListener("pointerup", handleGlobalPointerUp);
  globalSelectModeButton?.addEventListener("click", () => {
    setGlobalInteractionMode("select");
  });
  globalPanModeButton?.addEventListener("click", () => {
    setGlobalInteractionMode("pan");
  });
  globalZoomOutButton?.addEventListener("click", () => {
    nudgeGlobalZoom(1 / 1.35);
  });
  globalZoomResetButton?.addEventListener("click", () => {
    resetGlobalViewport();
  });
  globalZoomInButton?.addEventListener("click", () => {
    nudgeGlobalZoom(1.35);
  });
  globalApplySelectionButton.addEventListener("click", applyPendingGlobalSelection);
  globalClearSelectionButton.addEventListener("click", clearGlobalSelection);
  dateSlider.addEventListener("input", handleDateSliderChange);
  dateInput.addEventListener("change", handleDateInputChange);
  hourSlider.addEventListener("input", handleHourChange);
  runButton.addEventListener("click", () => {
    void runMission();
  });
  sceneRunButton.addEventListener("click", () => {
    void runMission();
  });
  roiPresetSelect.addEventListener("change", handleRoiPresetChange);
  roiValidateButton.addEventListener("click", validateRoiLabInput);
  roiResetButton.addEventListener("click", resetRoiPreset);
  roiDrawModeSelect.addEventListener("change", handleRoiDrawModeChange);
  roiPolygonCompleteButton.addEventListener("click", handleCompletePolygon);
  roiSubmitButton.addEventListener("click", submitSelectedRoiToValidation);
  roiDeleteButton.addEventListener("click", handleDeleteSelectedRoi);
  roiClearButton.addEventListener("click", handleClearRoiDrawing);
  roiDrawCanvas.addEventListener("pointerdown", handleRoiDrawPointerDown);
  roiDrawCanvas.addEventListener("click", handleRoiDrawClick);
  window.addEventListener("pointermove", handleRoiDrawPointerMove);
  window.addEventListener("pointerup", handleRoiDrawPointerUp);
  stacProviderSelect.addEventListener("change", handleStacProviderChange);
  stacSourceSelect.addEventListener("change", renderStacContextPanel);
  stacWindowSelect.addEventListener("change", renderStacContextPanel);
  stacSearchButton.addEventListener("click", () => {
    void runStacSearch();
  });
  laadsProductSelect.addEventListener("change", handleLaadsProductChange);
  laadsSourceSelect.addEventListener("change", renderLaadsContextPanel);
  laadsWindowSelect.addEventListener("change", renderLaadsContextPanel);
  laadsSearchButton.addEventListener("click", () => {
    void runLaadsSearch();
  });
  laadsPlanButton.addEventListener("click", () => {
    void runLaadsPlan();
  });
  assetSourceSelect.addEventListener("change", handleAssetSourceChange);
  assetWindowSourceSelect.addEventListener("change", renderAssetContextPanel);
  assetInspectButton.addEventListener("click", () => {
    void runAssetInspection();
  });
  cloudMaskProductSelect.addEventListener("change", renderCloudMaskContextPanel);
  cloudMaskSourceSelect.addEventListener("change", renderCloudMaskContextPanel);
  cloudMaskWindowSelect.addEventListener("change", renderCloudMaskContextPanel);
  cloudMaskThresholdInput.addEventListener("input", () => {
    renderCloudMaskThreshold();
    renderCloudMaskContextPanel();
    recomputePreprocessGate();
  });
  cloudMaskSearchButton.addEventListener("click", () => {
    void runCloudMaskSearch();
  });
  s2cloudlessButton.addEventListener("click", runS2cloudlessEstimate);
  fmaskButton.addEventListener("click", runFmaskEstimate);
  alignmentButton.addEventListener("click", runAlignmentPlan);
  runnerRunButton.addEventListener("click", () => {
    void runInferenceRunnerPanel();
  });
  vectorBuildButton.addEventListener("click", buildVectorCollection);
  jsonTileBuildButton.addEventListener("click", buildJsonTiles);
  vectorTileBuildButton.addEventListener("click", buildVectorTilePreviewPanel);
  queueEnqueueButton.addEventListener("click", enqueueCurrentPrecomputeJob);
  queueRetryButton.addEventListener("click", retryFailedPrecomputeJobs);
  evalRunButton.addEventListener("click", runOfflineEvalPanel);
  cacheRegisterButton.addEventListener("click", registerCurrentArtifact);
  cacheResetButton.addEventListener("click", resetArtifactIndexPanel);
  exportButton.addEventListener("click", exportReport);
  resetMemoryButton.addEventListener("click", resetMemory);
}

bootstrap();
