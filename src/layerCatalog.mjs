const VIIRS_NOAA20_DUST_TYPE_SUPPORT = {
  id: "viirs-noaa20-aerosol-type-deep-blue",
  layer: "VIIRS_NOAA20_Aerosol_Type_Deep_Blue_Best_Estimate",
  label: "VIIRS NOAA-20 Deep Blue Aerosol Type",
  sensor: "VIIRS",
  platform: "NOAA-20",
  supportKind: "categorical-dust",
  colorMapId: "VIIRS_Aerosol_Type_Deep_Blue",
  priority: 1,
  weight: 1,
};

const VIIRS_SNPP_DUST_TYPE_SUPPORT = {
  id: "viirs-snpp-aerosol-type-deep-blue",
  layer: "VIIRS_SNPP_Aerosol_Type_Deep_Blue_Best_Estimate",
  label: "VIIRS SNPP Deep Blue Aerosol Type",
  sensor: "VIIRS",
  platform: "SNPP",
  supportKind: "categorical-dust",
  colorMapId: "VIIRS_Aerosol_Type_Deep_Blue",
  priority: 2,
  weight: 1,
};

const AIRS_DUST_SCORE_SUPPORT = {
  id: "airs-aqua-dust-score-day",
  layer: "AIRS_L2_Dust_Score_Day",
  label: "AIRS Aqua Dust Score Day",
  sensor: "AIRS",
  platform: "Aqua",
  supportKind: "continuous-dust-score",
  colorMapId: "AIRS_Dust_Score",
  priority: 3,
  weight: 0.72,
};

const MODIS_TERRA_WATER_SCREENING = {
  id: "modis-terra-land-water-mask",
  layer: "MODIS_Terra_L3_Land_Water_Mask",
  label: "MODIS Terra Land/Water Mask",
  sensor: "MODIS",
  platform: "Terra",
  screeningKind: "water-mask",
  colorMapId: "MODIS_Land_Water_Mask",
  priority: 1,
};

export const layerCatalog = {
  version: "2026.03.26-local",
  services: {
    gibsWmsUrl: "https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi",
  },
  imageryLayers: [
    {
      id: "viirs-noaa21-truecolor",
      layer: "VIIRS_NOAA21_CorrectedReflectance_TrueColor",
      label: "VIIRS NOAA-21 真彩色",
      sensor: "VIIRS",
      platform: "NOAA-21",
      nominalObservationHour: 13.5,
      observationTimingNote: "名义下午轨道，当前展示链按约 13:30 本地太阳时近似。",
      preferredCloudMaskProductId: "CLDMSK_L2_VIIRS_NOAA21",
      provider: "NASA GIBS",
      cadence: "daily",
      cadenceLabel: "官方日尺度连续更新底图",
      renderMode: "true-color",
      defaultPriority: 1,
      coverage: "全球",
      description: "当前优先使用的日尺度真彩色底图，适合展示大范围大气异常背景。",
    },
    {
      id: "viirs-noaa20-truecolor",
      layer: "VIIRS_NOAA20_CorrectedReflectance_TrueColor",
      label: "VIIRS NOAA-20 真彩色",
      sensor: "VIIRS",
      platform: "NOAA-20",
      nominalObservationHour: 13.5,
      observationTimingNote: "名义下午轨道，当前展示链按约 13:30 本地太阳时近似。",
      preferredCloudMaskProductId: "CLDMSK_L2_VIIRS_NOAA20",
      provider: "NASA GIBS",
      cadence: "daily",
      cadenceLabel: "官方日尺度连续更新底图",
      renderMode: "true-color",
      defaultPriority: 2,
      coverage: "全球",
      description: "当 NOAA-21 不可用时的首选回退层。",
    },
    {
      id: "viirs-snpp-truecolor",
      layer: "VIIRS_SNPP_CorrectedReflectance_TrueColor",
      label: "VIIRS SNPP 真彩色",
      sensor: "VIIRS",
      platform: "SNPP",
      nominalObservationHour: 13.5,
      observationTimingNote: "名义下午轨道，当前展示链按约 13:30 本地太阳时近似。",
      preferredCloudMaskProductId: "CLDMSK_L2_VIIRS_SNPP",
      provider: "NASA GIBS",
      cadence: "daily",
      cadenceLabel: "官方日尺度连续更新底图",
      renderMode: "true-color",
      defaultPriority: 3,
      coverage: "全球",
      description: "用于补齐 VIIRS 历史覆盖的回退真彩色层。",
    },
    {
      id: "modis-terra-truecolor",
      layer: "MODIS_Terra_CorrectedReflectance_TrueColor",
      label: "MODIS Terra 真彩色",
      sensor: "MODIS",
      platform: "Terra",
      nominalObservationHour: 9.0,
      observationTimingNote: "Terra 已漂移，当前按约 09:00 本地太阳时近似，而不是历史 10:30。",
      preferredCloudMaskProductId: "MOD35_L2",
      provider: "NASA GIBS",
      cadence: "daily",
      cadenceLabel: "官方日尺度连续更新底图",
      renderMode: "true-color",
      spatialResolutionMeters: 250,
      resolutionLabel: "250m",
      defaultPriority: 4,
      coverage: "全球",
      description: "当前链路中的最终回退底图，用于保证日期覆盖。",
    },
    {
      id: "modis-aqua-truecolor",
      layer: "MODIS_Aqua_CorrectedReflectance_TrueColor",
      label: "MODIS Aqua True Color",
      sensor: "MODIS",
      platform: "Aqua",
      nominalObservationHour: 13.5,
      preferredCloudMaskProductId: "MYD35_L2",
      provider: "NASA GIBS",
      cadence: "daily",
      cadenceLabel: "official daily true-color basemap",
      renderMode: "true-color",
      spatialResolutionMeters: 250,
      resolutionLabel: "250m",
      defaultPriority: 5,
      coverage: "global",
      description: "Same-platform true-color basemap for the strict MODIS Aqua haze chain.",
    },
  ],
  analysisLayers: [
    {
      id: "omi-aerosol-optical-depth",
      layer: "OMI_Aerosol_Optical_Depth",
      label: "OMI Aura AOD",
      sensor: "OMI",
      platform: "Aura",
      nominalObservationHour: 13.75,
      provider: "NASA GIBS",
      cadence: "daily",
      cadenceLabel: "官方日尺度全球气溶胶产品",
      task: "大气异常提取",
      legendUrl: "https://gibs.earthdata.nasa.gov/legends/OMI_Aerosol_Optical_Depth_H.png",
      defaultMethodLabel: "大尺度 AOD 筛查 + 连通域聚类",
      description: "用于全球或跨洲雾霾/气溶胶任务的粗尺度 AOD 分析层，优先保证大范围覆盖。",
    },
    {
      id: "airs-aqua-dust-score-day-analysis",
      layer: "AIRS_L2_Dust_Score_Day",
      label: "AIRS Aqua Dust Score Day",
      sensor: "AIRS",
      platform: "Aqua",
      nominalObservationHour: 13.5,
      provider: "NASA GIBS",
      cadence: "daily",
      cadenceLabel: "官方日尺度沙尘评分产品",
      task: "沙尘识别",
      legendUrl: "https://gibs.earthdata.nasa.gov/legends/AIRS_Dust_Score_H.png",
      dustModelLabel: "AIRS Dust Score 沙尘识别",
      dustModelMethodLabel: "AIRS dust score 阈值 + 连通域聚类",
      strictSatelliteBinding: true,
      strictImageryLayerId: "modis-aqua-truecolor",
      strictCloudMaskProductId: "MYD35_L2",
      dustModelId: "official-airs-aqua-dust-score",
      dustSupportLayers: [AIRS_DUST_SCORE_SUPPORT],
      dustScreeningLayers: [],
      defaultMethodLabel: "AIRS dust score 阈值 + 连通域聚类",
      description: "用于全球或跨洲尺度沙尘任务的官方 AIRS 沙尘评分层，优先保证大范围沙尘先验覆盖。",
    },
    {
      id: "viirs-snpp-deep-blue-dust-aot",
      layer: "VIIRS_SNPP_AOT_Deep_Blue_Best_Estimate",
      label: "VIIRS SNPP Deep Blue AOT",
      sensor: "VIIRS",
      platform: "SNPP",
      nominalObservationHour: 13.5,
      preferredCloudMaskProductId: "CLDMSK_L2_VIIRS_SNPP",
      provider: "NASA GIBS",
      cadence: "daily",
      cadenceLabel: "官方日尺度 Deep Blue 气溶胶产品",
      task: "沙尘识别",
      legendUrl: "https://gibs.earthdata.nasa.gov/legends/MODIS_VIIRS_AOD_H.png",
      cloudGuideLayerDay: "VIIRS_SNPP_Clear_Sky_Confidence_Day",
      cloudGuideLayerNight: "VIIRS_SNPP_Clear_Sky_Confidence_Night",
      cloudGuideSelectionMode: "day-only",
      cloudGuideColorMapId: "VIIRS_Clear_Sky_Confidence",
      cloudGuideValueKind: "clear-sky-confidence",
      dustModelLabel: "VIIRS SNPP Deep Blue 沙尘识别",
      dustModelMethodLabel: "Deep Blue AOT + Aerosol Type dust 先验",
      strictSatelliteBinding: true,
      strictImageryLayerId: "viirs-snpp-truecolor",
      strictCloudMaskProductId: "CLDMSK_L2_VIIRS_SNPP",
      dustModelId: "official-viirs-snpp-deep-blue-dust",
      dustSupportLayers: [VIIRS_SNPP_DUST_TYPE_SUPPORT],
      dustScreeningLayers: [],
      defaultMethodLabel: "Deep Blue AOT 阈值 + 沙尘类型先验",
      description: "用于洲际尺度沙尘任务的 VIIRS SNPP Deep Blue 分析层，并调用同平台 Aerosol Type dust 类别作为识别先验。",
    },
    {
      id: "viirs-noaa20-deep-blue-dust-aot",
      layer: "VIIRS_NOAA20_AOT_Deep_Blue_Best_Estimate",
      label: "VIIRS NOAA-20 Deep Blue AOT",
      sensor: "VIIRS",
      platform: "NOAA-20",
      nominalObservationHour: 13.5,
      preferredCloudMaskProductId: "CLDMSK_L2_VIIRS_NOAA20",
      provider: "NASA GIBS",
      cadence: "daily",
      cadenceLabel: "官方日尺度 Deep Blue 气溶胶产品",
      task: "沙尘识别",
      legendUrl: "https://gibs.earthdata.nasa.gov/legends/MODIS_VIIRS_AOD_H.png",
      cloudGuideLayerDay: "VIIRS_NOAA20_Clear_Sky_Confidence_Day",
      cloudGuideLayerNight: "VIIRS_NOAA20_Clear_Sky_Confidence_Night",
      cloudGuideSelectionMode: "day-only",
      cloudGuideColorMapId: "VIIRS_Clear_Sky_Confidence",
      cloudGuideValueKind: "clear-sky-confidence",
      dustModelLabel: "VIIRS NOAA-20 Deep Blue 沙尘识别",
      dustModelMethodLabel: "Deep Blue AOT + Aerosol Type dust 先验",
      strictSatelliteBinding: true,
      strictImageryLayerId: "viirs-noaa20-truecolor",
      strictCloudMaskProductId: "CLDMSK_L2_VIIRS_NOAA20",
      dustModelId: "official-viirs-noaa20-deep-blue-dust",
      dustSupportLayers: [VIIRS_NOAA20_DUST_TYPE_SUPPORT],
      dustScreeningLayers: [],
      defaultMethodLabel: "Deep Blue AOT 阈值 + 沙尘类型先验",
      description: "用于区域尺度沙尘任务的 VIIRS NOAA-20 Deep Blue 分析层，并调用 NOAA-20 Aerosol Type dust 类别作为识别先验。",
    },
    {
      id: "modis-terra-deep-blue-dust-aod",
      layer: "MODIS_Terra_AOD_Deep_Blue_Combined",
      label: "MODIS Terra Deep Blue AOD",
      sensor: "MODIS",
      platform: "Terra",
      nominalObservationHour: 9.0,
      observationTimingNote: "Terra 已漂移，当前按约 09:00 本地太阳时近似，而不是历史 10:30。",
      preferredCloudMaskProductId: "MOD35_L2",
      provider: "NASA GIBS",
      cadence: "daily",
      cadenceLabel: "官方日尺度 Deep Blue 气溶胶产品",
      task: "沙尘识别",
      legendUrl: "https://gibs.earthdata.nasa.gov/legends/MODIS_VIIRS_AOD_H.png",
      cloudGuideLayerDay: "MODIS_Terra_Cloud_Fraction_Day",
      cloudGuideLayerNight: "MODIS_Terra_Cloud_Fraction_Night",
      cloudGuideSelectionMode: "day-only",
      cloudGuideColorMapId: "MODIS_Cloud_Fraction",
      cloudGuideValueKind: "cloud-fraction",
      strictSatelliteBinding: true,
      strictImageryLayerId: "modis-terra-truecolor",
      strictCloudMaskProductId: "MOD35_L2",
      dustModelId: "official-modis-terra-deep-blue-dust",
      dustModelLabel: "MODIS Terra Deep Blue 沙尘识别",
      dustModelMethodLabel: "MODIS Terra Deep Blue AOD + MOD35 + connected components",
      dustSupportLayers: [],
      dustScreeningLayers: [MODIS_TERRA_WATER_SCREENING],
      defaultMethodLabel: "Deep Blue AOD 阈值 + 沙尘先验",
      description: "用于局地或小区域沙尘任务的 MODIS Terra Deep Blue 分析层，并以 AIRS Dust Score 与 VIIRS Aerosol Type 做保守校验。",
    },
    {
      id: "viirs-snpp-aod-dark-target-land-ocean",
      layer: "VIIRS_SNPP_AOD_Dark_Target_Land_Ocean",
      label: "VIIRS SNPP AOD Dark Target",
      sensor: "VIIRS",
      platform: "SNPP",
      nominalObservationHour: 13.5,
      preferredCloudMaskProductId: "CLDMSK_L2_VIIRS_SNPP",
      provider: "NASA GIBS",
      cadence: "daily",
      cadenceLabel: "官方日尺度气溶胶产品",
      task: "大气异常提取",
      legendUrl: "https://gibs.earthdata.nasa.gov/legends/MODIS_VIIRS_AOD_H.png",
      cloudGuideLayerDay: "VIIRS_SNPP_Clear_Sky_Confidence_Day",
      cloudGuideLayerNight: "VIIRS_SNPP_Clear_Sky_Confidence_Night",
      cloudGuideSelectionMode: "day-only",
      cloudGuideColorMapId: "VIIRS_Clear_Sky_Confidence",
      cloudGuideValueKind: "clear-sky-confidence",
      defaultMethodLabel: "VIIRS AOD 阈值 + 连通域聚类",
      description: "用于洲际尺度雾霾/气溶胶任务的 VIIRS AOD 分析层，兼顾覆盖和平台连续性。",
    },
    {
      id: "viirs-noaa20-aod-dark-target-land-ocean",
      layer: "VIIRS_NOAA20_AOD_Dark_Target_Land_Ocean",
      label: "VIIRS NOAA-20 AOD Dark Target",
      sensor: "VIIRS",
      platform: "NOAA-20",
      nominalObservationHour: 13.5,
      preferredCloudMaskProductId: "CLDMSK_L2_VIIRS_NOAA20",
      provider: "NASA GIBS",
      cadence: "daily",
      cadenceLabel: "官方日尺度气溶胶产品",
      task: "大气异常提取",
      legendUrl: "https://gibs.earthdata.nasa.gov/legends/MODIS_VIIRS_AOD_H.png",
      cloudGuideLayerDay: "VIIRS_NOAA20_Clear_Sky_Confidence_Day",
      cloudGuideLayerNight: "VIIRS_NOAA20_Clear_Sky_Confidence_Night",
      cloudGuideSelectionMode: "day-only",
      cloudGuideColorMapId: "VIIRS_Clear_Sky_Confidence",
      cloudGuideValueKind: "clear-sky-confidence",
      defaultMethodLabel: "VIIRS AOD 阈值 + 连通域聚类",
      description: "用于区域尺度雾霾/气溶胶任务的 VIIRS AOD 分析层，便于和 NOAA-20 真彩色底图对齐。",
    },
    {
      id: "viirs-noaa21-aod-dark-target-land-ocean",
      layer: "VIIRS_NOAA21_AOD_Dark_Target_Land_Ocean",
      label: "VIIRS NOAA-21 AOD Dark Target",
      sensor: "VIIRS",
      platform: "NOAA-21",
      nominalObservationHour: 13.5,
      preferredCloudMaskProductId: "CLDMSK_L2_VIIRS_NOAA21",
      provider: "NASA GIBS",
      cadence: "daily",
      cadenceLabel: "官方日尺度气溶胶产品",
      task: "大气异常提取",
      legendUrl: "https://gibs.earthdata.nasa.gov/legends/MODIS_VIIRS_AOD_H.png",
      defaultMethodLabel: "VIIRS AOD 阈值 + 连通域聚类",
      description: "用于局地尺度雾霾/气溶胶任务的 VIIRS AOD 分析层，优先匹配当前 NOAA-21 底图链路。",
    },
    {
      id: "modis-aqua-aod-3km",
      layer: "MODIS_Aqua_Aerosol_Optical_Depth_3km",
      label: "MODIS Aqua AOD 3km",
      sensor: "MODIS",
      platform: "Aqua",
      nominalObservationHour: 13.5,
      preferredCloudMaskProductId: "MYD35_L2",
      provider: "NASA GIBS",
      cadence: "daily",
      cadenceLabel: "官方日尺度气溶胶产品",
      task: "大气异常提取",
      legendUrl: "https://gibs.earthdata.nasa.gov/legends/MODIS_VIIRS_AOD_H.png",
      cloudGuideLayerDay: "MODIS_Aqua_Cloud_Fraction_Day",
      cloudGuideLayerNight: "MODIS_Aqua_Cloud_Fraction_Night",
      cloudGuideSelectionMode: "day-only",
      cloudGuideColorMapId: "MODIS_Cloud_Fraction",
      cloudGuideValueKind: "cloud-fraction",
      defaultMethodLabel: "高值阈值 + 连通域聚类",
      description: "用于需要下午过境 MODIS 参考的雾霾/气溶胶分析层。",
    },
    {
      id: "modis-terra-aod-3km",
      layer: "MODIS_Terra_Aerosol_Optical_Depth_3km",
      label: "MODIS Terra AOD 3km",
      sensor: "MODIS",
      platform: "Terra",
      nominalObservationHour: 9.0,
      observationTimingNote: "Terra 已漂移，当前按约 09:00 本地太阳时近似，而不是历史 10:30。",
      preferredCloudMaskProductId: "MOD35_L2",
      provider: "NASA GIBS",
      cadence: "daily",
      cadenceLabel: "官方日尺度气溶胶产品",
      task: "大气异常提取",
      legendUrl: "https://gibs.earthdata.nasa.gov/legends/MODIS_VIIRS_AOD_H.png",
      cloudGuideLayerDay: "MODIS_Terra_Cloud_Fraction_Day",
      cloudGuideLayerNight: "MODIS_Terra_Cloud_Fraction_Night",
      cloudGuideSelectionMode: "day-only",
      cloudGuideColorMapId: "MODIS_Cloud_Fraction",
      cloudGuideValueKind: "cloud-fraction",
      dustModelLabel: "MODIS Terra AOD + Deep Blue 沙尘识别",
      dustModelMethodLabel: "MODIS AOD + VIIRS Aerosol Type dust 先验",
      dustSupportLayers: [VIIRS_NOAA20_DUST_TYPE_SUPPORT, VIIRS_SNPP_DUST_TYPE_SUPPORT, AIRS_DUST_SCORE_SUPPORT],
      dustScreeningLayers: [MODIS_TERRA_WATER_SCREENING],
      defaultMethodLabel: "高值阈值 + 连通域聚类",
      description: "当前用于异常候选区域提取的官方气溶胶分析层。",
    },
    {
      id: "viirs-snpp-thermal-anomalies-375m",
      layer: "VIIRS_SNPP_Thermal_Anomalies_375m_All",
      label: "VIIRS SNPP 热异常 375m",
      sensor: "VIIRS",
      platform: "SNPP",
      nominalObservationHour: 13.5,
      observationTimingNote: "名义下午轨道，当前展示链按约 13:30 本地太阳时近似。",
      preferredCloudMaskProductId: "CLDMSK_L2_VIIRS_SNPP",
      provider: "NASA GIBS",
      cadence: "daily",
      cadenceLabel: "官方日尺度热异常产品",
      task: "热异常候选区确认",
      legendRequired: false,
      renderMode: "thermal-hotspot",
      cloudFilteredProduct: true,
      applyVisualCloudSuppression: false,
      strictSatelliteBinding: true,
      strictImageryLayerId: "viirs-snpp-truecolor",
      strictCloudMaskProductId: "CLDMSK_L2_VIIRS_SNPP",
      thermalModelId: "official-thermal-hotspot-clustering",
      cloudGuideLayerDay: "VIIRS_SNPP_Clear_Sky_Confidence_Day",
      cloudGuideLayerNight: "VIIRS_SNPP_Clear_Sky_Confidence_Night",
      cloudGuideSelectionMode: "day-only",
      cloudGuideColorMapId: "VIIRS_Clear_Sky_Confidence",
      cloudGuideValueKind: "clear-sky-confidence",
      defaultMethodLabel: "热异常点聚类 + 空间归并",
      description: "用于森林火和热异常任务的官方 VIIRS 热异常专题层，适合做热点确认与热点簇提取。",
    },
  ],
};

function fail(message) {
  const error = new Error(message);
  error.name = "LayerCatalogError";
  throw error;
}

function validateLayerEntry(layer, type, ids) {
  const required = ["id", "layer", "label", "sensor", "platform", "provider", "cadence", "description"];
  const missing = required.filter((field) => !layer[field]);

  if (missing.length) {
    fail(`${type} 图层 ${layer.id || "unknown"} 缺少字段：${missing.join(", ")}`);
  }

  if (ids.has(layer.id)) {
    fail(`图层配置中存在重复 id：${layer.id}`);
  }
  ids.add(layer.id);
}

export function validateLayerCatalog(catalog = layerCatalog) {
  const errors = [];

  try {
    if (!catalog.version) {
      fail("图层配置缺少 version。");
    }

    if (!catalog.services?.gibsWmsUrl) {
      fail("图层配置缺少 GIBS 服务地址。");
    }

    if (!Array.isArray(catalog.imageryLayers) || catalog.imageryLayers.length === 0) {
      fail("图层配置缺少 imageryLayers。");
    }

    if (!Array.isArray(catalog.analysisLayers) || catalog.analysisLayers.length === 0) {
      fail("图层配置缺少 analysisLayers。");
    }

    const imageryIds = new Set();
    const analysisIds = new Set();
    catalog.imageryLayers.forEach((layer) => validateLayerEntry(layer, "imagery", imageryIds));
    catalog.analysisLayers.forEach((layer) => {
      validateLayerEntry(layer, "analysis", analysisIds);
      if (layer.legendRequired !== false && !layer.legendUrl) {
        fail(`analysis 图层 ${layer.id} 缺少 legendUrl。`);
      }
      if (!layer.task) {
        fail(`analysis 图层 ${layer.id} 缺少 task。`);
      }
    });
  } catch (error) {
    errors.push(error.message);
  }

  return {
    ok: errors.length === 0,
    errors,
  };
}

export function getImageryLayerConfig(id, catalog = layerCatalog) {
  const config = catalog.imageryLayers.find((layer) => layer.id === id);
  if (!config) {
    fail(`未找到 imagery 图层配置：${id}`);
  }
  return config;
}

export function getAnalysisLayerConfig(id, catalog = layerCatalog) {
  const config = catalog.analysisLayers.find((layer) => layer.id === id);
  if (!config) {
    fail(`未找到 analysis 图层配置：${id}`);
  }
  return config;
}

export function summarizeLayerCatalog(catalog = layerCatalog) {
  const sensors = new Set([
    ...catalog.imageryLayers.map((layer) => layer.sensor),
    ...catalog.analysisLayers.map((layer) => layer.sensor),
  ]);
  const providers = new Set([
    ...catalog.imageryLayers.map((layer) => layer.provider),
    ...catalog.analysisLayers.map((layer) => layer.provider),
  ]);

  return {
    version: catalog.version,
    imageryCount: catalog.imageryLayers.length,
    analysisCount: catalog.analysisLayers.length,
    sensorCount: sensors.size,
    providerCount: providers.size,
  };
}

export const DEFAULT_DAILY_IMAGERY_IDS = layerCatalog.imageryLayers
  .slice()
  .sort((left, right) => left.defaultPriority - right.defaultPriority)
  .map((layer) => layer.id);

export const DEFAULT_ANALYSIS_LAYER_ID = "modis-terra-aod-3km";

export const layerCatalogHealth = validateLayerCatalog(layerCatalog);

if (!layerCatalogHealth.ok) {
  fail(layerCatalogHealth.errors.join("；"));
}
