import { materializeScenarioAt } from "./scenarios.mjs";

export const WORLD_BBOX = [-180, -90, 180, 90];

const MIN_LON_SPAN = 2;
const MIN_LAT_SPAN = 1.5;

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

function formatSigned(value, positive, negative) {
  const direction = value >= 0 ? positive : negative;
  return `${Math.abs(round(value, 1))}°${direction}`;
}

export function normalizeFocusBbox(bbox, { minLonSpan = MIN_LON_SPAN, minLatSpan = MIN_LAT_SPAN } = {}) {
  const raw = Array.isArray(bbox) ? bbox.map((value) => Number(value) || 0) : WORLD_BBOX;
  let west = clamp(Math.min(raw[0], raw[2]), WORLD_BBOX[0], WORLD_BBOX[2]);
  let east = clamp(Math.max(raw[0], raw[2]), WORLD_BBOX[0], WORLD_BBOX[2]);
  let south = clamp(Math.min(raw[1], raw[3]), WORLD_BBOX[1], WORLD_BBOX[3]);
  let north = clamp(Math.max(raw[1], raw[3]), WORLD_BBOX[1], WORLD_BBOX[3]);

  const lonCenter = (west + east) / 2;
  const latCenter = (south + north) / 2;
  const lonSpan = Math.max(east - west, minLonSpan);
  const latSpan = Math.max(north - south, minLatSpan);

  west = clamp(lonCenter - lonSpan / 2, WORLD_BBOX[0], WORLD_BBOX[2] - minLonSpan);
  east = clamp(west + lonSpan, WORLD_BBOX[0] + minLonSpan, WORLD_BBOX[2]);
  south = clamp(latCenter - latSpan / 2, WORLD_BBOX[1], WORLD_BBOX[3] - minLatSpan);
  north = clamp(south + latSpan, WORLD_BBOX[1] + minLatSpan, WORLD_BBOX[3]);

  return [round(west), round(south), round(east), round(north)];
}

export function percentRectToBbox(rect) {
  const left = clamp(Number(rect?.left) || 0, 0, 100);
  const top = clamp(Number(rect?.top) || 0, 0, 100);
  const width = clamp(Number(rect?.width) || 0, 0.1, 100 - left);
  const height = clamp(Number(rect?.height) || 0, 0.1, 100 - top);

  const west = WORLD_BBOX[0] + (left / 100) * 360;
  const east = WORLD_BBOX[0] + ((left + width) / 100) * 360;
  const north = WORLD_BBOX[3] - (top / 100) * 180;
  const south = WORLD_BBOX[3] - ((top + height) / 100) * 180;

  return normalizeFocusBbox([west, south, east, north]);
}

export function bboxToPercentRect(bbox) {
  const [west, south, east, north] = normalizeFocusBbox(bbox);

  return {
    left: round(((west - WORLD_BBOX[0]) / 360) * 100),
    top: round(((WORLD_BBOX[3] - north) / 180) * 100),
    width: round(((east - west) / 360) * 100),
    height: round(((north - south) / 180) * 100),
  };
}

export function describeFocusBbox(bbox) {
  const normalized = normalizeFocusBbox(bbox);
  const [west, south, east, north] = normalized;
  const lonSpan = round(east - west, 2);
  const latSpan = round(north - south, 2);
  const centerLon = round((west + east) / 2, 2);
  const centerLat = round((south + north) / 2, 2);

  let scaleKey = "local";
  let scaleLabel = "局地尺度";
  if (lonSpan >= 120 || latSpan >= 60) {
    scaleKey = "global";
    scaleLabel = "全球/跨洲尺度";
  } else if (lonSpan >= 60 || latSpan >= 30) {
    scaleKey = "continental";
    scaleLabel = "洲际尺度";
  } else if (lonSpan >= 20 || latSpan >= 10) {
    scaleKey = "regional";
    scaleLabel = "区域尺度";
  }

  return {
    bbox: normalized,
    west,
    south,
    east,
    north,
    lonSpan,
    latSpan,
    centerLon,
    centerLat,
    scaleKey,
    scaleLabel,
    label: `${formatSigned(centerLat, "N", "S")} / ${formatSigned(centerLon, "E", "W")}`,
  };
}

export function adaptiveFocusProfile(bbox) {
  const summary = describeFocusBbox(bbox);
  const aspect = clamp(summary.lonSpan / Math.max(summary.latSpan, 1), 0.9, 2.2);

  if (summary.scaleKey === "global") {
    const displayWidth = 560;
    return {
      ...summary,
      displayWidth,
      displayHeight: clamp(Math.round(displayWidth / aspect), 300, 520),
      analysisWidth: 220,
      sensorLabel: "VIIRS / MODIS 全球背景链路",
      strategyText: "先用低分辨率全球背景快速筛查，再决定是否下钻到区域级处理。",
      maxRois: 3,
      minComponentPixels: 48,
      bandwidthBudgetMb: 34,
      aspectRatio: `${round(aspect, 2)} / 1`,
    };
  }

  if (summary.scaleKey === "continental") {
    const displayWidth = 680;
    return {
      ...summary,
      displayWidth,
      displayHeight: clamp(Math.round(displayWidth / aspect), 340, 560),
      analysisWidth: 280,
      sensorLabel: "VIIRS / MODIS 区域筛查链路",
      strategyText: "优先用日尺度大范围观测做异常筛查，只把明显热点送入后续精细流程。",
      maxRois: 4,
      minComponentPixels: 56,
      bandwidthBudgetMb: 30,
      aspectRatio: `${round(aspect, 2)} / 1`,
    };
  }

  if (summary.scaleKey === "regional") {
    const displayWidth = 780;
    return {
      ...summary,
      displayWidth,
      displayHeight: clamp(Math.round(displayWidth / aspect), 360, 600),
      analysisWidth: 320,
      sensorLabel: "VIIRS 背景 + Sentinel-2 / Landsat 机会式补充",
      strategyText: "先用中低分辨率底图确定异常背景，再为重点区域切换更精细的数据模型。",
      maxRois: 4,
      minComponentPixels: 62,
      bandwidthBudgetMb: 26,
      aspectRatio: `${round(aspect, 2)} / 1`,
    };
  }

  const displayWidth = 920;
  return {
    ...summary,
    displayWidth,
    displayHeight: clamp(Math.round(displayWidth / aspect), 420, 640),
    analysisWidth: 360,
    sensorLabel: "Sentinel-2 / Landsat 精细链路优先，VIIRS 提供背景参考",
    strategyText: "当前区域较小，智能体可以直接投入更高分辨率的数据与模型以提升定位精度。",
    maxRois: 5,
    minComponentPixels: 70,
    bandwidthBudgetMb: 22,
    aspectRatio: `${round(aspect, 2)} / 1`,
  };
}

function taskRegionNames(taskType) {
  if (taskType === "dust") {
    return ["核心异常区", "扩散边缘区", "背景参考区"];
  }
  if (taskType === "pollution") {
    return ["主羽流区", "次级扩散区", "背景对照区"];
  }
  return ["混合核心区", "邻近扩散区", "背景参考区"];
}

function buildFocusFallbackRois(taskType, scaleKey) {
  const names = taskRegionNames(taskType);
  const presets = {
    global: [
      { left: 18, top: 18, width: 26, height: 20 },
      { left: 46, top: 34, width: 28, height: 22 },
      { left: 24, top: 60, width: 24, height: 18 },
    ],
    continental: [
      { left: 16, top: 16, width: 24, height: 18 },
      { left: 42, top: 34, width: 26, height: 20 },
      { left: 18, top: 60, width: 22, height: 18 },
    ],
    regional: [
      { left: 14, top: 18, width: 22, height: 18 },
      { left: 40, top: 36, width: 24, height: 20 },
      { left: 18, top: 62, width: 20, height: 16 },
    ],
    local: [
      { left: 18, top: 22, width: 18, height: 18 },
      { left: 42, top: 40, width: 22, height: 20 },
      { left: 20, top: 64, width: 18, height: 14 },
    ],
  };

  return (presets[scaleKey] ?? presets.regional).map((box, index) => ({
    id: `R${index + 1}`,
    name: names[index] ?? `候选区${index + 1}`,
    risk: round(0.86 - index * 0.12, 2),
    signal: round(0.74 - index * 0.1, 2),
    cloud: round(0.18 + index * 0.04, 2),
    area: 120 - index * 16,
    box,
  }));
}

export function buildFocusScenario(baseTemplate, observationDate, selection) {
  const scenario = materializeScenarioAt(baseTemplate.id, observationDate);
  const bbox = normalizeFocusBbox(selection?.bbox);
  const profile = adaptiveFocusProfile(bbox);
  const selectionLabel = selection?.label?.trim() || `全球选区 ${profile.label}`;

  scenario.id = `${baseTemplate.id}-global-focus`;
  scenario.baseScenarioId = baseTemplate.id;
  scenario.title = `${baseTemplate.title} · 全球选区`;
  scenario.mission = `围绕用户从全球底图中选取的区域，${baseTemplate.mission}`;
  scenario.sensor = profile.sensorLabel;
  scenario.bandwidthBudgetMb = profile.bandwidthBudgetMb;
  scenario.description = `当前区域来自全球总览框选，跨度约 ${profile.lonSpan}° × ${profile.latSpan}°。智能体会根据区域尺度动态决定数据分辨率和异常处理策略。`;
  scenario.supportsLocalModel = false;
  scenario.imageryProfile = {
    ...clone(scenario.imageryProfile),
    label: selectionLabel,
    bbox,
    displayWidth: profile.displayWidth,
    displayHeight: profile.displayHeight,
    aspectRatio: profile.aspectRatio,
  };
  scenario.analysisProfile = {
    ...clone(scenario.analysisProfile),
    maxRois: profile.maxRois,
    minComponentPixels: profile.minComponentPixels,
    sampleWidth: profile.analysisWidth,
  };
  scenario.fallbackRois = buildFocusFallbackRois(baseTemplate.type, profile.scaleKey);
  scenario.rois = clone(scenario.fallbackRois);
  scenario.focusSelection = {
    bbox,
    label: selectionLabel,
    cacheKey: bbox.map((value) => value.toFixed(2)).join(","),
    scaleKey: profile.scaleKey,
    scaleLabel: profile.scaleLabel,
    strategyText: profile.strategyText,
    centerLabel: profile.label,
    lonSpan: profile.lonSpan,
    latSpan: profile.latSpan,
  };
  scenario.observation.summary = `当前正在处理来自全球总览的自定义区域：${selectionLabel}。${profile.strategyText}`;
  return scenario;
}
