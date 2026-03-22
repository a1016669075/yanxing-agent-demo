const TIMELINE_START = new Date(2026, 0, 1, 0, 0, 0, 0);
const DAY_MS = 24 * 60 * 60 * 1000;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function hashText(text) {
  let hash = 0;
  for (const char of text) {
    hash = (hash * 31 + char.charCodeAt(0)) % 1000003;
  }
  return hash;
}

function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function formatDateValue(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function formatHour(value) {
  return `${pad2(value)}:00`;
}

function buildObservationSummary(scenario, illumination, cloudCover, quality) {
  const lightText =
    illumination >= 0.72
      ? "光照条件较好"
      : illumination >= 0.38
      ? "光照条件中等"
      : "光照偏弱，需谨慎解释结果";

  const cloudText =
    cloudCover >= 0.45
      ? "云干扰明显"
      : cloudCover >= 0.28
      ? "云量中等"
      : "云干扰较弱";

  const qualityText =
    quality >= 0.72
      ? "适合做较完整的定量处理"
      : quality >= 0.58
      ? "可在约束下执行重点反演"
      : "更适合采用降级或快速流程";

  return `${lightText}，${cloudText}，当前更${qualityText}。`;
}

function moveBox(box, dx, dy, scale = 1) {
  const width = clamp(round(box.width * scale, 2), 10, 34);
  const height = clamp(round(box.height * scale, 2), 10, 28);
  const left = clamp(round(box.left + dx, 2), 1, 99 - width);
  const top = clamp(round(box.top + dy, 2), 1, 99 - height);

  return {
    left,
    top,
    width,
    height,
  };
}

export const scenarios = [
  {
    id: "dust-frontier",
    title: "河西沙尘锋面",
    type: "dust",
    mission: "优先锁定沙尘锋面核心区，在 6 分钟内给出可用的反演摘要。",
    sensor: "静止轨道光学载荷",
    defaultBudgetMin: 6,
    defaultPowerMode: "balanced",
    cloudCover: 0.22,
    radiometricQuality: 0.73,
    lowContrast: false,
    anomalyDensity: 0.72,
    bandwidthBudgetMb: 28,
    imagery: {
      src: "./assets/images/dust-storm.jpg",
      aspectRatio: "1786 / 1191",
      credit: "底图来源：NASA Earth Observatory",
    },
    description:
      "沙尘带范围较大，如果全场景按统一流程处理，很容易把星上时延拖长，适合展示重点区域优先反演。",
    rois: [
      {
        id: "R1",
        name: "锋面核心区",
        risk: 0.95,
        signal: 0.87,
        cloud: 0.12,
        area: 180,
        box: { left: 22, top: 56, width: 28, height: 20 },
      },
      {
        id: "R2",
        name: "东缘扩散区",
        risk: 0.76,
        signal: 0.72,
        cloud: 0.18,
        area: 150,
        box: { left: 45, top: 43, width: 18, height: 16 },
      },
      {
        id: "R3",
        name: "尾迹稀疏区",
        risk: 0.56,
        signal: 0.51,
        cloud: 0.09,
        area: 110,
        box: { left: 57, top: 36, width: 12, height: 12 },
      },
      {
        id: "R4",
        name: "北侧带状区",
        risk: 0.67,
        signal: 0.61,
        cloud: 0.16,
        area: 140,
        box: { left: 66, top: 29, width: 16, height: 14 },
      },
    ],
  },
  {
    id: "urban-plume",
    title: "三角洲城市污染羽流",
    type: "pollution",
    mission: "优先筛查城市污染羽流，只对高风险区域触发 PM 反演，并控制下传负载。",
    sensor: "静止轨道光学载荷",
    defaultBudgetMin: 7,
    defaultPowerMode: "constrained",
    cloudCover: 0.42,
    radiometricQuality: 0.69,
    lowContrast: false,
    anomalyDensity: 0.66,
    bandwidthBudgetMb: 22,
    imagery: {
      src: "./assets/images/urban-plume.jpg",
      aspectRatio: "3 / 2",
      credit: "底图来源：NASA Earth Observatory",
    },
    description:
      "污染异常呈条带扩散，且云污染接近阈值。标准流程容易在质量筛查阶段失败，适合演示插入云掩膜的修复动作。",
    rois: [
      {
        id: "R1",
        name: "西侧污染带",
        risk: 0.91,
        signal: 0.79,
        cloud: 0.39,
        area: 120,
        box: { left: 15, top: 20, width: 24, height: 20 },
      },
      {
        id: "R2",
        name: "中部主羽流",
        risk: 0.88,
        signal: 0.74,
        cloud: 0.33,
        area: 155,
        box: { left: 39, top: 34, width: 23, height: 20 },
      },
      {
        id: "R3",
        name: "东侧扩散区",
        risk: 0.63,
        signal: 0.58,
        cloud: 0.28,
        area: 105,
        box: { left: 60, top: 42, width: 18, height: 18 },
      },
      {
        id: "R4",
        name: "南向尾迹区",
        risk: 0.58,
        signal: 0.49,
        cloud: 0.43,
        area: 95,
        box: { left: 63, top: 59, width: 18, height: 17 },
      },
    ],
  },
  {
    id: "twilight-edge",
    title: "暮光混合异常",
    type: "mixed",
    mission: "在短预算下判断是否值得做定量产品，必要时主动降级为异常热区简报。",
    sensor: "低轨多光谱载荷",
    defaultBudgetMin: 5,
    defaultPowerMode: "constrained",
    cloudCover: 0.18,
    radiometricQuality: 0.52,
    lowContrast: true,
    anomalyDensity: 0.54,
    bandwidthBudgetMb: 18,
    imagery: {
      src: "./assets/images/twilight-haze.jpg",
      aspectRatio: "1 / 1",
      credit: "底图来源：NASA Earth Observatory",
    },
    description:
      "暮光条件导致信噪比偏低，强行做标准反演容易出现低置信输出，适合展示质量降级策略。",
    rois: [
      {
        id: "R1",
        name: "混合核心区",
        risk: 0.82,
        signal: 0.57,
        cloud: 0.15,
        area: 98,
        box: { left: 39, top: 31, width: 18, height: 18 },
      },
      {
        id: "R2",
        name: "东侧扩散区",
        risk: 0.64,
        signal: 0.48,
        cloud: 0.11,
        area: 88,
        box: { left: 60, top: 45, width: 18, height: 16 },
      },
      {
        id: "R3",
        name: "南部边缘区",
        risk: 0.53,
        signal: 0.44,
        cloud: 0.18,
        area: 72,
        box: { left: 43, top: 60, width: 15, height: 14 },
      },
    ],
  },
];

export function getScenarioById(id) {
  return scenarios.find((scenario) => scenario.id === id) ?? scenarios[0];
}

export function getTimelineBounds() {
  const end = startOfToday();
  const totalDays = Math.max(1, Math.floor((end.getTime() - TIMELINE_START.getTime()) / DAY_MS) + 1);

  return {
    start: new Date(TIMELINE_START),
    end,
    totalDays,
  };
}

export function getDefaultObservation() {
  const timeline = getTimelineBounds();
  const now = new Date();

  return {
    dayIndex: timeline.totalDays - 1,
    hour: now.getHours(),
  };
}

export function observationFromParts(dayIndex, hour) {
  const timeline = getTimelineBounds();
  const safeDayIndex = clamp(Number(dayIndex) || 0, 0, timeline.totalDays - 1);
  const safeHour = clamp(Number(hour) || 0, 0, 23);
  const observation = new Date(TIMELINE_START.getTime() + safeDayIndex * DAY_MS);

  observation.setHours(safeHour, 0, 0, 0);
  return observation;
}

export function formatObservationLabel(date) {
  return `${date.getFullYear()}年${pad2(date.getMonth() + 1)}月${pad2(date.getDate())}日 ${formatHour(
    date.getHours()
  )}`;
}

export function toInputDateValue(date) {
  return formatDateValue(date);
}

export function dateValueToDayIndex(value) {
  const raw = new Date(`${value}T00:00:00`);
  if (Number.isNaN(raw.getTime())) {
    return getDefaultObservation().dayIndex;
  }
  const normalized = new Date(raw.getFullYear(), raw.getMonth(), raw.getDate(), 0, 0, 0, 0);
  return clamp(Math.round((normalized.getTime() - TIMELINE_START.getTime()) / DAY_MS), 0, getTimelineBounds().totalDays - 1);
}

export function materializeScenarioAt(id, observationDate) {
  const baseScenario = getScenarioById(id);
  const scenario = clone(baseScenario);
  const observation = new Date(observationDate);
  const dayIndex = dateValueToDayIndex(formatDateValue(observation));
  const hour = observation.getHours();
  const sceneSeed = hashText(baseScenario.id);
  const dailyPhase = dayIndex / 6 + sceneSeed * 0.0008;
  const hourlyPhase = (hour / 24) * Math.PI * 2;
  const illumination = clamp(Math.sin(((hour - 6) / 12) * Math.PI), 0, 1);
  const dynamicCloud =
    0.07 * Math.sin(dailyPhase) +
    0.04 * Math.cos(hourlyPhase + sceneSeed * 0.0004) +
    (baseScenario.type === "pollution" ? 0.02 : 0);
  const cloudCover = clamp(baseScenario.cloudCover + dynamicCloud, 0.05, 0.72);
  const qualityShift =
    (illumination - 0.48) * (baseScenario.lowContrast ? 0.22 : 0.13) -
    Math.max(0, cloudCover - baseScenario.cloudCover) * 0.24 +
    0.03 * Math.sin(dailyPhase * 0.7);
  const radiometricQuality = clamp(baseScenario.radiometricQuality + qualityShift, 0.38, 0.94);
  const anomalyDensity = clamp(
    baseScenario.anomalyDensity +
      0.07 * Math.sin(dailyPhase * 0.9 + hourlyPhase * 0.35) +
      (baseScenario.type === "dust" ? 0.03 * Math.cos(dailyPhase * 0.55) : 0),
    0.35,
    0.95
  );

  scenario.cloudCover = round(cloudCover);
  scenario.radiometricQuality = round(radiometricQuality);
  scenario.anomalyDensity = round(anomalyDensity);

  scenario.rois = baseScenario.rois.map((roi, index) => {
    const roiPhase = dailyPhase + index * 0.85 + hourlyPhase * 0.55;
    const driftX = Math.sin(roiPhase * 1.25) * 1.8;
    const driftY = Math.cos(roiPhase * 1.05) * 1.5;
    const scale = 1 + Math.sin(roiPhase * 0.9) * 0.06;

    return {
      ...clone(roi),
      risk: round(clamp(roi.risk + 0.08 * Math.sin(roiPhase) + (anomalyDensity - baseScenario.anomalyDensity) * 0.35, 0.35, 0.99)),
      signal: round(clamp(roi.signal + 0.06 * Math.cos(roiPhase * 1.1) + (illumination - 0.5) * 0.08, 0.3, 0.96)),
      cloud: round(clamp(roi.cloud + 0.05 * Math.sin(roiPhase * 0.8 + 0.7) + (cloudCover - baseScenario.cloudCover) * 0.6, 0.02, 0.75)),
      box: moveBox(roi.box, driftX, driftY, scale),
    };
  });

  scenario.observation = {
    iso: observation.toISOString(),
    label: formatObservationLabel(observation),
    dateValue: formatDateValue(observation),
    dayIndex,
    hour,
    illumination: round(illumination),
    summary: buildObservationSummary(baseScenario, illumination, scenario.cloudCover, scenario.radiometricQuality),
  };

  return scenario;
}
