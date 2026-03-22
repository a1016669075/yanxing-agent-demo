const TIMELINE_START = new Date(2026, 0, 1, 0, 0, 0, 0);
const DAY_MS = 24 * 60 * 60 * 1000;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function formatDateValue(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export const scenarios = [
  {
    id: "dust-frontier",
    title: "河西沙尘锋面",
    type: "dust",
    mission: "优先锁定沙尘锋面核心区，在 6 分钟内给出可用的反演摘要。",
    sensor: "Himawari AHI / MODIS Terra 协同观测",
    defaultBudgetMin: 6,
    defaultPowerMode: "balanced",
    baseCloudCover: 0.22,
    baseRadiometricQuality: 0.73,
    baseAnomalyDensity: 0.72,
    lowContrast: false,
    bandwidthBudgetMb: 28,
    description:
      "沙尘带范围较大，如果全场景按统一流程处理，很容易把星上时延拖长，适合展示重点区域优先反演。",
    imageryProfile: {
      label: "河西走廊至塔克拉玛干东缘",
      bbox: [86, 35.5, 104, 45.5],
      displayWidth: 1200,
      displayHeight: 800,
      aspectRatio: "3 / 2",
      dailyLayer: "MODIS_Terra_CorrectedReflectance_TrueColor",
      rapidDayLayer: "Himawari_AHI_Band3_Red_Visible_1km",
      rapidNightLayer: "Himawari_AHI_Air_Mass",
      rapidStartUtc: "2026-02-23T02:50:00Z",
    },
    analysisProfile: {
      layer: "MODIS_Terra_Aerosol_Optical_Depth_3km",
      label: "MODIS Terra AOD 3km",
      legendUrl: "https://gibs.earthdata.nasa.gov/legends/MODIS_VIIRS_AOD_H.png",
      percentile: 0.86,
      maxRois: 4,
      minComponentPixels: 72,
      prefix: "沙尘异常簇",
    },
    fallbackRois: [
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
    ],
  },
  {
    id: "urban-plume",
    title: "三角洲城市污染羽流",
    type: "pollution",
    mission: "优先筛查城市污染羽流，只对高风险区域触发 PM 反演，并控制下传负载。",
    sensor: "Himawari AHI / MODIS Terra 协同观测",
    defaultBudgetMin: 7,
    defaultPowerMode: "constrained",
    baseCloudCover: 0.42,
    baseRadiometricQuality: 0.69,
    baseAnomalyDensity: 0.66,
    lowContrast: false,
    bandwidthBudgetMb: 22,
    description:
      "污染异常呈条带扩散，且云污染接近阈值。标准流程容易在质量筛查阶段失败，适合演示插入云掩膜的修复动作。",
    imageryProfile: {
      label: "珠三角及沿海城市群",
      bbox: [110.2, 20.4, 117.6, 25.6],
      displayWidth: 1200,
      displayHeight: 800,
      aspectRatio: "3 / 2",
      dailyLayer: "MODIS_Terra_CorrectedReflectance_TrueColor",
      rapidDayLayer: "Himawari_AHI_Band3_Red_Visible_1km",
      rapidNightLayer: "Himawari_AHI_Air_Mass",
      rapidStartUtc: "2026-02-23T02:50:00Z",
    },
    analysisProfile: {
      layer: "MODIS_Terra_Aerosol_Optical_Depth_3km",
      label: "MODIS Terra AOD 3km",
      legendUrl: "https://gibs.earthdata.nasa.gov/legends/MODIS_VIIRS_AOD_H.png",
      percentile: 0.83,
      maxRois: 4,
      minComponentPixels: 60,
      prefix: "污染异常簇",
    },
    fallbackRois: [
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
    ],
  },
  {
    id: "twilight-edge",
    title: "暮光混合异常",
    type: "mixed",
    mission: "在短预算下判断是否值得做定量产品，必要时主动降级为异常热区简报。",
    sensor: "Himawari AHI / MODIS Terra 协同观测",
    defaultBudgetMin: 5,
    defaultPowerMode: "constrained",
    baseCloudCover: 0.18,
    baseRadiometricQuality: 0.52,
    baseAnomalyDensity: 0.54,
    lowContrast: true,
    bandwidthBudgetMb: 18,
    description:
      "暮光条件导致信噪比偏低，强行做标准反演容易出现低置信输出，适合展示质量降级策略。",
    imageryProfile: {
      label: "华北平原傍晚混合气溶胶场",
      bbox: [112.2, 34.4, 121.2, 41.2],
      displayWidth: 1000,
      displayHeight: 1000,
      aspectRatio: "1 / 1",
      dailyLayer: "MODIS_Terra_CorrectedReflectance_TrueColor",
      rapidDayLayer: "Himawari_AHI_Band3_Red_Visible_1km",
      rapidNightLayer: "Himawari_AHI_Air_Mass",
      rapidStartUtc: "2026-02-23T02:50:00Z",
    },
    analysisProfile: {
      layer: "MODIS_Terra_Aerosol_Optical_Depth_3km",
      label: "MODIS Terra AOD 3km",
      legendUrl: "https://gibs.earthdata.nasa.gov/legends/MODIS_VIIRS_AOD_H.png",
      percentile: 0.81,
      maxRois: 3,
      minComponentPixels: 52,
      prefix: "复合异常簇",
    },
    fallbackRois: [
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
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
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
  return `${date.getFullYear()}年${pad2(date.getMonth() + 1)}月${pad2(date.getDate())}日 ${pad2(
    date.getHours()
  )}:00`;
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
  return clamp(
    Math.round((normalized.getTime() - TIMELINE_START.getTime()) / DAY_MS),
    0,
    getTimelineBounds().totalDays - 1
  );
}

export function materializeScenarioAt(id, observationDate) {
  const base = clone(getScenarioById(id));
  const observation = new Date(observationDate);

  base.cloudCover = base.baseCloudCover;
  base.radiometricQuality = base.baseRadiometricQuality;
  base.anomalyDensity = base.baseAnomalyDensity;
  base.rois = clone(base.fallbackRois);
  base.imagery = {
    src: "",
    aspectRatio: base.imageryProfile.aspectRatio,
    credit: "底图来源：NASA GIBS（加载中）",
    sourceLabel: "准备加载真实遥感底图",
    note: "将根据所选日期与时刻切换官方遥感图像。",
  };
  base.analysis = {
    sourceLabel: base.analysisProfile.label,
    summary: "准备基于官方气溶胶产品提取异常区域。",
    method: "连通域聚类",
    fallbackUsed: false,
  };
  base.observation = {
    iso: observation.toISOString(),
    label: formatObservationLabel(observation),
    dateValue: formatDateValue(observation),
    dayIndex: dateValueToDayIndex(formatDateValue(observation)),
    hour: observation.getHours(),
    summary: "当前将优先尝试加载官方遥感底图与 AOD 产品，再提取异常区域。",
  };

  return base;
}
