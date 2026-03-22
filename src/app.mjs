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
  buildNarrative,
  buildReportPayload,
  createMemory,
  getOptionPreset,
  runAgentMission,
  runBaselineMission,
} from "./engine.mjs";
import { toolCatalog } from "./workflows.mjs";

const scenarioSelect = document.querySelector("#scenarioSelect");
const budgetInput = document.querySelector("#budgetInput");
const budgetValue = document.querySelector("#budgetValue");
const powerModeSelect = document.querySelector("#powerModeSelect");
const downlinkSelect = document.querySelector("#downlinkSelect");
const runButton = document.querySelector("#runButton");
const exportButton = document.querySelector("#exportButton");
const resetMemoryButton = document.querySelector("#resetMemoryButton");

const overlayToggle = document.querySelector("#overlayToggle");
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
const narrativePanel = document.querySelector("#narrativePanel");
const memoryPanel = document.querySelector("#memoryPanel");

const MEMORY_KEY = "sat-atmo-agent-memory";

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
};

const TYPE_LABELS = {
  dust: "沙尘任务",
  pollution: "污染任务",
  mixed: "混合任务",
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

function readMemory() {
  try {
    const parsed = JSON.parse(localStorage.getItem(MEMORY_KEY) || "null");
    return parsed && Array.isArray(parsed.rules) ? parsed : createMemory();
  } catch {
    return createMemory();
  }
}

function writeMemory(memory) {
  localStorage.setItem(MEMORY_KEY, JSON.stringify(memory));
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

function renderScenarioSelect() {
  scenarioSelect.innerHTML = scenarios
    .map((scenario) => `<option value="${scenario.id}">${scenario.title}</option>`)
    .join("");
}

function baseScenario() {
  return getScenarioById(scenarioSelect.value);
}

function currentObservation() {
  return observationFromParts(Number(dateSlider.value), Number(hourSlider.value));
}

function currentScenario() {
  return materializeScenarioAt(baseScenario().id, currentObservation());
}

function currentOptions() {
  return {
    budgetMin: Number(budgetInput.value),
    powerMode: powerModeSelect.value,
    downlinkPolicy: downlinkSelect.value,
  };
}

function syncTimelineLabels() {
  const scenario = currentScenario();
  const observation = currentObservation();
  timelineLabel.textContent = formatObservationLabel(observation);
  timelineBadge.textContent = `云量 ${formatPercent(scenario.cloudCover)} · 质量 ${formatPercent(
    scenario.radiometricQuality
  )}`;
  timelineCurrentLabel.textContent = formatShortDate(observation);
  dateInput.value = toInputDateValue(observation);
  hourValue.textContent = `${String(observation.getHours()).padStart(2, "0")}:00`;
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

  syncTimelineLabels();
}

function renderMissionBrief(scenario, options) {
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

function renderSceneMap(scenario, result = null) {
  const showAnnotations = overlayToggle.checked;
  const selectedIds = new Set(result?.state.processedRois.map((roi) => roi.id) ?? []);
  const degraded = result?.state.outputProduct === "anomaly-heatmap";

  const overlays = showAnnotations
    ? scenario.rois
        .map((roi) => {
          const classes = ["roi-box"];
          if (selectedIds.has(roi.id)) {
            classes.push("selected");
          }
          if (selectedIds.has(roi.id) && degraded) {
            classes.push("degraded");
          }

          const strength = Math.max(0.18, Math.min(0.72, roi.risk * 0.75));

          return `
            <div
              class="${classes.join(" ")}"
              style="
                left:${roi.box.left}%;
                top:${roi.box.top}%;
                width:${roi.box.width}%;
                height:${roi.box.height}%;
                --roi-strength:${strength};
              "
            >
              <div class="roi-fill"></div>
              <div class="roi-tag">
                <strong>${roi.id}</strong>
                <span>${roi.name}</span>
              </div>
            </div>
          `;
        })
        .join("")
    : "";

  sceneMap.innerHTML = `
    <div class="scene-frame" style="--scene-ratio:${scenario.imagery.aspectRatio}">
      <img class="scene-image" src="${scenario.imagery.src}" alt="${scenario.title} 遥感底图" />
      ${showAnnotations ? `<div class="roi-layer">${overlays}</div>` : ""}
    </div>
    <div class="scene-meta-grid">
      <div class="scene-meta-card">
        <span>当前观测</span>
        <strong>${scenario.observation.label}</strong>
        <p>${scenario.observation.summary}</p>
      </div>
      <div class="scene-meta-card">
        <span>标记模式</span>
        <strong>${showAnnotations ? "已显示标记" : "已关闭标记"}</strong>
        <p>${
          showAnnotations
            ? "当前显示异常区域分布和本次真正进入处理的重点区域。"
            : "当前隐藏所有标记，便于直接对照底图观察异常区域标记是否准确。"
        }</p>
      </div>
    </div>
    ${
      showAnnotations
        ? `
          <div class="legend">
            <span class="legend-item"><span class="swatch" style="background: rgba(255,125,102,0.85)"></span>异常热区</span>
            <span class="legend-item"><span class="swatch" style="background: rgba(87,217,193,0.85)"></span>本次已处理区域</span>
            <span class="legend-item"><span class="swatch" style="background: rgba(255,178,77,0.85)"></span>降级输出</span>
          </div>
        `
        : '<div class="scene-compare-note">标记已隐藏，可直接进行目视比对。</div>'
    }
    <div class="scene-credit">${scenario.imagery.credit}</div>
  `;
}

function buildComparisonExplanation(agentRun, baselineRun) {
  const lines = [];
  lines.push(
    "这里的“时延预算占比”和“功耗占比”表示方案为了完成任务，实际消耗了多少预算比例，它们不是单独越小越好。"
  );

  if (agentRun.result.success && !baselineRun.success) {
    lines.push(
      "如果固定流程在前面就失败了，它的占比看起来可能更低，但那往往只是因为它没有真正完成关键反演步骤；智能体虽然多花了一些资源，却换来了任务成功和有效结果。"
    );
  } else if (
    agentRun.result.metrics.budgetUsage > baselineRun.metrics.budgetUsage ||
    agentRun.result.metrics.powerUsage > baselineRun.metrics.powerUsage
  ) {
    lines.push(
      "当智能体的时延或功耗占比更高时，通常意味着它主动执行了云掩膜修复、重点区域精细反演或结果质量检查等必要步骤。它花掉的是“有价值的额外资源”，不是无效开销。"
    );
  } else {
    lines.push(
      "当智能体的占比更低时，说明它在保证结果质量的前提下，确实通过重点区域优先和流程调整节省了资源。"
    );
  }

  lines.push(
    `因此真正应该综合看的不是单个占比，而是“是否成功完成任务、结果质量是否更高、是否抓住了关键异常区域、最终科学收益是否更强”。本次运行中，智能体方案的结果质量为 ${agentRun.result.metrics.confidence}%，固定流程为 ${baselineRun.metrics.confidence}%。`
  );

  return lines;
}

function renderMetrics(agentRun, baselineRun) {
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
      <strong>科学收益</strong>
      <span class="compare-agent">${agentRun.result.metrics.scienceYield}</span>
      <span class="compare-baseline">${baselineRun.metrics.scienceYield}</span>
    </div>
  `;

  compareExplain.innerHTML = buildComparisonExplanation(agentRun, baselineRun)
    .map(
      (line, index) => `
        <div class="compare-note">
          <span>说明 ${index + 1}</span>
          <p>${line}</p>
        </div>
      `
    )
    .join("");
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

function renderMemory(memory) {
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

function invalidateRunOutputs() {
  const scenario = currentScenario();
  const options = currentOptions();

  latestReport = null;
  renderMissionBrief(scenario, options);
  workflowPlan.innerHTML = '<div class="empty-state">点击“开始演示”后，这里会生成对应的处理流程。</div>';
  executionLog.innerHTML = '<div class="empty-state">运行后，这里会显示逐步处理记录。</div>';
  renderSceneMap(scenario);
  metricsCards.innerHTML = '<div class="empty-state">运行完成后，这里会展示结果指标。</div>';
  compareTable.innerHTML = "";
  compareExplain.innerHTML =
    '<div class="empty-state">运行完成后，这里会补充解释为什么某些指标更高但方案仍然更优。</div>';
  narrativePanel.innerHTML = '<div class="empty-state">运行完成后，这里会生成一段便于汇报的说明文字。</div>';
}

async function runMission() {
  const scenario = currentScenario();
  const options = currentOptions();
  const memory = readMemory();

  renderMissionBrief(scenario, options);
  renderSceneMap(scenario);
  executionLog.innerHTML = '<div class="empty-state">正在执行本次任务，处理记录会按步骤依次出现。</div>';

  const agentRun = runAgentMission(scenario, options, memory);
  const baselineRun = runBaselineMission(scenario, options);

  writeMemory(agentRun.memory);

  renderWorkflowPlan(agentRun.plan, agentRun.result);
  renderPlanNotes(agentRun.plan);
  await renderLogs(agentRun.result.logs);
  renderSceneMap(scenario, agentRun.result);
  renderMetrics(agentRun, baselineRun);
  renderNarrative(buildNarrative(scenario, agentRun, baselineRun));
  renderMemory(agentRun.memory);

  latestReport = buildReportPayload(scenario, options, agentRun, baselineRun);
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

function resetMemory() {
  const cleared = createMemory();
  writeMemory(cleared);
  renderMemory(cleared);
}

function handleScenarioChange() {
  const preset = getOptionPreset(baseScenario());
  budgetInput.value = String(preset.budgetMin);
  powerModeSelect.value = preset.powerMode;
  downlinkSelect.value = preset.downlinkPolicy;
  budgetValue.textContent = `${preset.budgetMin} 分钟`;
  syncTimelineLabels();
  invalidateRunOutputs();
}

function handleDateSliderChange() {
  syncTimelineLabels();
  invalidateRunOutputs();
}

function handleDateInputChange() {
  dateSlider.value = String(dateValueToDayIndex(dateInput.value));
  syncTimelineLabels();
  invalidateRunOutputs();
}

function handleHourChange() {
  syncTimelineLabels();
  invalidateRunOutputs();
}

function handleOptionChange() {
  budgetValue.textContent = `${budgetInput.value} 分钟`;
  invalidateRunOutputs();
}

function handleOverlayToggle() {
  const scenario = currentScenario();

  if (
    latestReport &&
    latestReport.scenario.id === scenario.id &&
    latestReport.scenario.observation.iso === scenario.observation.iso
  ) {
    renderSceneMap(scenario, latestReport.agentResult);
    return;
  }

  renderSceneMap(scenario);
}

function bootstrap() {
  renderScenarioSelect();
  seedControls();
  invalidateRunOutputs();
  renderMemory(readMemory());

  scenarioSelect.addEventListener("change", handleScenarioChange);
  budgetInput.addEventListener("input", handleOptionChange);
  powerModeSelect.addEventListener("change", handleOptionChange);
  downlinkSelect.addEventListener("change", handleOptionChange);
  overlayToggle.addEventListener("change", handleOverlayToggle);
  dateSlider.addEventListener("input", handleDateSliderChange);
  dateInput.addEventListener("change", handleDateInputChange);
  hourSlider.addEventListener("input", handleHourChange);
  runButton.addEventListener("click", runMission);
  exportButton.addEventListener("click", exportReport);
  resetMemoryButton.addEventListener("click", resetMemory);
}

bootstrap();
