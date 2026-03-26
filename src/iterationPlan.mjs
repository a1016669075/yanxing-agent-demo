export const deliveryPrinciples = [
  "一次只推进一个可测试模块，当前模块完成并获认可后再进入下一项。",
  "每个模块都必须说明输入、输出、依赖和验收标准，避免模糊开发。",
  "优先做能在页面端看到结果、并能被自动化测试约束的小闭环。",
];

export const phaseCatalog = [
  {
    id: "foundation",
    label: "基础契约与前端入口",
    description: "先把 ROI 契约、前端交互和图层配置统一起来，保证后续模块能接得上。",
  },
  {
    id: "data-access",
    label: "遥感数据接入",
    description: "逐步打通官方底图、STAC 检索和统一资产读取能力。",
  },
  {
    id: "preprocess",
    label: "预处理与对齐",
    description: "补齐云掩膜、重采样和多源对齐，为稳定推理做准备。",
  },
  {
    id: "inference",
    label: "模型与推理",
    description: "把模型注册、推理执行和后处理矢量化拆成独立模块。",
  },
  {
    id: "delivery",
    label: "结果发布与评测",
    description: "把结果切片、缓存、回放和离线评测都做成可复用能力。",
  },
];

export const iterationModules = [
  {
    id: "roi-schema-validation",
    phase: "foundation",
    title: "ROI 数据结构与校验",
    summary: "统一接收 bbox 和 polygon，标准化输出 EPSG:4326 ROI 契约，为后续检索、推理和切片打底。",
    input: "GeoJSON bbox / polygon",
    output: "规范化 ROI、面积与边界框",
    dependencies: ["无"],
    complexity: "S",
    status: "done",
    acceptance: [
      "自交 polygon 会被明确拦截并返回可读错误。",
      "bbox 和 polygon 统一输出相同结构的 ROI 对象。",
      "坐标范围与 EPSG:4326 合法性可自动校验。",
    ],
  },
  {
    id: "roi-drawing-tool",
    phase: "foundation",
    title: "前端 ROI 绘制工具",
    summary: "让用户能在页面上绘制、编辑和删除 ROI，并返回稳定的 roi_id。",
    input: "用户交互",
    output: "ROI GeoJSON、roi_id",
    dependencies: ["地图前端库"],
    complexity: "M",
    status: "done",
    acceptance: [
      "绘制后可提交并返回 roi_id。",
      "多边形编辑和删除过程不崩溃。",
      "页面端能正确读取刚提交的 ROI 几何。",
    ],
  },
  {
    id: "sensor-config-center",
    phase: "foundation",
    title: "传感器/图层配置中心",
    summary: "把图层、传感器和版本信息收口到结构化配置，避免每加一层都改代码。",
    input: "YAML / JSON 配置",
    output: "可渲染的图层列表",
    dependencies: ["无"],
    complexity: "S",
    status: "done",
    acceptance: [
      "配置变更无需修改渲染逻辑。",
      "缺少关键字段时能够 fail-fast。",
      "图层配置带版本号并可追溯。",
    ],
  },
  {
    id: "gibs-proxy",
    phase: "foundation",
    title: "Basemap 代理服务（GIBS）",
    summary: "稳定代理官方底图请求，解决跨日期切换、缓存和错误提示问题。",
    input: "layer / date / z / x / y",
    output: "PNG tile",
    dependencies: ["GIBS WMTS/XYZ"],
    complexity: "S",
    status: "done",
    acceptance: [
      "相同请求可命中本地缓存。",
      "跨日期切换后底图更新正确。",
      "请求失败时返回可读错误码。",
    ],
  },
  {
    id: "stac-search-adapter",
    phase: "data-access",
    title: "STAC Search Adapter",
    summary: "把 ROI 与时间范围转换为标准 STAC ItemCollection 查询。",
    input: "roi + time + collections",
    output: "STAC ItemCollection",
    dependencies: ["pystac-client"],
    complexity: "M",
    status: "done",
    acceptance: [
      "Earth Search 可按 bbox 和日期返回 Items。",
      "空结果时可给出合理提示。",
      "分页结果可被完整收集。",
    ],
  },
  {
    id: "copernicus-stac-adapter",
    phase: "data-access",
    title: "Copernicus STAC Adapter",
    summary: "补齐 Sentinel-2 场景检索能力，为更高分辨率大气场景做准备。",
    input: "roi + time + collections",
    output: "STAC ItemCollection",
    dependencies: ["CDSE STAC"],
    complexity: "M",
    status: "done",
    acceptance: [
      "指定 Sentinel-2 collection 时可查到有效 items。",
      "超时重试策略能够生效。",
      "返回结构可与统一 STAC 接口对齐。",
    ],
  },
  {
    id: "cmr-stac-adapter",
    phase: "data-access",
    title: "CMR-STAC Adapter",
    summary: "接入 NASA 侧 STAC 检索，给 MODIS 和 VIIRS 产品检索提供统一入口。",
    input: "roi + time + provider",
    output: "STAC Items",
    dependencies: ["NASA CMR-STAC"],
    complexity: "M",
    status: "done",
    acceptance: [
      "provider catalog 可正常访问。",
      "返回 items 中的 assets 可被解析。",
      "统一接口下能区分空结果与异常结果。",
    ],
  },
  {
    id: "laads-downloader",
    phase: "data-access",
    title: "LAADS 检索与下载器",
    summary: "为 MODIS/VIIRS 真正的数据下载和回放建立可靠入口。",
    input: "product + roi + time",
    output: "文件路径或对象存储 key",
    dependencies: ["LAADS API"],
    complexity: "L",
    status: "done",
    acceptance: [
      "能检索并下载 VIIRS 或 MODIS 产品。",
      "失败后可恢复或重试。",
      "带 token 的下载流程可被自动化测试。",
    ],
  },
  {
    id: "cog-reader",
    phase: "data-access",
    title: "资产读取统一接口（COG）",
    summary: "把远端或本地资产读取统一成 patch 级接口，方便模型直接消费。",
    input: "asset_url + window",
    output: "patch 数据对象",
    dependencies: ["rasterio / GDAL"],
    complexity: "M",
    status: "done",
    acceptance: [
      "读取指定 bbox patch 的结果与 GDAL 一致。",
      "远端 COG 的 HTTP Range 读取可用。",
      "错误资产会返回稳定异常信息。",
    ],
  },
  {
    id: "mod35-cloud-mask",
    phase: "preprocess",
    title: "云掩膜：MOD35/CLDMSK 接入",
    summary: "优先补上 MODIS/VIIRS 大气任务最相关的云掩膜来源，强化异常识别前的数据清洗。",
    input: "MODIS / VIIRS 产品",
    output: "binary mask + confidence",
    dependencies: ["MOD35 / CLDMSK"],
    complexity: "M",
    status: "done",
    acceptance: [
      "给定日期和区域可以取到云掩膜产品。",
      "能合成二值掩膜并保留置信度。",
      "缺数据时可 fallback，不会阻断整个任务。",
    ],
  },
  {
    id: "s2cloudless-mask",
    phase: "preprocess",
    title: "云掩膜：Sentinel-2 s2cloudless",
    summary: "为高分辨率光学场景补充通用云概率估计能力。",
    input: "Sentinel-2 bands",
    output: "cloud prob + mask",
    dependencies: ["s2cloudless"],
    complexity: "M",
    status: "done",
    acceptance: [
      "输出 mask 尺寸与影像一致。",
      "阈值可调且结果可复现。",
      "速度满足离线批处理要求。",
    ],
  },
  {
    id: "fmask-mask",
    phase: "preprocess",
    title: "云掩膜：Fmask",
    summary: "为 Landsat 和部分 Sentinel-2 工作流补上经典云影识别方案。",
    input: "Landsat / Sentinel-2 L1",
    output: "cloud + shadow mask",
    dependencies: ["Fmask"],
    complexity: "L",
    status: "done",
    acceptance: [
      "对样例数据输出与官方 QA 对比合理。",
      "云影区域能够被稳定标出。",
      "参数配置可被脚本化调用。",
    ],
  },
  {
    id: "resample-alignment",
    phase: "preprocess",
    title: "重采样与对齐（可选 HLS）",
    summary: "让多时相、多源输入在同一网格上对齐，方便时序模型和跨传感器推理。",
    input: "多源多时相影像",
    output: "统一网格 patch",
    dependencies: ["HLS / 重投影"],
    complexity: "L",
    status: "done",
    acceptance: [
      "多时相 stack 维度一致。",
      "像元对齐误差落在预设阈值内。",
      "重采样方式可配置并可回放。",
    ],
  },
  {
    id: "model-registry",
    phase: "inference",
    title: "模型注册表（Model Registry）",
    summary: "统一记录模型所需波段、分辨率、任务类型和版本信息，避免推理逻辑散落在页面里。",
    input: "model spec",
    output: "统一 get_model 接口",
    dependencies: ["无"],
    complexity: "M",
    status: "done",
    acceptance: [
      "新增一个模型无需改核心调度逻辑。",
      "模型声明包含 bands、scale、task、version。",
      "缺少关键信息的模型不能注册成功。",
    ],
  },
  {
    id: "inference-runner",
    phase: "inference",
    title: "推理核心 Runner",
    summary: "把 patch 输入、模型推理、批量执行和设备切换封成稳定的执行单元。",
    input: "patch + model",
    output: "logits / mask / score",
    dependencies: ["torch"],
    complexity: "L",
    status: "done",
    acceptance: [
      "固定输入在固定 seed 下输出可复现。",
      "GPU 和 CPU 都可以运行。",
      "batch 推理通过且结果形状稳定。",
    ],
  },
  {
    id: "vectorize-postprocess",
    phase: "inference",
    title: "后处理：矢量化",
    summary: "把模型输出的 mask 转成 GeoJSON 区域，供页面标记、下传和评测复用。",
    input: "binary mask",
    output: "GeoJSON polygons",
    dependencies: ["gdal / polygonize"],
    complexity: "M",
    status: "done",
    acceptance: [
      "输出为合法 GeoJSON。",
      "多边形简化阈值可调。",
      "矢量化后 IoU 不显著下降。",
    ],
  },
  {
    id: "json-tile-slicer",
    phase: "delivery",
    title: "结果瓦片：JSON 切片器",
    summary: "让识别结果可以按 tile 组织，支撑页面端按需加载和跨日期回放。",
    input: "GeoJSON + z / x / y",
    output: "/tiles/...json",
    dependencies: ["tile math"],
    complexity: "L",
    status: "done",
    acceptance: [
      "任意 tile 请求返回稳定结果。",
      "边界裁剪正确。",
      "压缩后大小可控。",
    ],
  },
  {
    id: "vector-tile-delivery",
    phase: "delivery",
    title: "结果瓦片：矢量瓦片（可选）",
    summary: "在 JSON 方案稳定后，再考虑用矢量瓦片提升大范围场景渲染效率。",
    input: "polygons",
    output: "MVT",
    dependencies: ["tippecanoe / 自研"],
    complexity: "M",
    status: "done",
    acceptance: [
      "MapLibre 可流畅加载。",
      "属性字段保留完整。",
      "单 tile 大小控制在预设阈值内。",
    ],
  },
  {
    id: "async-precompute-queue",
    phase: "delivery",
    title: "任务队列与异步预计算",
    summary: "把大区域或多日期任务改造成异步执行，避免页面端等待过长。",
    input: "job spec",
    output: "job status + artifacts",
    dependencies: ["Celery / 队列"],
    complexity: "M",
    status: "done",
    acceptance: [
      "高并发提交不丢任务。",
      "失败任务可重试。",
      "同一 job 幂等，不重复计算。",
    ],
  },
  {
    id: "cache-index-versioning",
    phase: "delivery",
    title: "缓存索引与版本化",
    summary: "把模型版本、日期和 tile 索引绑定起来，支撑回放、对比和溯源。",
    input: "model_version + date + tile",
    output: "artifact index",
    dependencies: ["DB / kv"],
    complexity: "M",
    status: "done",
    acceptance: [
      "可以按 model_version 回放旧结果。",
      "缓存命中率可统计。",
      "索引缺失时能回退到重新计算。",
    ],
  },
  {
    id: "offline-eval-harness",
    phase: "delivery",
    title: "评测 Harness（离线）",
    summary: "让每次模型或流程更新都能用同一套脚本跑出可比较的指标报告。",
    input: "dataset + script",
    output: "metrics report",
    dependencies: ["pytest + eval"],
    complexity: "M",
    status: "current",
    acceptance: [
      "一键运行可产出指标报告。",
      "固定版本可复现。",
      "支持导出表格或图。",
    ],
  },
];

const STATUS_PRIORITY = {
  current: 0,
  queued: 1,
  later: 2,
  done: 3,
};

export function validateIterationPlan(modules = iterationModules) {
  const seen = new Set();
  const errors = [];
  let currentCount = 0;

  modules.forEach((module) => {
    if (seen.has(module.id)) {
      errors.push(`重复模块 id: ${module.id}`);
    }
    seen.add(module.id);

    if (!module.phase || !module.title || !module.input || !module.output) {
      errors.push(`模块缺少基础字段: ${module.id}`);
    }

    if (!Array.isArray(module.acceptance) || module.acceptance.length === 0) {
      errors.push(`模块缺少验收标准: ${module.id}`);
    }

    if (module.status === "current") {
      currentCount += 1;
    }
  });

  if (currentCount !== 1) {
    errors.push(`当前执行模块数量异常: ${currentCount}`);
  }

  return {
    ok: errors.length === 0,
    errors,
  };
}

export function getCurrentIterationModule(modules = iterationModules) {
  return modules.find((module) => module.status === "current") ?? null;
}

export function getNextIterationModules(count = 3, modules = iterationModules) {
  return modules.filter((module) => module.status === "queued").slice(0, count);
}

export function summarizeIterationPlan(modules = iterationModules) {
  return modules.reduce(
    (summary, module) => {
      summary.total += 1;
      summary.byStatus[module.status] = (summary.byStatus[module.status] ?? 0) + 1;
      return summary;
    },
    {
      total: 0,
      byStatus: {
        current: 0,
        queued: 0,
        later: 0,
        done: 0,
      },
    }
  );
}

export function buildPhaseGroups(modules = iterationModules) {
  return phaseCatalog.map((phase) => {
    const phaseModules = modules
      .filter((module) => module.phase === phase.id)
      .slice()
      .sort((left, right) => STATUS_PRIORITY[left.status] - STATUS_PRIORITY[right.status]);

    return {
      ...phase,
      modules: phaseModules,
      counts: phaseModules.reduce(
        (counts, module) => {
          counts.total += 1;
          counts[module.status] = (counts[module.status] ?? 0) + 1;
          return counts;
        },
        {
          total: 0,
          current: 0,
          queued: 0,
          later: 0,
          done: 0,
        }
      ),
    };
  });
}
