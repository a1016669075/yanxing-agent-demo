export const taskCatalog = [
  {
    id: "dust",
    label: "沙尘异常",
    category: "大气异常",
    status: "ready",
    statusLabel: "原型可运行",
    supportedScales: ["global", "continental", "regional", "local"],
    dataSources: ["VIIRS NOAA-21/20", "MODIS Terra", "NASA GIBS 日尺度真彩色", "MOD35 / CLDMSK"],
    modelTools: ["官方 AOD 连通域异常提取", "本地连续反演网络", "静态预测回放"],
    cloudRule: "定量反演默认在去云后有效区域上执行；云量过高时自动退回热区结果。",
    note: "当前最成熟的演示链路，适合全球选区后做区域级异常筛查与局部定量反演。",
  },
  {
    id: "pollution",
    label: "污染羽流 / 雾霾",
    category: "大气异常",
    status: "ready",
    statusLabel: "原型可运行",
    supportedScales: ["global", "continental", "regional", "local"],
    dataSources: ["VIIRS NOAA-21/20", "MODIS Terra AOD 3km", "NASA GIBS 真彩色", "MOD35 / CLDMSK"],
    modelTools: ["官方 AOD 连通域异常提取", "本地连续反演网络", "静态预测回放"],
    cloudRule: "先执行观测质量门禁，再决定是否允许进入污染定量链路。",
    note: "适合展示去云修复、重点区域优先和局部异常羽流处理。",
  },
  {
    id: "mixed",
    label: "复合大气异常",
    category: "大气异常",
    status: "ready",
    statusLabel: "原型可运行",
    supportedScales: ["continental", "regional", "local"],
    dataSources: ["VIIRS NOAA-21/20", "MODIS Terra", "NASA GIBS 真彩色", "MOD35 / CLDMSK"],
    modelTools: ["官方 AOD 连通域异常提取", "本地连续反演网络", "规则降级热区输出"],
    cloudRule: "当辐射质量或去云后有效区域不足时，优先退回异常热区结果而不是强行做定量反演。",
    note: "适合暮光、复合污染和弱对比场景的保守处理演示。",
  },
  {
    id: "flood",
    label: "洪水 / 积水",
    category: "地表异常",
    status: "adapting",
    statusLabel: "工具链待接入",
    supportedScales: ["regional", "local"],
    dataSources: ["Sentinel-2 L2A", "Landsat 8/9", "VIIRS 背景场", "云掩膜产品"],
    modelTools: ["水体分割模型", "变化检测工具链", "STAC + COG 资产读取"],
    cloudRule: "高分可见光链路必须先去云，再做局部变化检测与水体异常提取。",
    note: "页面和数据发现链路已准备，后续主要补高分遥感模型与真实 patch 推理。",
  },
  {
    id: "landslide",
    label: "滑坡 / 崩塌",
    category: "地表异常",
    status: "adapting",
    statusLabel: "工具链待接入",
    supportedScales: ["regional", "local"],
    dataSources: ["Sentinel-2 L2A", "Landsat 8/9", "DEM/辅助地形数据", "云掩膜产品"],
    modelTools: ["变化检测模型", "地形约束工具", "矢量化后处理"],
    cloudRule: "需要先筛掉受云影响的区域，再做局部滑坡候选识别。",
    note: "更适合在全球选区后再做局地高分任务，不适合全局直接推理。",
  },
  {
    id: "building-damage",
    label: "建筑物损毁",
    category: "地表异常",
    status: "adapting",
    statusLabel: "工具链待接入",
    supportedScales: ["local"],
    dataSources: ["Sentinel-2 L2A", "Landsat 8/9", "高分背景数据", "云掩膜产品"],
    modelTools: ["目标检测 / 分割模型", "变化检测工具链", "局部精细推理"],
    cloudRule: "只在去云后的局部区域上运行高分模型，避免把算力浪费在不可用像元上。",
    note: "当前更适合作为后续高分能力扩展方向。",
  },
  {
    id: "wildfire",
    label: "森林火 / 热异常",
    category: "热异常",
    status: "ready",
    statusLabel: "原型可运行",
    supportedScales: ["continental", "regional", "local"],
    dataSources: ["VIIRS 热异常 375m", "VIIRS SNPP 真彩色", "MODIS 热点产品", "Sentinel-2 / Landsat 局部核验"],
    modelTools: ["官方热异常热点簇提取", "热点确认图生成", "局部高分复核链路"],
    cloudRule: "热点确认仍参考云筛查，但优先使用官方热异常专题产品，不再把无热点场景强行伪造成异常输出。",
    note: "当前已接通全球选区后的热异常热点确认闭环，适合展示跨区域热点筛查与后续局部复核入口。",
  },
  {
    id: "volcano",
    label: "火山灰 / 喷发异常",
    category: "热异常",
    status: "planned",
    statusLabel: "规划中",
    supportedScales: ["continental", "regional"],
    dataSources: ["VIIRS / MODIS 背景观测", "火山灰专题产品", "云掩膜产品"],
    modelTools: ["专题阈值工具", "异常传播跟踪", "结果下传摘要"],
    cloudRule: "优先做大范围背景筛查，再决定是否需要局部精细处理。",
    note: "当前作为能力矩阵保留项，尚未接入正式模型。",
  },
];

function uniqueCount(items) {
  return new Set(items.flat()).size;
}

export function summarizeTaskCatalog(catalog = taskCatalog) {
  return {
    total: catalog.length,
    ready: catalog.filter((task) => task.status === "ready").length,
    adapting: catalog.filter((task) => task.status === "adapting").length,
    planned: catalog.filter((task) => task.status === "planned").length,
    dataSourceCount: uniqueCount(catalog.map((task) => task.dataSources)),
    modelToolCount: uniqueCount(catalog.map((task) => task.modelTools)),
  };
}

export function getTaskById(id, catalog = taskCatalog) {
  return catalog.find((task) => task.id === id) ?? null;
}

export function capabilityForTask(taskId, scaleKey = "regional", catalog = taskCatalog) {
  const task = getTaskById(taskId, catalog);
  if (!task) {
    return null;
  }

  const localPreferred = scaleKey === "local";
  const regionalPreferred = scaleKey === "regional" || scaleKey === "continental";
  const broadPreferred = scaleKey === "global";

  let strategy = "先用稳定背景观测筛查异常，再把重点区域交给更精细的模型或工具。";
  if (localPreferred) {
    strategy = "当前区域较小，智能体会优先选择高分辨率数据和局部精细模型。";
  } else if (regionalPreferred) {
    strategy = "当前区域处于区域尺度，适合先做中低分辨率筛查，再对子区域进行精细处理。";
  } else if (broadPreferred) {
    strategy = "当前区域较大，系统会优先走低分辨率广域筛查链路，只把明显异常区域下钻处理。";
  }

  return {
    ...task,
    scaleKey,
    supportedAtScale: task.supportedScales.includes(scaleKey),
    recommendedStrategy: strategy,
  };
}
