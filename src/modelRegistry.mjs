export const modelRegistryVersion = "2026.03.26-local";

export const modelRegistry = [
  {
    id: "official-aod-connected-components",
    label: "官方 AOD 连通域异常提取",
    version: "1.0.0",
    tasks: ["dust", "pollution", "mixed"],
    sensorHints: ["VIIRS", "MODIS", "AOD"],
    scaleRangeMeters: [1000, 5000],
    runtime: "browser",
    outputs: ["候选 ROI", "异常热区"],
    description: "基于官方 AOD 图层做阈值筛选与连通域聚类，适合作为稳定的异常筛查底座。",
    statusMode: "always_available",
  },
  {
    id: "official-viirs-snpp-haze-aod",
    label: "VIIRS SNPP AOD haze model",
    version: "1.0.0",
    tasks: ["pollution"],
    sensorHints: ["VIIRS", "SNPP", "AOD", "haze"],
    scaleRangeMeters: [750, 6000],
    runtime: "browser",
    outputs: ["haze ROI", "AOD anomaly map"],
    analysisLayerId: "viirs-snpp-aod-dark-target-land-ocean",
    description: "Strict VIIRS SNPP haze chain: SNPP AOD, SNPP true color, and SNPP CLDMSK.",
    statusMode: "always_available",
  },
  {
    id: "official-modis-aqua-haze-aod",
    label: "MODIS Aqua AOD 3km haze model",
    version: "1.0.0",
    tasks: ["pollution"],
    sensorHints: ["MODIS", "Aqua", "AOD", "haze"],
    scaleRangeMeters: [1000, 6000],
    runtime: "browser",
    outputs: ["haze ROI", "AOD anomaly map"],
    analysisLayerId: "modis-aqua-aod-3km",
    description: "Strict MODIS Aqua haze chain: Aqua AOD 3km, Aqua true color, and MYD35.",
    statusMode: "always_available",
  },
  {
    id: "official-viirs-noaa20-haze-aod",
    label: "VIIRS NOAA-20 AOD haze model",
    version: "1.0.0",
    tasks: ["pollution"],
    sensorHints: ["VIIRS", "NOAA-20", "AOD", "haze"],
    scaleRangeMeters: [750, 6000],
    runtime: "browser",
    outputs: ["haze ROI", "AOD anomaly map"],
    analysisLayerId: "viirs-noaa20-aod-dark-target-land-ocean",
    description: "Strict VIIRS NOAA-20 haze chain: NOAA-20 AOD, NOAA-20 true color, and NOAA-20 CLDMSK.",
    statusMode: "always_available",
  },
  {
    id: "official-viirs-noaa21-haze-aod",
    label: "VIIRS NOAA-21 AOD haze model",
    version: "1.0.0",
    tasks: ["pollution"],
    sensorHints: ["VIIRS", "NOAA-21", "AOD", "haze"],
    scaleRangeMeters: [750, 6000],
    runtime: "browser",
    outputs: ["haze ROI", "AOD anomaly map"],
    analysisLayerId: "viirs-noaa21-aod-dark-target-land-ocean",
    description: "Strict VIIRS NOAA-21 haze chain: NOAA-21 AOD, NOAA-21 true color, and NOAA-21 CLDMSK.",
    statusMode: "always_available",
  },
  {
    id: "official-airs-aqua-dust-score",
    label: "AIRS Aqua Dust Score dust model",
    version: "1.0.0",
    tasks: ["dust"],
    sensorHints: ["AIRS", "Aqua", "Dust", "Score"],
    scaleRangeMeters: [1000, 10000],
    runtime: "browser",
    outputs: ["dust ROI", "dust score anomaly map"],
    analysisLayerId: "airs-aqua-dust-score-day-analysis",
    description: "Strict AIRS Aqua dust chain: AIRS Dust Score, Aqua true color display, and Aqua cloud screening.",
    statusMode: "always_available",
  },
  {
    id: "official-viirs-snpp-deep-blue-dust",
    label: "VIIRS SNPP Deep Blue dust model",
    version: "1.0.0",
    tasks: ["dust"],
    sensorHints: ["VIIRS", "SNPP", "Deep Blue", "AOD", "Dust"],
    scaleRangeMeters: [750, 6000],
    runtime: "browser",
    outputs: ["dust ROI", "Deep Blue dust map"],
    analysisLayerId: "viirs-snpp-deep-blue-dust-aot",
    description: "Strict VIIRS SNPP dust chain: SNPP Deep Blue AOT, SNPP Aerosol Type, SNPP true color, and SNPP CLDMSK.",
    statusMode: "always_available",
  },
  {
    id: "official-viirs-noaa20-deep-blue-dust",
    label: "VIIRS NOAA-20 Deep Blue dust model",
    version: "1.0.0",
    tasks: ["dust"],
    sensorHints: ["VIIRS", "NOAA-20", "Deep Blue", "AOD", "Dust"],
    scaleRangeMeters: [750, 6000],
    runtime: "browser",
    outputs: ["dust ROI", "Deep Blue dust map"],
    analysisLayerId: "viirs-noaa20-deep-blue-dust-aot",
    description: "Strict VIIRS NOAA-20 dust chain: NOAA-20 Deep Blue AOT, NOAA-20 Aerosol Type, NOAA-20 true color, and NOAA-20 CLDMSK.",
    statusMode: "always_available",
  },
  {
    id: "official-modis-terra-deep-blue-dust",
    label: "MODIS Terra Deep Blue dust model",
    version: "1.0.0",
    tasks: ["dust"],
    sensorHints: ["MODIS", "Terra", "Deep Blue", "AOD", "Dust"],
    scaleRangeMeters: [750, 6000],
    runtime: "browser",
    outputs: ["dust ROI", "Deep Blue dust map"],
    analysisLayerId: "modis-terra-deep-blue-dust-aod",
    description: "Strict MODIS Terra dust chain: Terra Deep Blue AOD, Terra true color, and MOD35.",
    statusMode: "always_available",
  },
  {
    id: "official-deep-blue-dust-identification",
    label: "官方 Deep Blue 沙尘识别",
    version: "1.0.0",
    tasks: ["dust"],
    sensorHints: ["AIRS", "VIIRS", "MODIS", "Deep Blue", "Aerosol", "AOD", "Dust"],
    scaleRangeMeters: [750, 6000],
    runtime: "browser",
    outputs: ["沙尘概率先验", "沙尘 ROI", "稳定水体筛除"],
    description:
      "按框选尺度调用 AIRS Dust Score、VIIRS Deep Blue AOT/Aerosol Type 或 MODIS Terra Deep Blue AOD 的保守沙尘识别链，适合大尺度框选后的首轮筛查。",
    statusMode: "always_available",
  },
  {
    id: "local-aod-inversion-net",
    label: "本地连续反演网络",
    version: "0.2.0-demo",
    tasks: ["dust", "pollution", "mixed"],
    sensorHints: ["VIIRS", "MODIS", "TrueColor"],
    scaleRangeMeters: [500, 4000],
    runtime: "python-local",
    outputs: ["连续强度场", "异常 ROI"],
    description: "当前 demo 接入的 ResNet18-FPN 风格连续反演原型，可在本机 Python 环境下运行。",
    statusMode: "local_checkpoint",
  },
  {
    id: "static-scene-prediction",
    label: "静态预测回放",
    version: "2026.03-static",
    tasks: ["dust", "pollution", "mixed"],
    sensorHints: ["VIIRS", "MODIS", "TrueColor"],
    scaleRangeMeters: [500, 4000],
    runtime: "static-json",
    outputs: ["回放 ROI", "演示结果"],
    description: "用于 GitHub Pages 或离线演示时快速回放已导出的模型预测结果。",
    statusMode: "date_scoped_static",
  },
  {
    id: "official-thermal-hotspot-clustering",
    label: "官方热异常热点簇提取",
    version: "1.0.0",
    tasks: ["wildfire"],
    sensorHints: ["VIIRS", "SNPP", "Thermal", "Hotspot"],
    scaleRangeMeters: [375, 3000],
    runtime: "browser",
    outputs: ["热点簇", "热点图"],
    analysisLayerId: "viirs-snpp-thermal-anomalies-375m",
    description: "基于官方 VIIRS 热异常专题层做热点点簇提取和空间归并，适合生成森林火/热异常确认图。",
    statusMode: "always_available",
  },
];

function fail(message, code = "invalid_model_registry") {
  const error = new Error(message);
  error.code = code;
  throw error;
}

export function validateModelRegistry(registry = modelRegistry) {
  const seen = new Set();
  const errors = [];

  registry.forEach((model) => {
    if (seen.has(model.id)) {
      errors.push(`重复 model id: ${model.id}`);
    }
    seen.add(model.id);

    if (!model.id || !model.label || !model.version || !model.runtime) {
      errors.push(`模型缺少关键字段: ${model.id || "unknown"}`);
    }

    if (!Array.isArray(model.tasks) || !model.tasks.length) {
      errors.push(`模型缺少 tasks: ${model.id}`);
    }

    if (!Array.isArray(model.sensorHints) || !model.sensorHints.length) {
      errors.push(`模型缺少 sensorHints: ${model.id}`);
    }

    if (
      !Array.isArray(model.scaleRangeMeters) ||
      model.scaleRangeMeters.length !== 2 ||
      Number(model.scaleRangeMeters[0]) >= Number(model.scaleRangeMeters[1])
    ) {
      errors.push(`模型 scaleRangeMeters 不合法: ${model.id}`);
    }
  });

  return {
    ok: errors.length === 0,
    errors,
  };
}

export function summarizeModelRegistry(registry = modelRegistry) {
  return {
    version: modelRegistryVersion,
    total: registry.length,
    runtimes: registry.reduce((summary, model) => {
      summary[model.runtime] = (summary[model.runtime] ?? 0) + 1;
      return summary;
    }, {}),
  };
}

export function getModelById(id, registry = modelRegistry) {
  return registry.find((model) => model.id === id) ?? null;
}

function statusPriority(state) {
  return {
    ready: 0,
    partial: 1,
    fallback: 2,
    unavailable: 3,
  }[state] ?? 4;
}

function normalizeRuntimeStatus(model, availability = {}) {
  const snapshot = availability[model.id] || {};

  if (model.statusMode === "always_available") {
    return {
      state: "ready",
      label: "内置可用",
      detail: "当前页面环境下可直接执行。",
    };
  }

  if (model.statusMode === "local_checkpoint") {
    if (snapshot.available) {
      return {
        state: "ready",
        label: "本地权重可用",
        detail: snapshot.cuda ? "检测到本地权重，且 GPU 可用。" : "检测到本地权重，可在 CPU 上回退运行。",
      };
    }
    return {
      state: "unavailable",
      label: "本地权重缺失",
      detail: snapshot.reason || "当前机器还没有可用 checkpoint。",
    };
  }

  if (model.statusMode === "date_scoped_static") {
    if (snapshot.available) {
      return {
        state: "ready",
        label: "当前日期可回放",
        detail: "当前场景与日期存在静态预测，可直接回放。",
      };
    }
    return {
      state: "partial",
      label: "仅部分日期可回放",
      detail: "当前日期没有静态预测，但保留为演示后备方案。",
    };
  }

  return {
    state: "fallback",
    label: "状态未知",
    detail: "当前还没有接入额外运行时状态。",
  };
}

function sensorMatchScore(model, context) {
  const sensorText = String(context.sensorText || "").toLowerCase();
  return model.sensorHints.reduce((score, token) => {
    return score + (sensorText.includes(String(token).toLowerCase()) ? 1 : 0);
  }, 0);
}

function scaleMatch(model, context) {
  const scale = Number(context.scaleMeters) || 1000;
  return scale >= model.scaleRangeMeters[0] && scale <= model.scaleRangeMeters[1];
}

function modelScore(model, context, availability) {
  let score = 0;

  if (model.tasks.includes(context.taskType)) {
    score += 5;
  }

  if (context.modelId && model.id === context.modelId) {
    score += 10;
  }

  if (context.analysisLayerId && model.analysisLayerId === context.analysisLayerId) {
    score += 8;
  } else if (["dust", "pollution", "wildfire"].includes(context.taskType) && model.analysisLayerId) {
    score -= 6;
  }

  score += sensorMatchScore(model, context) * 2;

  if (scaleMatch(model, context)) {
    score += 2;
  }

  if (context.radiometricQuality < 0.58 && model.id === "official-aod-connected-components") {
    score += 2;
  }

  if (context.taskType === "wildfire" && model.id === "official-thermal-hotspot-clustering") {
    score += 4;
  }

  if (context.taskType === "dust" && model.id === "official-deep-blue-dust-identification") {
    score += 5;
  }

  if (context.radiometricQuality >= 0.6 && model.id === "local-aod-inversion-net") {
    score += 2;
  }

  if (context.staticPredictionAvailable && model.id === "static-scene-prediction") {
    score += 3;
  }

  const runtimeStatus = normalizeRuntimeStatus(model, availability);
  if (runtimeStatus.state === "ready") {
    score += 3;
  } else if (runtimeStatus.state === "partial") {
    score += 1;
  } else if (runtimeStatus.state === "unavailable") {
    score -= 4;
  }

  return {
    score,
    runtimeStatus,
  };
}

export function recommendModels(context, availability = {}, registry = modelRegistry) {
  if (!context?.taskType) {
    fail("recommendModels 需要 taskType。", "invalid_model_context");
  }

  return registry
    .map((model) => {
      const computed = modelScore(model, context, availability);
      return {
        ...model,
        recommendationScore: computed.score,
        runtimeStatus: computed.runtimeStatus,
      };
    })
    .sort((left, right) => {
      if (right.recommendationScore !== left.recommendationScore) {
        return right.recommendationScore - left.recommendationScore;
      }
      return statusPriority(left.runtimeStatus.state) - statusPriority(right.runtimeStatus.state);
    });
}
