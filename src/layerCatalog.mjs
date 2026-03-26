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
      nominalObservationHour: 13.4,
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
      nominalObservationHour: 13.3,
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
      nominalObservationHour: 10.5,
      preferredCloudMaskProductId: "MOD35_L2",
      provider: "NASA GIBS",
      cadence: "daily",
      cadenceLabel: "官方日尺度连续更新底图",
      renderMode: "true-color",
      defaultPriority: 4,
      coverage: "全球",
      description: "当前链路中的最终回退底图，用于保证日期覆盖。",
    },
  ],
  analysisLayers: [
    {
      id: "modis-terra-aod-3km",
      layer: "MODIS_Terra_Aerosol_Optical_Depth_3km",
      label: "MODIS Terra AOD 3km",
      sensor: "MODIS",
      platform: "Terra",
      nominalObservationHour: 10.5,
      preferredCloudMaskProductId: "MOD35_L2",
      provider: "NASA GIBS",
      cadence: "daily",
      cadenceLabel: "官方日尺度气溶胶产品",
      task: "大气异常提取",
      legendUrl: "https://gibs.earthdata.nasa.gov/legends/MODIS_VIIRS_AOD_H.png",
      defaultMethodLabel: "高值阈值 + 连通域聚类",
      description: "当前用于异常候选区域提取的官方气溶胶分析层。",
    },
    {
      id: "viirs-snpp-thermal-anomalies-375m",
      layer: "VIIRS_SNPP_Thermal_Anomalies_375m_All",
      label: "VIIRS SNPP 热异常 375m",
      sensor: "VIIRS",
      platform: "SNPP",
      nominalObservationHour: 13.3,
      preferredCloudMaskProductId: "CLDMSK_L2_VIIRS_SNPP",
      provider: "NASA GIBS",
      cadence: "daily",
      cadenceLabel: "官方日尺度热异常产品",
      task: "热异常候选区确认",
      legendRequired: false,
      renderMode: "thermal-hotspot",
      cloudFilteredProduct: true,
      applyVisualCloudSuppression: false,
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

export const DEFAULT_ANALYSIS_LAYER_ID = layerCatalog.analysisLayers[0].id;

export const layerCatalogHealth = validateLayerCatalog(layerCatalog);

if (!layerCatalogHealth.ok) {
  fail(layerCatalogHealth.errors.join("；"));
}
