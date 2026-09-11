import { buildDemoDustMaskOutput } from "./tools/dustAdapters.mjs";

const app = document.querySelector("#dustAgentApp");

const hexiCorridorCase = {
  caseId: "hexi-corridor-2021-03-15",
  label: "河西走廊，甘肃 / 内蒙古交界区域",
  eventDate: "2021-03-15",
  bbox: [94.0, 37.4, 104.5, 42.5],
  sourceNote:
    "河西走廊 AOI，已接入 GIBS VIIRS corrected reflectance、Deep Blue AOT/Aerosol Type、VIIRS Deep Blue L2/D3 数据和当前 AOI 多通道弱标签分割 mask。",
};

const sentinelThumbnail =
  "./src/dust/examples/high/sentinel2_hexi_high_context_s2a_46sej_20210315_2_l2a.png";

const rivasModelReference = {
  imageUrl: "./reports/dust-round-005/model-audit/rivas-3dcnn/T2025086.0420.png",
  checkpoint: "./reports/dust-round-005/model-audit/rivas-3dcnn/big_epoch_3_finished.pth",
  metricsPath: "./reports/dust-round-005/model-audit/rivas-3dcnn/test_results.txt",
  sourceUrl: "https://github.com/Rivas-AI/dust-3dcnn",
  selectedCase: "T2025086.0420",
  selectedCaseAccuracy: "0.820",
  overallAccuracy: "0.954",
  status: "model_ready reference",
};

const highResolutionAudit = {
  eventDate: "2021-03-15",
  imageryDate: "2021-03-15",
  temporalOffsetDays: 0,
  source: "Earth Search Sentinel-2 L2A 同日 COG，用于河西高分辨率支持解释",
  sourceUrl: "https://earth-search.aws.element84.com/v1/search",
  stacSearchStatus:
    "Earth Search 查询返回了 2021-03-15 河西走廊 AOI 的 Sentinel-2 L2A 同日候选影像",
  stacSearchSummary:
    "当前保留 S2A_46SEJ_20210315_2_L2A 作为同日场景，先做 Sentinel-2 SCL 筛选，再选择 AOT/B04/B08 支持像元；中尺度定位使用 VIIRS 多通道弱标签 mask。该 Sentinel-2 场景云量为 62.87927%，因此只作为支持解释。",
  searchCandidates: [
    {
      provider: "Earth Search v1",
      item: "S2A_46SEJ_20210315_2_L2A",
      datetime: "2021-03-15T04:47:36.583Z",
      cloudCover: "62.87927%",
      temporalOffsetDays: 0,
      assetRole: "选中的同日高分辨率上下文；存在局部云和西侧边缘 footprint，不是沙尘模型输出。",
    },
    {
      provider: "Earth Search v1",
      item: "S2B_48SUG_20210315_1_L2A",
      datetime: "2021-03-15T03:57:53.802Z",
      cloudCover: "19.852564%",
      temporalOffsetDays: 0,
      assetRole: "备选同日瓦片；云量更低，但审计网格中产生的 AOT+NDVI 源区支持像元更少。",
    },
    {
      provider: "Earth Search v1",
      item: "S2A_46SFJ_20210315_2_L2A",
      datetime: "2021-03-15T04:47:31.407Z",
      cloudCover: "55.534482%",
      temporalOffsetDays: 0,
      assetRole: "备选同日西侧瓦片；有效采样像元少于当前选中的 SEJ 瓦片。",
    },
  ],
  currentMaskStatus: "SCL 筛选后的原始 Sentinel-2 AOT + B04/B08 低 NDVI 源区支持像元 / 仅支持证据",
  modelStatus: "未执行 Sentinel-2 沙尘模型；混淆项适配器为 research_reference",
  displayPolicy:
    "高分辨率同日视图只用于源区、地表和混淆项解释。未运行 Sentinel-2 沙尘模型时，不得展示为沙尘分割结果。",
};

const scaleViews = {
  coarse: {
    label: "步骤 1 · 低分辨率发现",
    title: "低分辨率发现区域异常",
    sensor: "AIRS Aqua Dust Score / MODIS Terra context",
    date: "2021-03-15",
    datetime: "2021-03-15T06:00:00Z",
    resolution: "粗尺度气溶胶 / 沙尘评分",
    scale: "coarse",
    modelTool: "Dust-Mamba 目标槽位 + AIRS Dust Score 支持层",
    modelStatus: "Dust-Mamba 阻断；支持数据可用",
    outputStatus: "真实 GIBS dust-score 底图 + 渲染产品阈值 mask",
    confidence: "未知",
    request: {
      type: "gibs",
      layer: "AIRS_L2_Dust_Score_Day",
      date: "2021-03-15",
      bbox: hexiCorridorCase.bbox,
      width: 1200,
      height: 670,
      format: "image/png",
      transparent: "true",
    },
    mask: {
      columns: 24,
      rows: 14,
      threshold: 0.5,
      areaKm2: 286000,
      cellLabel: "粗尺度像元",
      variant: "broad",
      derivation: "gibs-rendered-threshold",
      derivationToolId: "gibs_rendered_dust_score_threshold_adapter",
      derivationLabel: "GIBS rendered dust-score threshold adapter",
      renderedThreshold: 0.5,
    },
    badges: ["NASA GIBS", "AIRS Dust Score", "粗尺度发现", "渲染阈值"],
    agentNote:
      "粗尺度层作为第一层预警面：系统采样真实 AIRS Dust Score GIBS 图像，并从产品颜色中提取粗尺度红色 mask；Dust-Mamba 仍明确标注为 checkpoint/data 未就绪。",
    evidence: {
      main: [
        "粗尺度 Dust Score 图层已从 NASA GIBS 请求。",
        "红色 mask 来自 AIRS Dust Score 渲染图像的颜色阈值。",
        "Dust-Mamba 仍阻断，需本地 checkpoint 和 LSDSSIMR HDF5 事件数据。",
      ],
      supporting: [
        "AIRS Dust Score 可支撑区域级沙尘异常筛查。",
        "MERRA-2 / ERA5 气象槽位已准备，但本轮未调用。",
        "FY-4A 15 分钟 LSDSSIMR 输入可支撑时序连续性，但数据尚未本地化。",
      ],
      conflicting: [
        "本粗尺度步骤尚未执行烟羽、活火、火烧区检查。",
        "云与荒漠背景混淆仍未消解。",
      ],
      precursor: [
        "风场 / 干燥先兆等待 ERA5/MERRA-2 接入，当前未知。",
        "历史沙尘通道证据尚未接入。",
      ],
    },
  },
  medium: {
    label: "步骤 2 · 中分辨率锁定",
    title: "中分辨率锁定沙尘羽边界",
    sensor: "VIIRS NOAA-20 Corrected Reflectance",
    date: "2021-03-15",
    datetime: "2021-03-15T06:00:00Z",
    resolution: "VIIRS corrected reflectance 中尺度底图",
    scale: "medium",
    modelTool: "多通道 VIIRS 弱标签分割头 + Deep Blue 支持",
    modelStatus: "已执行多通道弱标签模型；Element84 公开权重未接入",
    outputStatus:
      "真实 GIBS corrected-reflectance 底图 + 当前 AOI 多通道 VIIRS 像元级 mask",
    confidence: "未知",
    request: {
      type: "gibs",
      layer: "VIIRS_NOAA20_CorrectedReflectance_TrueColor",
      date: "2021-03-15",
      bbox: hexiCorridorCase.bbox,
      width: 1200,
      height: 670,
      format: "image/jpeg",
      transparent: "false",
    },
    mask: {
      columns: 84,
      rows: 48,
      threshold: 0.1,
      areaKm2: 184320,
      cellLabel: "中尺度像元",
      variant: "plume",
      derivation: "gibs-rendered-intersection",
      derivationToolId: "gibs_rendered_aot_aerosol_type_intersection_adapter",
      derivationLabel: "GIBS rendered Deep Blue AOT + Aerosol Type intersection adapter",
      renderedThreshold: 0.1,
      derivationRequests: [
        {
          role: "aot",
          type: "gibs",
          layer: "VIIRS_NOAA20_AOT_Deep_Blue_Best_Estimate",
          date: "2021-03-15",
          bbox: hexiCorridorCase.bbox,
          width: 1200,
          height: 670,
          format: "image/png",
          transparent: "true",
          threshold: 0.1,
          scorer: "aotCoverage",
        },
        {
          role: "aerosol_type",
          type: "gibs",
          layer: "VIIRS_NOAA20_Aerosol_Type_Deep_Blue_Best_Estimate",
          date: "2021-03-15",
          bbox: hexiCorridorCase.bbox,
          width: 1200,
          height: 670,
          format: "image/png",
          transparent: "true",
          threshold: 0.1,
          scorer: "dustAerosolTypeCoverage",
        },
      ],
    },
    badges: ["NASA GIBS", "VIIRS corrected reflectance", "多通道学习 mask", "VIIRS L2 原始标签"],
    agentNote:
      "这是本演示的主目标层：VIIRS corrected reflectance 提供可见沙尘羽底图，当前选中层使用由 Deep Blue AOT、Aerosol Type 和 L2 footprint 弱标签训练的多通道 VIIRS 分割头；这是当前 AOI 的弱标签学习推理，不是 Element84 公开权重。",
    evidence: {
      main: [
        "VIIRS corrected reflectance 底图已从 NASA GIBS 请求。",
        "红色像元来自同日 VIIRS Deep Blue AOT 与 Aerosol Type 渲染支持产品，并由当前 AOI 学习模型参与仲裁。",
        "Element84 方法仍作为语义分割形态参考；未执行 Element84 公开权重。",
      ],
      supporting: [
        "Deep Blue AOT 与 Aerosol Type 做交集，用于降低单一产品误报。",
        "气溶胶支持只作为互证证据，不替代未来 VIIRS 沙尘分割模型。",
        "当前日风场和湿度证据已通过 NASA POWER 点采样快照接入。",
      ],
      conflicting: [
        "烟羽混淆项已注册但未执行。",
        "活火混淆项已注册但未执行。",
        "火烧区混淆项已注册但未执行。",
      ],
      precursor: [
        "前序日期风场 / 干燥度尚不可用；当前日干燥证据已接入。",
        "历史沙尘通道证据暂不可用。",
      ],
    },
  },
  high: {
    label: "步骤 3 · 高分辨率解释",
    title: "高分辨率分析源区与混淆项",
    sensor: "Sentinel-2 L2A thumbnail via Earth Search",
    date: "2021-03-15",
    datetime: "2021-03-15T04:47:36.583Z",
    resolution: "Sentinel-2 同日 TCI/AOT/B04/B08/SCL COG",
    scale: "high",
    modelTool: "Sentinel-2 混淆项 / 源区解释适配器",
    modelStatus: "研究参考",
    outputStatus: "真实同日 STAC COG + SCL 筛选后的 Sentinel-2 源区支持",
    confidence: "未知",
    request: {
      type: "image",
      imageUrl: sentinelThumbnail,
      layer: "S2A_46SEJ_20210315_2_L2A TCI thumbnail",
      date: "2021-03-15",
      bbox: [92.99977821837051, 38.755690205950245, 94.28126851320825, 39.750258916394806],
      width: 1200,
      height: 670,
      format: "image/jpeg",
      transparent: "false",
      sourceUrl: "https://earth-search.aws.element84.com/v1/search",
    },
    mask: {
      columns: 70,
      rows: 42,
      threshold: 0.58,
      areaKm2: 320,
      cellLabel: "高分辨率源区支持像元",
      variant: "edge",
    },
    badges: ["Earth Search", "Sentinel-2", "同日 COG", "仅支持解释"],
    agentNote:
      "高分辨率影像用于检查源区合理性、地表条件和混淆项。它是同日 COG 证据，但没有 Sentinel-2 沙尘分割模型推理，因此不能当作沙尘 mask。",
    evidence: {
      main: [
        "Sentinel-2 TCI 缩略图来自真实同日 STAC COG。",
        "红色像元表示从 Sentinel-2 L2A AOT、B04、B08、SCL COG 采样出的 SCL 筛选后 AOT + 低 NDVI 源区支持像元。",
        "同日高分辨率支持仍是源区 / 混淆项证据，不是沙尘分割结果。",
      ],
      supporting: [
        "裸地 / 源区合理性可进行可视化检查。",
        "Sentinel-2 SCL 筛选与 AOT/B04/B08 NDVI 支持像元可辅助源区和混淆项解释。",
      ],
      conflicting: [
        "烟羽、活火和火烧区检查已注册但未执行。",
        "互斥矩阵把这些检查保持为 unknown / fail-closed，不把未知当作支持。",
        "高云量场景风险需要逐场景处理。",
      ],
      precursor: [
        "地形 / 生境 / 源区证据已规划但尚未计算。",
        "未运行高分辨率 Sentinel-2 沙尘分割模型。",
      ],
    },
  },
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function statusText(value) {
  const labels = {
    executed: "已执行",
    blocked: "阻断",
    ready: "就绪",
    "model-ready": "模型就绪",
    "model-output": "模型输出",
    "evidence-only": "仅证据",
    "executed multi-agent coalition mask": "已执行多智能体协同掩膜",
    runnable: "可运行",
    model_ready: "模型就绪",
    data_ready: "数据就绪",
    research_reference: "研究参考",
    "research-reference": "研究参考",
    research_reference_not_executed: "研究参考，未执行",
    model_ready_reference: "模型就绪参考",
    "model_ready reference": "模型就绪参考",
    unknown: "未知",
  };
  return labels[value] || String(value || "未知");
}

function scaleText(value) {
  return {
    coarse: "低分辨率",
    medium: "中分辨率",
    high: "高分辨率",
  }[value] || String(value || "未知尺度");
}

function booleanText(value) {
  return value ? "是" : "否";
}

function resultText(value) {
  const labels = {
    unknown: "未知",
    unresolved: "未解决",
    pass: "通过",
    fail: "未通过",
    "fail-closed": "按 fail-closed 处理",
    true: "是",
    false: "否",
  };
  return labels[String(value)] || String(value || "未知");
}

function availableText(value) {
  return value ? "已具备" : "缺失";
}

function inferenceText(value) {
  const labels = {
    not_model_inference: "非模型推理",
    learned_model_inference_from_current_aoi_weak_labels: "当前 AOI 弱标签学习模型推理",
  };
  return labels[value] || String(value || "未知");
}

function toolPolicyText(toolId, fallback) {
  const policies = {
    multi_agent_coalition_mask_adapter:
      "默认展示层：多通道模型提出沙尘像元，原始 L2 footprint、气溶胶产品和 RGB 弱标签模型共同投票，颜色表示主导贡献方。",
    viirs_multichannel_weak_label_segmentation_adapter:
      "已执行的当前 AOI 多通道 VIIRS 弱标签分割模型；不要标成 Dust-Mamba 或 Element84 公开权重。",
    viirs_element84_style_weak_label_model_adapter:
      "当前 AOI RGB 弱标签基线，用作视觉 plume 支持；不是 Element84 公开模型。",
    viirs_deep_blue_native_footprint_mask_adapter:
      "真实 VIIRS Deep Blue L2 原始 footprint 支持层；作为互证，不直接冒充深度模型。",
    viirs_deep_blue_raw_science_mask_adapter:
      "真实 VIIRS Deep Blue L2 科学变量阈值支持层；用于互证和审计。",
    viirs_deep_blue_raw_granule_access_audit:
      "记录 Earthdata/CMR 原始数据访问情况；能说明科学变量是否真正下载到本地。",
    dust_mamba_repo_audit_adapter:
      "Dust-Mamba 是 P0 主模型方向，但 checkpoint 和 LSDSSIMR case 数据未本地就绪前不能展示为已推理结果。",
    hexi_real_gibs_data_run:
      "真实 GIBS 数据下载与底图缓存记录，用于证明底图和支持层来源可追溯。",
    gibs_rendered_aot_aerosol_type_intersection_adapter:
      "已执行中尺度交集支持 mask；标注为更严格的数据派生支持，不是模型推理。",
    gibs_rendered_dust_score_threshold_adapter:
      "已执行粗尺度渲染阈值支持 mask；用于发现区域异常，不替代主检测模型。",
    gibs_rendered_deep_blue_threshold_adapter:
      "AOT 阈值层只作为候选支持，用来和 Aerosol Type、模型输出继续互证。",
    modis_3dcnn_dust_adapter:
      "展示 MODIS 3D-CNN 模型就绪参考；已有 checkpoint 和预生成预测，但不是当前 AOI 推理。",
    rivas_3dcnn_model_output_import:
      "展示真实模型 artifact；它不是当前 AOI 输出，不能替换当前 VIIRS 红色 mask。",
    nasa_gibs_viirs_corrected_reflectance:
      "作为真实遥感底图和模型输入来源展示，必须保留 source badge 和请求信息。",
    era5_merra2_meteorology_evidence:
      "气象证据用于解释风向、湿度和输送路径；本页不把气象证据替代为沙尘 mask。",
    smoke_plume_confounder_adapter:
      "烟羽检查是互斥证据；未知不会提高沙尘置信度。",
    active_fire_confounder_adapter:
      "活火检查是互斥证据；未知不会提高沙尘置信度。",
    burned_area_temporal_adapter:
      "火烧区检查是互斥证据；未知不会提高沙尘置信度。",
  };
  return policies[toolId] || fallback || "已登记在沙尘智能体工具链中，页面按当前状态如实显示。";
}

function toolNameText(toolId, fallback) {
  const names = {
    multi_agent_coalition_mask_adapter: "多智能体协同掩膜适配器",
    viirs_multichannel_weak_label_segmentation_adapter: "VIIRS 多通道弱标签分割适配器",
    viirs_element84_style_weak_label_model_adapter: "Element84 风格 VIIRS 弱标签模型",
    viirs_deep_blue_native_footprint_mask_adapter: "VIIRS Deep Blue 原生 footprint 掩膜",
    viirs_deep_blue_raw_science_mask_adapter: "VIIRS Deep Blue 原始科学值掩膜",
    viirs_deep_blue_raw_granule_access_audit: "VIIRS Deep Blue 原始 granule 访问审计",
    gibs_rendered_dust_score_threshold_adapter: "GIBS Dust Score 渲染阈值适配器",
    gibs_rendered_aot_aerosol_type_intersection_adapter: "GIBS AOT + Aerosol Type 交集适配器",
    gibs_rendered_deep_blue_threshold_adapter: "GIBS Deep Blue AOT 阈值适配器",
    hexi_real_gibs_data_run: "河西真实 GIBS 数据运行",
    dust_mamba_repo_audit_adapter: "Dust-Mamba 仓库就绪审计",
    modis_3dcnn_dust_adapter: "MODIS 3D-CNN 沙尘适配器",
    sentinel_high_resolution_context: "Sentinel-2 高分辨率上下文",
    sentinel2_raw_aot_cog_audit_adapter: "Sentinel-2 原始 AOT COG 审计",
    hexi_high_resolution_scene_selector: "河西高分辨率场景选择器",
    nasa_gibs_viirs_corrected_reflectance: "NASA GIBS VIIRS corrected reflectance",
    lsdssimr_data_card: "LSDSSIMR 数据卡",
    deep_blue_aerosol_support: "Deep Blue 气溶胶支持",
    era5_merra2_meteorology_evidence: "ERA5/MERRA-2 气象证据",
    smoke_plume_confounder_adapter: "烟羽混淆项适配器",
    active_fire_confounder_adapter: "活火混淆项适配器",
    burned_area_temporal_adapter: "火烧区时序适配器",
    rivas_3dcnn_model_output_import: "Rivas 3D-CNN 模型输出导入",
  };
  return names[toolId] || fallback || toolId;
}

function gibsProxyUrl(request) {
  if (location.hostname.endsWith(".github.io")) {
    const query = new URLSearchParams({
      SERVICE: "WMS",
      VERSION: "1.1.1",
      REQUEST: "GetMap",
      LAYERS: request.layer,
      STYLES: "",
      FORMAT: request.format,
      TRANSPARENT: request.transparent === "true" ? "TRUE" : "FALSE",
      SRS: "EPSG:4326",
      WIDTH: String(request.width),
      HEIGHT: String(request.height),
      BBOX: request.bbox.join(","),
      TIME: request.date,
    });
    return `https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?${query.toString()}`;
  }
  const params = new URLSearchParams({
    layer: request.layer,
    bbox: request.bbox.join(","),
    width: String(request.width),
    height: String(request.height),
    time: request.date,
    format: request.format,
    transparent: request.transparent,
  });
  return `/api/gibs-proxy?${params.toString()}`;
}

function imageUrlForRequest(request) {
  return request.type === "gibs" ? gibsProxyUrl(request) : request.imageUrl;
}

function imageUrlForView(view) {
  return imageUrlForRequest(view.request);
}

function sourceLabelForRequest(request) {
  return request.type === "gibs" ? `NASA GIBS ${request.layer}` : `Earth Search STAC ${request.layer}`;
}

function localAssetSrc(relativePath) {
  if (!relativePath) {
    return "";
  }
  if (/^(https?:|\/|\.)/.test(relativePath)) {
    return relativePath;
  }
  return `./${relativePath}`;
}

function buildMaskCells({ columns, rows, variant }) {
  const cells = [];
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < columns; x += 1) {
      const nx = x / columns;
      const ny = y / rows;
      let probability = 0;

      if (variant === "broad") {
        const centerLine = 0.69 - nx * 0.34 + Math.sin(nx * 7) * 0.04;
        const spread = 0.11 + nx * 0.035;
        probability = Math.exp(-((ny - centerLine) ** 2) / (2 * spread ** 2)) * (0.72 + nx * 0.12);
      } else if (variant === "edge") {
        const centerLine = 0.66 - nx * 0.18 + Math.sin(nx * 15) * 0.025;
        const spread = 0.035 + nx * 0.018;
        const sourcePatch = Math.exp(-(((nx - 0.42) ** 2) / 0.01 + ((ny - 0.55) ** 2) / 0.018));
        probability = Math.max(
          Math.exp(-((ny - centerLine) ** 2) / (2 * spread ** 2)) * 0.7,
          sourcePatch * 0.86
        );
      } else {
        const centerLine = 0.73 - nx * 0.47 + Math.sin(nx * 9) * 0.045;
        const spread = 0.07 + nx * 0.055;
        const sourceBoost = Math.exp(-(((nx - 0.18) ** 2) / 0.015 + ((ny - 0.62) ** 2) / 0.03));
        probability =
          Math.exp(-((ny - centerLine) ** 2) / (2 * spread ** 2)) * 0.72 + sourceBoost * 0.36;
      }

      const ragged = ((x * 17 + y * 31 + columns) % 13) / 16;
      probability = Math.min(0.97, probability + ragged * 0.07);
      if (probability >= 0.48) {
        cells.push({ x, y, p: Number(probability.toFixed(2)) });
      }
    }
  }
  return cells;
}

function renderedDustScore(red, green, blue, alpha) {
  if (alpha < 24) {
    return 0;
  }
  const brightness = (red + green + blue) / 765;
  if (brightness < 0.08) {
    return 0;
  }
  const warm = Math.max(0, red * 0.62 + green * 0.28 - blue * 0.2) / 255;
  const chroma = (Math.max(red, green, blue) - Math.min(red, green, blue)) / 255;
  return Math.min(1, warm * 0.72 + brightness * 0.22 + chroma * 0.18);
}

function renderedAerosolTypeScore(red, green, blue, alpha) {
  if (alpha < 24) {
    return 0;
  }
  const brightness = (red + green + blue) / 765;
  if (brightness < 0.08) {
    return 0;
  }
  const warm = Math.max(0, red * 0.55 + green * 0.25 - blue * 0.18) / 255;
  const chroma = (Math.max(red, green, blue) - Math.min(red, green, blue)) / 255;
  const nonBlue = blue < Math.max(red, green) * 0.92 ? 0.18 : 0;
  return Math.min(1, warm * 0.62 + brightness * 0.2 + chroma * 0.22 + nonBlue);
}

function scoreRenderedPixel(source, red, green, blue, alpha) {
  if (source.scorer === "aotCoverage") {
    return alpha > 20 && red + green + blue > 30 ? 1 : 0;
  }
  if (source.scorer === "dustAerosolTypeCoverage") {
    const dustLikeType = red > 90 && green > 45 && green < 140 && blue < 100;
    return alpha > 20 && red + green + blue > 30 && dustLikeType ? 1 : 0;
  }
  return source.scorer === "aerosolType"
    ? renderedAerosolTypeScore(red, green, blue, alpha)
    : renderedDustScore(red, green, blue, alpha);
}

async function loadRenderedImageSource(source) {
  if (source.type !== "gibs") {
    return null;
  }
  const sourceImage = imageUrlForRequest(source);
  const response = await fetch(sourceImage);
  if (!response.ok) {
    throw new Error(`GIBS rendered product request failed: ${source.layer} ${response.status}`);
  }
  const blob = await response.blob();
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(bitmap, 0, 0);
  return {
    source,
    sourceImage,
    canvas,
    image: context.getImageData(0, 0, canvas.width, canvas.height),
  };
}

async function deriveRenderedProductMask(view) {
  const sources = view.mask.derivationRequests || [view.mask.derivationRequest || view.request];
  if (sources.some((source) => source.type !== "gibs")) {
    return null;
  }

  const renderedSources = (await Promise.all(sources.map(loadRenderedImageSource))).filter(Boolean);
  const canvas = renderedSources[0].canvas;
  const columns = view.mask.columns;
  const rows = view.mask.rows;
  const threshold = view.mask.renderedThreshold || view.mask.threshold || 0.5;
  const cells = [];
  let scoreSum = 0;
  let sampleCount = 0;

  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < columns; x += 1) {
      const x0 = Math.floor((x / columns) * canvas.width);
      const x1 = Math.max(x0 + 1, Math.floor(((x + 1) / columns) * canvas.width));
      const y0 = Math.floor((y / rows) * canvas.height);
      const y1 = Math.max(y0 + 1, Math.floor(((y + 1) / rows) * canvas.height));
      const stepX = Math.max(1, Math.floor((x1 - x0) / 5));
      const stepY = Math.max(1, Math.floor((y1 - y0) / 5));
      const sourceScores = [];

      for (const rendered of renderedSources) {
        let localScore = 0;
        let localSamples = 0;
        for (let py = y0; py < y1; py += stepY) {
          for (let px = x0; px < x1; px += stepX) {
            const index = (py * rendered.canvas.width + px) * 4;
            localScore += scoreRenderedPixel(
              rendered.source,
              rendered.image.data[index],
              rendered.image.data[index + 1],
              rendered.image.data[index + 2],
              rendered.image.data[index + 3]
            );
            localSamples += 1;
          }
        }
        sourceScores.push({
          role: rendered.source.role || rendered.source.layer,
          layer: rendered.source.layer,
          score: localSamples ? localScore / localSamples : 0,
          threshold: rendered.source.threshold || threshold,
        });
      }

      const score = Math.min(...sourceScores.map((item) => item.score));
      scoreSum += score;
      sampleCount += 1;
      if (sourceScores.every((item) => item.score >= item.threshold)) {
        cells.push({
          x,
          y,
          p: Number(score.toFixed(2)),
          evidence_score: Number(score.toFixed(3)),
          source_scores: sourceScores.map((item) => ({
            role: item.role,
            layer: item.layer,
            score: Number(item.score.toFixed(3)),
            threshold: item.threshold,
            passed: item.score >= item.threshold,
          })),
        });
      }
    }
  }

  return {
    cells,
    averageScore: sampleCount ? Number((scoreSum / sampleCount).toFixed(3)) : null,
    threshold,
    thresholds: renderedSources.map((item) => ({
      role: item.source.role || item.source.layer,
      layer: item.source.layer,
      threshold: item.source.threshold || threshold,
    })),
    sourceImage: renderedSources[0].sourceImage,
    sourceImages: renderedSources.map((item) => item.sourceImage),
    sourceLayer: renderedSources.map((item) => item.source.layer).join(" + "),
    sourceLayers: renderedSources.map((item) => item.source.layer),
    imageSize: `${canvas.width}x${canvas.height}`,
  };
}

function evidenceForView(view, meteorology) {
  const evidence = {
    main: [...view.evidence.main],
    supporting: [...view.evidence.supporting],
    conflicting: [...view.evidence.conflicting],
    precursor: [...view.evidence.precursor],
  };
  if (view.scale === "medium" && meteorology?.evidence_summary) {
    const center = meteorology.points.find((point) => point.id === "aoi_center");
    evidence.supporting.push(
      `NASA POWER humidity support: AOI center RH ${center.mean_relative_humidity_percent}% over 03-09Z, dry-air support=${meteorology.evidence_summary.humidity_support}.`
    );
    evidence.supporting.push(
      `NASA POWER wind support is mixed: AOI center mean wind ${center.mean_wind_speed_m_s} m/s, inferred transport ${center.inferred_transport_to_cardinal}; west/east samples show stronger E-to-W flow.`
    );
    evidence.precursor.push(meteorology.evidence_summary.precursor_signal_summary);
  }
  return evidence;
}

function buildScaleOutput(example, view, derivedMask = null, meteorology = null) {
  const output = buildDemoDustMaskOutput(example);
  const cells = derivedMask?.cells || buildMaskCells(view.mask);
  const maskType = derivedMask ? "rendered-raster-threshold-grid" : "inline-demo-grid";
  const maskPath = derivedMask?.sourceImage || `inline:demo-${view.scale}-pixel-grid`;
  const targetToolId =
    view.scale === "coarse"
      ? "dust_mamba_adapter"
      : view.scale === "medium"
        ? "viirs_sandstorm_segmentation_adapter"
        : "sentinel_high_resolution_context";
  const actualToolId = derivedMask && view.mask.derivationToolId ? view.mask.derivationToolId : targetToolId;
  const maskSourceRequests = view.mask.derivationRequests || [view.mask.derivationRequest || view.request];
  const basemapSource = sourceLabelForRequest(view.request);
  const maskSource = maskSourceRequests.map(sourceLabelForRequest).join("; mask_source=");
  return {
    ...output,
    event_id: `dust-hexi-corridor-${view.scale}-2021-03`,
    tool_id: actualToolId,
    sensor: view.sensor,
    scale: view.scale,
    datetime: view.datetime,
    aoi: {
      bbox: view.request.bbox,
      crs: "EPSG:4326",
    },
    mask: {
      ...output.mask,
      type: maskType,
      threshold: derivedMask?.threshold ?? view.mask.threshold,
      mask_area_km2: derivedMask
        ? Math.round((cells.length / Math.max(1, view.mask.columns * view.mask.rows)) * view.mask.areaKm2)
        : view.mask.areaKm2,
      path: maskPath,
      display_grid: {
        columns: view.mask.columns,
        rows: view.mask.rows,
        cells,
      },
    },
    confidence: {
      score: null,
      level: derivedMask ? "low" : "unknown",
      reason: derivedMask
        ? "Mask 来自 GIBS 渲染产品颜色。它是真实数据派生的显示证据，但不是原始科学值阈值，也不是模型推理。"
        : "仅演示可视化。该尺度视图用于展示预期的逐像元 mask 密度和传感器绑定，未执行模型推理。",
    },
    evidence: evidenceForView(view, meteorology),
    meteorology:
      view.scale === "medium" && meteorology
        ? {
            source: meteorology.source,
            time_window_utc: meteorology.time_window_utc,
            summary: meteorology.evidence_summary,
          }
        : null,
    provenance: {
      model_name: derivedMask ? view.mask.derivationLabel || "GIBS rendered product threshold adapter" : view.modelTool,
      model_url:
        view.scale === "medium"
          ? "https://element84.com/machine-learning/segmenting-sandstorms-in-satellite-imagery/"
          : view.scale === "coarse"
            ? "https://github.com/Zjut-MultimediaPlus/Dust-Mamba"
            : "https://earth-search.aws.element84.com/v1",
      data_source: derivedMask ? `${basemapSource}; mask_source=${maskSource}` : basemapSource,
      checkpoint: "不可用",
      run_time: derivedMask ? new Date().toISOString() : "未运行",
      limitations: [
        ...(derivedMask
          ? ["渲染产品阈值", "不是模型推理", "不是原始产品像元值"]
          : ["支持可视化", "不是模型推理", "仅用于布局"]),
        view.outputStatus,
      ],
    },
    derivation: derivedMask
      ? {
          method: "GIBS 渲染图像颜色阈值",
          status: "executed",
          source_image: derivedMask.sourceImage,
          source_layer: derivedMask.sourceLayer,
          source_layers: derivedMask.sourceLayers || [derivedMask.sourceLayer],
          sample_grid: `${view.mask.columns}x${view.mask.rows}`,
          threshold: derivedMask.threshold,
          thresholds: derivedMask.thresholds,
          average_score: derivedMask.averageScore,
          image_size: derivedMask.imageSize,
          limitations: [
            view.mask.derivationRequests
              ? "阈值使用多个 GIBS PNG 渲染产品颜色交集"
              : "阈值使用 GIBS PNG 的渲染颜色像元",
            "不是原始科学值",
            "不是模型推理",
          ],
        }
      : {
          method: "内联支持网格",
          status: "支持可视化",
          source_image: "none",
          sample_grid: `${view.mask.columns}x${view.mask.rows}`,
          threshold: view.mask.threshold,
          limitations: ["不是模型推理", "仅用于布局"],
        },
  };
}

function maskSvg(maskOutput, extraClass = "") {
  const grid = maskOutput.mask.display_grid;
  const isRemoved = maskOutput.mask.pixel_class === "removed_candidate_pixel";
  const fill = isRemoved ? "#ffb000" : "#ff0000";
  const stroke = isRemoved ? "#ffd166" : "#ff4a4a";
  const polygons = grid.polygons || [];
  if (polygons.length) {
    const shapes = polygons
      .map((polygon) => {
        const opacity = 0.48 + Math.min(0.32, polygon.p * 0.25);
        const points = polygon.points.map(([x, y]) => `${x},${y}`).join(" ");
        return `<polygon points="${points}" fill="${fill}" fill-opacity="${opacity.toFixed(
          2
        )}" stroke="${stroke}" stroke-opacity="0.72" stroke-width="0.045" />`;
      })
      .join("");
    return `
      <svg class="dust-mask-svg ${extraClass}" viewBox="0 0 ${grid.columns} ${grid.rows}" preserveAspectRatio="none" aria-label="VIIRS native L2 pixel footprint dust anomaly mask">
        ${shapes}
      </svg>
    `;
  }
  const cells = grid.cells
    .map((cell) => {
      const cellFill = cell.color || fill;
      const cellStroke = cell.stroke || cellFill || stroke;
      const opacity = isRemoved ? 0.28 + Math.min(0.58, cell.p * 0.42) : 0.55 + Math.min(0.28, cell.p * 0.22);
      return `<rect x="${cell.x}" y="${cell.y}" width="0.94" height="0.94" fill="${cellFill}" fill-opacity="${opacity.toFixed(
        2
      )}" stroke="${cellStroke}" stroke-opacity="0.58" stroke-width="${isRemoved ? "0.055" : "0.035"}" />`;
    })
    .join("");
  return `
    <svg class="dust-mask-svg ${maskOutput.coalition ? "dust-coalition-mask-svg" : ""} ${extraClass}" viewBox="0 0 ${grid.columns} ${grid.rows}" preserveAspectRatio="none" aria-label="pixel-level dust anomaly mask">
      ${cells}
    </svg>
  `;
}

function supportMaskSvg(audit, extraClass = "") {
  if (!audit?.grid?.cells?.length) {
    return "";
  }
  const cells = audit.grid.cells
    .map((cell) => {
      const opacity = 0.22 + Math.min(0.54, cell.p * 0.38);
      return `<rect x="${cell.x}" y="${cell.y}" width="0.94" height="0.94" fill="#ff0000" fill-opacity="${opacity.toFixed(
        2
      )}" stroke="#ff4a4a" stroke-opacity="0.62" stroke-width="0.035" />`;
    })
    .join("");
  return `
    <svg class="dust-aot-support-svg ${extraClass}" viewBox="0 0 ${audit.grid.columns} ${audit.grid.rows}" preserveAspectRatio="none" aria-label="Sentinel-2 AOT aerosol support audit cells">
      ${cells}
    </svg>
  `;
}

function rawViirsMaskSvg(rawMask, extraClass = "") {
  const mask = rawMask?.mask;
  if (!mask?.cells?.length) {
    return "";
  }
  const cells = mask.cells
    .map((cell) => {
      const opacity = 0.42 + Math.min(0.46, (cell.max_aot / 5) * 0.42);
      return `<rect x="${cell.column}" y="${cell.row}" width="0.96" height="0.96" fill="#ff0000" fill-opacity="${opacity.toFixed(
        2
      )}" stroke="#ff4a4a" stroke-opacity="0.55" stroke-width="0.035" />`;
    })
    .join("");
  return `
    <svg class="dust-raw-viirs-mask-svg ${extraClass}" viewBox="0 0 ${mask.display_columns} ${mask.display_rows}" preserveAspectRatio="none" aria-label="Raw VIIRS Deep Blue pixel dust-support mask">
      ${cells}
    </svg>
  `;
}

function rawViirsFootprintSvg(footprintOutput, extraClass = "") {
  const mask = footprintOutput?.mask;
  if (!mask?.display_polygons?.length) {
    return "";
  }
  const polygons = mask.display_polygons
    .map((polygon) => {
      const opacity = 0.48 + Math.min(0.32, polygon.p * 0.25);
      const points = polygon.points.map(([x, y]) => `${x},${y}`).join(" ");
      return `<polygon points="${points}" fill="#ff0000" fill-opacity="${opacity.toFixed(
        2
      )}" stroke="#ff4a4a" stroke-opacity="0.72" stroke-width="0.045" />`;
    })
    .join("");
  return `
    <svg class="dust-raw-viirs-mask-svg ${extraClass}" viewBox="0 0 ${mask.display_columns} ${mask.display_rows}" preserveAspectRatio="none" aria-label="Raw VIIRS native pixel footprint dust-support mask">
      ${polygons}
    </svg>
  `;
}

function cellKey(cell) {
  return `${cell.x}:${cell.y}`;
}

function cellSet(output) {
  return new Set(output?.mask?.display_grid?.cells?.map(cellKey) || []);
}

function cellMap(output) {
  return new Map((output?.mask?.display_grid?.cells || []).map((cell) => [cellKey(cell), cell]));
}

function cloneOutputWithCells(output, cells, overrides = {}) {
  return {
    ...output,
    ...overrides,
    mask: {
      ...output.mask,
      ...(overrides.mask || {}),
      display_grid: {
        ...output.mask.display_grid,
        ...(overrides.mask?.display_grid || {}),
        cells,
      },
    },
    confidence: overrides.confidence || output.confidence,
    evidence: overrides.evidence || output.evidence,
    provenance: overrides.provenance || output.provenance,
    derivation: overrides.derivation || output.derivation,
  };
}

function buildRawViirsScienceOutput(baseOutput, rawMaskOutput) {
  const cells = rawMaskOutput.mask.cells.map((cell) => ({
    x: cell.column,
    y: cell.row,
    p: Math.min(1, cell.max_aot / 5),
    raw_pixel_count: cell.raw_pixel_count,
    mean_aot: cell.mean_aot,
    max_aot: cell.max_aot,
  }));
  return {
    ...baseOutput,
    tool_id: rawMaskOutput.tool_id,
    mask: {
      ...baseOutput.mask,
      type: rawMaskOutput.mask.type,
      path: "src/dust/examples/viirs_deep_blue_raw_mask_output.json",
      threshold: rawMaskOutput.threshold.aot_550_min,
      mask_area_km2: rawMaskOutput.mask.mask_area_km2_estimate,
      pixel_class: "dust_anomaly",
      display_grid: {
        columns: rawMaskOutput.mask.display_columns,
        rows: rawMaskOutput.mask.display_rows,
        cells,
      },
    },
    confidence: {
      score: null,
      level: "medium",
      reason:
        "Mask 来自已下载的 VIIRS Deep Blue L2 原始科学变量：Aerosol Type 0、QA >= 2、AOT550 >= 0.8。它是真实原始数据证据，不是学习模型推理。",
    },
    evidence: rawMaskOutput.evidence,
    provenance: {
      ...baseOutput.provenance,
      model_name: rawMaskOutput.provenance.model_name,
      model_url: rawMaskOutput.provenance.model_url,
      data_source: rawMaskOutput.provenance.data_source,
      checkpoint: "not applicable",
      run_time: rawMaskOutput.provenance.run_time,
      limitations: rawMaskOutput.provenance.limitations,
    },
    derivation: {
      method: "raw VIIRS Deep Blue L2 science-value threshold",
      status: rawMaskOutput.status,
      source_image: rawMaskOutput.provenance.l2_local_path,
      source_layer: "AOT550 + Aerosol_Type_Land_Ocean + QA_Flag_Land",
      sample_grid: `${rawMaskOutput.mask.display_columns}x${rawMaskOutput.mask.display_rows}`,
      threshold: rawMaskOutput.threshold.aot_550_min,
      thresholds: [
        { role: "aerosol_type", threshold: rawMaskOutput.threshold.aerosol_type },
        { role: "qa_land", threshold: `>= ${rawMaskOutput.threshold.qa_land_min}` },
        { role: "aot_550", threshold: `>= ${rawMaskOutput.threshold.aot_550_min}` },
      ],
      limitations: rawMaskOutput.provenance.limitations,
    },
  };
}

function buildRawViirsFootprintOutput(baseOutput, footprintOutput) {
  const polygons = footprintOutput.mask.display_polygons.map((polygon) => {
    const centerX = polygon.points.reduce((sum, point) => sum + point[0], 0) / polygon.points.length;
    const centerY = polygon.points.reduce((sum, point) => sum + point[1], 0) / polygon.points.length;
    return {
      x: Math.max(0, Math.min(footprintOutput.mask.display_columns - 1, Math.floor(centerX))),
      y: Math.max(0, Math.min(footprintOutput.mask.display_rows - 1, Math.floor(centerY))),
      p: polygon.p,
      points: polygon.points,
      raw_index: polygon.raw_index,
      native_column: polygon.column,
      native_row: polygon.row,
      aot_550: polygon.aot_550,
      qa_land: polygon.qa_land,
      area_km2: polygon.area_km2,
    };
  });
  return {
    ...baseOutput,
    tool_id: footprintOutput.tool_id,
    mask: {
      ...baseOutput.mask,
      type: footprintOutput.mask.type,
      path: footprintOutput.mask.geojson_path,
      threshold: footprintOutput.threshold.aot_550_min,
      mask_area_km2: footprintOutput.mask.native_area_km2_estimate,
      pixel_class: "dust_anomaly",
      display_grid: {
        columns: footprintOutput.mask.display_columns,
        rows: footprintOutput.mask.display_rows,
        cells: polygons,
        polygons,
      },
    },
    confidence: {
      score: null,
      level: "medium",
      reason:
        "Mask 来自原生 VIIRS Deep Blue L2 地理定位像元 footprint，条件为 Aerosol Type 0、QA >= 2、AOT550 >= 0.8。它是真实原始数据 footprint mask，不是学习模型推理。",
    },
    evidence: footprintOutput.evidence,
    provenance: {
      ...baseOutput.provenance,
      model_name: footprintOutput.provenance.model_name,
      model_url: footprintOutput.provenance.model_url,
      data_source: footprintOutput.provenance.data_source,
      checkpoint: "not applicable",
      run_time: footprintOutput.provenance.run_time,
      limitations: footprintOutput.provenance.limitations,
    },
    derivation: {
      method: "raw VIIRS Deep Blue L2 native geolocation footprint threshold",
      status: footprintOutput.status,
      source_image: footprintOutput.provenance.l2_local_path,
      source_layer: "AOT550 + Aerosol_Type_Land_Ocean + QA_Flag_Land + Latitude/Longitude",
      sample_grid: `${footprintOutput.mask.native_rows}x${footprintOutput.mask.native_columns} native swath`,
      threshold: footprintOutput.threshold.aot_550_min,
      thresholds: [
        { role: "aerosol_type", threshold: footprintOutput.threshold.aerosol_type },
        { role: "qa_land", threshold: `>= ${footprintOutput.threshold.qa_land_min}` },
        { role: "aot_550", threshold: `>= ${footprintOutput.threshold.aot_550_min}` },
      ],
      limitations: footprintOutput.provenance.limitations,
    },
  };
}

function buildViirsLearnedModelOutput(baseOutput, learnedOutput) {
  const cells = learnedOutput.mask.display_grid.cells.map((cell) => ({
    x: cell.x,
    y: cell.y,
    p: cell.p,
  }));
  return {
    ...baseOutput,
    current_aoi_inference: learnedOutput.current_aoi_inference,
    tool_id: learnedOutput.tool_id,
    mask: {
      ...baseOutput.mask,
      type: learnedOutput.mask.type,
      path: learnedOutput.mask.path,
      threshold: learnedOutput.mask.threshold,
      mask_area_km2: learnedOutput.mask.mask_area_km2_estimate,
      pixel_class: "dust_anomaly",
      display_grid: {
        columns: learnedOutput.mask.display_grid.columns,
        rows: learnedOutput.mask.display_grid.rows,
        cells,
      },
    },
    confidence: learnedOutput.confidence,
    evidence: {
      main: [
        `learned VIIRS pixel classifier mask detected ${cells.length.toLocaleString("en-US")} cells`,
        `mask area estimate ${learnedOutput.mask.mask_area_km2_estimate.toLocaleString("en-US")} km2`,
        `threshold ${learnedOutput.mask.threshold}, validation F1 ${learnedOutput.metrics.validation.f1}`,
      ],
      supporting: [
        `trained from ${learnedOutput.training_data.samples.toLocaleString("en-US")} current-AOI VIIRS RGB cells with Deep Blue L2 weak labels`,
        `${learnedOutput.training_data.positive_label_cells.toLocaleString("en-US")} weak positive cells came from VIIRS Deep Blue L2 footprint rasterization`,
        "VIIRS corrected reflectance gives the visible plume context for the learned mask",
      ],
      conflicting: [
        "not Element84 public weights",
        "weak labels come from VIIRS Deep Blue threshold footprints",
        "spatial holdout validation is inside the same AOI, not independent operational validation",
        "not Dust-Mamba FY-4A/LSDSSIMR inference",
      ],
      precursor: [
        "next precision step should replace weak labels with curated dust labels or execute Dust-Mamba once checkpoint/data are local",
      ],
    },
    provenance: learnedOutput.provenance,
    derivation: {
      method: "local learned VIIRS RGB pixel classifier trained with Deep Blue L2 weak labels",
      status: learnedOutput.status,
      source_image: learnedOutput.training_data.image,
      source_layer: "VIIRS corrected reflectance RGB + weak labels from VIIRS Deep Blue L2 footprint mask",
      sample_grid: `${learnedOutput.mask.display_grid.columns}x${learnedOutput.mask.display_grid.rows}`,
      threshold: learnedOutput.mask.threshold,
      thresholds: [
        { role: "model_probability", threshold: `>= ${learnedOutput.mask.threshold}` },
        { role: "weak_label_source", threshold: "VIIRS Deep Blue L2 footprint rasterization" },
      ],
      average_score: learnedOutput.confidence.score,
      limitations: learnedOutput.provenance.limitations,
    },
    learned_model: {
      status: learnedOutput.status,
      metrics: learnedOutput.metrics,
      probability_map_path: learnedOutput.mask.probability_map_path,
      overlay_path: learnedOutput.mask.overlay_path,
      checkpoint: learnedOutput.provenance.checkpoint,
      display_policy: learnedOutput.display_policy,
    },
  };
}

function buildViirsMultichannelModelOutput(baseOutput, modelOutput) {
  const cells = modelOutput.mask.display_grid.cells.map((cell) => ({
    x: cell.x,
    y: cell.y,
    p: cell.p,
  }));
  return {
    ...baseOutput,
    current_aoi_inference: modelOutput.current_aoi_inference,
    tool_id: modelOutput.tool_id,
    mask: {
      ...baseOutput.mask,
      type: modelOutput.mask.type,
      path: modelOutput.mask.path,
      threshold: modelOutput.mask.threshold,
      mask_area_km2: modelOutput.mask.mask_area_km2_estimate,
      pixel_class: "dust_anomaly",
      display_grid: {
        columns: modelOutput.mask.display_grid.columns,
        rows: modelOutput.mask.display_grid.rows,
        cells,
      },
    },
    confidence: modelOutput.confidence,
    evidence: {
      main: [
        `multichannel VIIRS segmentation head detected ${cells.length.toLocaleString("en-US")} cells`,
        `mask area estimate ${modelOutput.mask.mask_area_km2_estimate.toLocaleString("en-US")} km2`,
        `threshold ${modelOutput.mask.threshold}, validation F1 ${modelOutput.metrics.validation.f1}`,
      ],
      supporting: [
        "inputs are real current-AOI VIIRS corrected reflectance, Deep Blue AOT and Aerosol Type products",
        `${modelOutput.training_data.positive_label_cells.toLocaleString("en-US")} weak positive cells came from VIIRS Deep Blue L2 footprint rasterization`,
        "the model now learns from multispectral/aerosol support channels instead of RGB alone",
      ],
      conflicting: [
        "not Element84 public weights",
        "weak labels come from VIIRS Deep Blue threshold footprints",
        "same-AOI spatial holdout is not independent operational validation",
        "not Dust-Mamba FY-4A/LSDSSIMR inference",
      ],
      precursor: [
        "next precision step should train on curated dust labels or execute Dust-Mamba once checkpoint/data are local",
      ],
    },
    provenance: modelOutput.provenance,
    derivation: {
      method: "local VIIRS multichannel weak-label segmentation head",
      status: modelOutput.status,
      source_image: modelOutput.training_data.corrected_reflectance,
      source_layer: "VIIRS corrected reflectance RGB + Deep Blue AOT + Aerosol Type + L2 weak labels",
      sample_grid: `${modelOutput.mask.display_grid.columns}x${modelOutput.mask.display_grid.rows}`,
      threshold: modelOutput.mask.threshold,
      thresholds: [
        { role: "model_probability", threshold: `>= ${modelOutput.mask.threshold}` },
        { role: "weak_label_source", threshold: "VIIRS Deep Blue L2 footprint rasterization" },
      ],
      average_score: modelOutput.confidence.score,
      limitations: modelOutput.provenance.limitations,
    },
    learned_model: {
      status: modelOutput.status,
      metrics: modelOutput.metrics,
      probability_map_path: modelOutput.mask.probability_map_path,
      overlay_path: modelOutput.mask.overlay_path,
      checkpoint: modelOutput.provenance.checkpoint,
      display_policy: modelOutput.display_policy,
    },
  };
}

function buildMultiAgentCoalitionOutput(comparison) {
  const base = comparison?.multichannel || comparison?.learned || comparison?.shapeFiltered;
  if (!base?.mask?.display_grid?.cells?.length) {
    return null;
  }
  const rawFootprint = cellSet(comparison.rawFootprint);
  const rawScience = cellSet(comparison.rawScience);
  const refined = cellSet(comparison.refined);
  const learned = cellMap(comparison.learned);
  const agents = {
    viirs_multichannel: {
      label: "VIIRS 多通道模型智能体",
      color: "#ff2d2d",
      role: "主学习检测器",
      contribution: "基于 RGB + AOT + Aerosol Type 多通道提出 dust/not-dust 像元",
    },
    viirs_l2_footprint: {
      label: "VIIRS 原始 L2 footprint 智能体",
      color: "#ff9f1c",
      role: "原始像元确认",
      contribution: "当 Deep Blue L2 原始 footprint 支持模型像元时成为主导贡献",
    },
    aerosol_evidence: {
      label: "AOT + Aerosol Type 互证智能体",
      color: "#f6d32d",
      role: "气溶胶互证",
      contribution: "当气溶胶产品提供最强非模型支持时成为主导贡献",
    },
    rgb_weak_label: {
      label: "Element84-style RGB 弱标签智能体",
      color: "#9b5cff",
      role: "可见羽流迁移基线",
      contribution: "当 RGB 弱标签模型同意且无更强原始 footprint 支持时成为主导贡献",
    },
  };
  const summary = Object.fromEntries(
    Object.entries(agents).map(([id, agent]) => [
      id,
      {
        ...agent,
        dominant_cells: 0,
        supported_cells: 0,
      },
    ])
  );
  let supportedByAny = 0;
  let supportedByTwoOrMore = 0;
  const cells = base.mask.display_grid.cells.map((cell) => {
    const key = cellKey(cell);
    const support = {
      viirs_multichannel: true,
      viirs_l2_footprint: rawFootprint.has(key),
      aerosol_evidence: refined.has(key) || rawScience.has(key),
      rgb_weak_label: learned.has(key),
    };
    const supportCount = Object.values(support).filter(Boolean).length;
    if (supportCount > 1) {
      supportedByAny += 1;
    }
    if (supportCount >= 3) {
      supportedByTwoOrMore += 1;
    }
    for (const [id, ok] of Object.entries(support)) {
      if (ok) {
        summary[id].supported_cells += 1;
      }
    }
    let dominant = "viirs_multichannel";
    if (support.viirs_l2_footprint && rawScience.has(key)) {
      dominant = "viirs_l2_footprint";
    } else if (support.aerosol_evidence) {
      dominant = "aerosol_evidence";
    } else if (support.rgb_weak_label) {
      dominant = "rgb_weak_label";
    }
    summary[dominant].dominant_cells += 1;
    return {
      ...cell,
      color: agents[dominant].color,
      stroke: agents[dominant].color,
      dominant_agent: dominant,
      dominant_agent_label: agents[dominant].label,
      contribution_mode: agents[dominant].role,
      coalition_votes: Object.entries(support)
        .filter(([, ok]) => ok)
        .map(([id]) => id),
      coalition_support_count: supportCount,
      rgb_baseline_probability: learned.get(key)?.p ?? null,
    };
  });
  return {
    ...base,
    tool_id: "multi_agent_coalition_mask_adapter",
    current_aoi_inference: base.current_aoi_inference || "learned_model_inference_from_current_aoi_weak_labels",
    mask: {
      ...base.mask,
      path: "src/dust/dustAgentPage.mjs#multi-agent-coalition-mask",
      color: "#ff2d2d",
      display_grid: {
        ...base.mask.display_grid,
        cells,
      },
    },
    confidence: {
      score: base.confidence?.score ?? null,
      level: base.confidence?.level || "medium",
      reason:
        "当前中尺度 mask 是多智能体协同决策视图：已执行的 VIIRS 多通道模型提出沙尘像元，随后 L2 footprint、AOT/Aerosol Type 和 RGB 弱标签智能体逐像元竞争，颜色表示主导贡献方。",
    },
    evidence: {
      main: [
        `协同最终 mask 保留 ${cells.length.toLocaleString("en-US")} 个 VIIRS 模型提出的沙尘像元`,
        `${supportedByAny.toLocaleString("en-US")} 个像元至少有一个非模型证据智能体互证`,
        "像元颜色表示主导贡献方，而不是单一平铺红色层",
      ],
      supporting: [
        `原始 L2 footprint 支持 ${summary.viirs_l2_footprint.supported_cells.toLocaleString("en-US")} 个协同像元`,
        `AOT/Aerosol Type 支持 ${summary.aerosol_evidence.supported_cells.toLocaleString("en-US")} 个协同像元`,
        `RGB 弱标签基线同意 ${summary.rgb_weak_label.supported_cells.toLocaleString("en-US")} 个协同像元`,
      ],
      conflicting: [
        "这是对已执行模型和当前数据输出的仲裁层，不是 Dust-Mamba 推理。",
        "烟羽、活火和火烧区模型未运行时仍保持 unknown，不会增加沙尘置信度。",
        "弱标签来自 VIIRS Deep Blue 阈值，不是独立人工精标沙尘标签。",
      ],
      precursor: [
        "下一轮应在 checkpoint 和数据就绪后，用 Dust-Mamba/LSDSSIMR 或公开精标沙尘 mask 替换弱标签。",
        `${supportedByTwoOrMore.toLocaleString("en-US")} 个像元有两个及以上非模型/支持智能体互证，适合做 PPT 放大讲解。`,
      ],
    },
    derivation: {
      ...base.derivation,
      method: "multi-agent pixel arbitration over VIIRS multichannel model, raw L2 footprint, aerosol products and RGB weak-label baseline",
      status: "executed multi-agent coalition mask",
      coalition_rule:
        "The multichannel VIIRS model proposes active dust cells; each active cell is colored by the strongest corroborating agent: raw L2 footprint, aerosol support, RGB weak-label agreement, or model-led only.",
      dominant_agent_summary: summary,
      supported_by_any_non_model_agent: supportedByAny,
      supported_by_two_or_more_non_model_agents: supportedByTwoOrMore,
      limitations: [
        "coalition display layer, not a newly trained neural network",
        "not Dust-Mamba or Element84 public weights",
        "dominance colors explain contribution, not separate semantic classes",
      ],
    },
    coalition: {
      agents: summary,
      active_cells: cells.length,
      supported_by_any_non_model_agent: supportedByAny,
      supported_by_two_or_more_non_model_agents: supportedByTwoOrMore,
      decision_rule:
        "模型先提出，原始 footprint、气溶胶产品和 RGB 基线共同投票，主导贡献方决定像元颜色",
    },
  };
}

function buildRemovedCandidateOutput(baseline, refined) {
  const refinedKeys = new Set(refined.mask.display_grid.cells.map(cellKey));
  const removedCells = baseline.mask.display_grid.cells.filter((cell) => !refinedKeys.has(cellKey(cell)));
  const baselineCells = baseline.mask.display_grid.cells.length;
  const removedArea = Math.round((removedCells.length / Math.max(1, baselineCells)) * baseline.mask.mask_area_km2);
  return cloneOutputWithCells(baseline, removedCells, {
    tool_id: "gibs_rendered_aot_removed_candidate_view",
    mask: {
      pixel_class: "removed_candidate_pixel",
      color: "#ffb000",
      mask_area_km2: removedArea,
    },
    confidence: {
      score: null,
      level: "low",
      reason:
        "这些像元通过了渲染 AOT 支持阈值，但未通过渲染 Aerosol Type 交集。它们显示为被移除候选，不是 active 沙尘异常。",
    },
    evidence: {
      main: [
        "被移除候选通过了 AOT-only 渲染支持阈值。",
        "它们未通过更严格的 AOT + Aerosol Type 渲染产品交集。",
        "该图层解释 active 中尺度红色 mask 是如何收紧的。",
      ],
      supporting: [
        "Aerosol Type 作为第二个同日 VIIRS 支持产品。",
        "显示被移除候选有助于在真正模型推理接入前审计精度取舍。",
      ],
      conflicting: [
        "被移除候选不能解释为已确认沙尘异常像元。",
        "渲染颜色评分仍可能产生产品色带误差。",
      ],
      precursor: [
        "被移除候选图层未计算额外气象先兆。",
      ],
    },
    derivation: {
      ...baseline.derivation,
      method: "AOT-only 候选像元减去 AOT + Aerosol Type 交集像元",
      status: "已执行对比视图",
      limitations: [
        "仅对比图层",
        "不是 active 异常 mask",
        "不是模型推理",
        "不是原始科学值",
      ],
    },
  });
}

function connectedComponents(cells) {
  const byKey = new Map(cells.map((cell) => [cellKey(cell), cell]));
  const visited = new Set();
  const components = [];
  for (const cell of cells) {
    const startKey = cellKey(cell);
    if (visited.has(startKey)) {
      continue;
    }
    const stack = [cell];
    const component = [];
    visited.add(startKey);
    while (stack.length) {
      const current = stack.pop();
      component.push(current);
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) {
            continue;
          }
          const nextKey = `${current.x + dx}:${current.y + dy}`;
          const next = byKey.get(nextKey);
          if (next && !visited.has(nextKey)) {
            visited.add(nextKey);
            stack.push(next);
          }
        }
      }
    }
    components.push(component);
  }
  return components;
}

function componentSummary(component) {
  const xs = component.map((cell) => cell.x);
  const ys = component.map((cell) => cell.y);
  const width = Math.max(...xs) - Math.min(...xs) + 1;
  const height = Math.max(...ys) - Math.min(...ys) + 1;
  const meanProbability =
    component.reduce((sum, cell) => sum + cell.p, 0) / Math.max(1, component.length);
  return {
    size: component.length,
    width,
    height,
    meanProbability: Number(meanProbability.toFixed(2)),
    cells: component,
  };
}

function buildShapeFilteredOutput(refined) {
  const components = connectedComponents(refined.mask.display_grid.cells)
    .map(componentSummary)
    .sort((a, b) => b.size - a.size);
  const largest = components[0]?.size || 0;
  const keptComponents = components.filter((component) => component.size >= 3 || component.size >= largest * 0.18);
  const keptCells = keptComponents.flatMap((component) => component.cells);
  const retainedIntersection = !keptCells.length && refined.mask.display_grid.cells.length > 0;
  const displayedComponents = retainedIntersection ? components : keptComponents;
  const finalCells = retainedIntersection ? refined.mask.display_grid.cells : keptCells;
  const removedByShape = refined.mask.display_grid.cells.length - finalCells.length;
  const area = Math.round(
    (finalCells.length / Math.max(1, refined.mask.display_grid.cells.length)) * refined.mask.mask_area_km2
  );
  const shapeMain =
    removedByShape > 0
      ? [
          "像元先通过同传感器 VIIRS AOT + Aerosol Type 渲染支持。",
          "默认 active 红色 mask 显示前，已移除小型孤立连通域。",
          "剩余像元被视为更收紧的中尺度 active 异常支持 mask。",
        ]
      : [
          "像元先通过同传感器 VIIRS AOT + Aerosol Type 渲染支持。",
          "本 AOI 下形态筛选未移除额外像元，因此保留 active 交集 mask。",
          "剩余像元仍视为中尺度异常支持证据，不是模型推理。",
        ];
  const shapeSupporting =
    removedByShape > 0
      ? [
          "羽流形态筛选通过减少孤立渲染产品伪影来提升截图精度。",
          "被丢弃像元仍可通过交集层和被移除候选层审计。",
        ]
      : [
          "形态门控仍作为可审计精度步骤运行，但当前规则下该案例没有额外可移除连通域。",
          "形态筛选前被拒绝的 AOT-only 像元仍可在被移除候选层审计。",
        ];

  return cloneOutputWithCells(refined, finalCells, {
    tool_id: "gibs_rendered_plume_shape_filter_adapter",
    mask: {
      pixel_class: "dust_anomaly",
      mask_area_km2: area,
    },
    confidence: {
      score: null,
      level: "low",
      reason:
        "Active 红色像元先通过渲染 AOT + Aerosol Type 支持，再通过连通域羽流形态筛选。这是面向精度的后处理，不是模型推理。",
    },
    evidence: {
      main: shapeMain,
      supporting: shapeSupporting,
      conflicting: [
        "该后处理不是训练后的 VIIRS 沙尘分割模型。",
        "渲染颜色评分仍可能误读产品调色板颜色。",
      ],
      precursor: [
        "气象先兆仍是 NASA POWER 点证据，不是网格化 ERA5/MERRA-2 场。",
      ],
    },
    derivation: {
      ...refined.derivation,
      method: "AOT + Aerosol Type 交集后接连通域羽流形态筛选",
      status: "已执行形态筛选后处理",
      component_count: components.length,
      kept_component_count: displayedComponents.length,
      removed_by_shape: removedByShape,
      retained_intersection_without_shape_removal: retainedIntersection,
      component_summary: components.map(({ size, width, height, meanProbability }) => ({
        size,
        width,
        height,
        mean_probability: meanProbability,
      })),
      limitations: [
        "shape filter is a precision postprocess, not a learned dust model",
        "not raw scientific values",
        "not model inference",
      ],
    },
  });
}

function buildHighResolutionAotOutput(output, rawAotAudit) {
  if (!rawAotAudit?.grid?.cells?.length) {
    return output;
  }
  const cells = rawAotAudit.grid.cells.map((cell) => ({
    x: cell.x,
    y: cell.y,
    p: cell.p,
    value: cell.value,
    ndvi: cell.ndvi,
    brightness: cell.brightness,
  }));
  const spectralRule = rawAotAudit.spectral_support?.rule || "AOT q95 support";
  const totalCells = Math.max(1, rawAotAudit.grid.columns * rawAotAudit.grid.rows);
  const area = Math.round((cells.length / totalCells) * output.mask.mask_area_km2);
  return cloneOutputWithCells(output, cells, {
    tool_id: "sentinel2_raw_aot_cog_audit_adapter",
    sensor: "Sentinel-2 L2A AOT + B04/B08 + SCL COG + visual thumbnail",
    mask: {
      type: "raw-cog-aot-ndvi-source-grid",
      pixel_class: "high_resolution_aot_source_support",
      threshold: rawAotAudit.grid.threshold_value,
      mask_area_km2: area,
      path: rawAotAudit.source_url,
      color: "#ff0000",
      opacity: 0.55,
      display_grid: {
        columns: rawAotAudit.grid.columns,
        rows: rawAotAudit.grid.rows,
        cells,
      },
    },
    confidence: {
      score: null,
      level: "low",
      reason:
        "高分辨率红色像元来自真实同日 Sentinel-2 L2A AOT 与 B04/B08 NDVI，并经过 SCL 云 / 水体 / 冰雪筛选。由于未运行 Sentinel-2 沙尘分割模型，它们仍是支持上下文。",
    },
    evidence: {
      main: [
        "Sentinel-2 可视缩略图来自真实同日 STAC COG 场景。",
        `SCL 筛选后的原始 Sentinel-2 AOT + 低 NDVI 源区规则保留 ${cells.length} 个高分辨率支持像元。`,
        "同日原始 COG 支持不是 dust / not-dust 语义分割。",
      ],
      supporting: [
        "高 AOT 像元有助于在更细尺度检查气溶胶上下文。",
        "SCL 会在支持规则前去除云、云影、水体、雪 / 冰和无效类别。",
        "B04/B08 NDVI 与亮度值增加裸地 / 源区合理性证据。",
        "COG 读取使用原始 Sentinel-2 值，而不是渲染调色板颜色。",
      ],
      conflicting: [
        "这只是 AOT + 源区支持，不是 dust / not-dust 语义分割。",
        "烟羽、活火和火烧区检查在对应模型运行前仍为未知。",
      ],
      precursor: [
        "需结合中尺度 VIIRS 支持和气象证据使用；没有 Sentinel-2 沙尘模型时不要提升为沙尘 mask。",
      ],
    },
    provenance: {
      model_name: "Sentinel-2 L2A SCL-screened AOT + B04/B08 COG support sampler",
      model_url: "https://earth-search.aws.element84.com/v1",
      data_source: rawAotAudit.source_urls
        ? `${rawAotAudit.source_urls.aot}; ${rawAotAudit.source_urls.red}; ${rawAotAudit.source_urls.nir}`
        : rawAotAudit.source_url,
      checkpoint: "not applicable",
      run_time: new Date().toISOString(),
      limitations: [
        "原始 Sentinel-2 SCL/AOT/B04/B08 值，不是沙尘模型",
        "同日但为局部 MGRS 瓦片 footprint，且云量较高",
        "仅支持上下文",
      ],
    },
    derivation: {
      method: spectralRule,
      status: rawAotAudit.status || "executed raw COG sampling audit",
      source_image: rawAotAudit.source_url,
      source_layer: "Sentinel-2 L2A AOT + B04/B08 + SCL",
      sample_grid: `${rawAotAudit.grid.columns}x${rawAotAudit.grid.rows}`,
      threshold: rawAotAudit.grid.threshold_value,
      threshold_quantile: rawAotAudit.grid.threshold_quantile,
      ndvi_threshold: rawAotAudit.spectral_support?.ndvi_threshold,
      brightness_threshold: rawAotAudit.spectral_support?.brightness_threshold,
      valid_cells: rawAotAudit.grid.valid_cells,
      support_cells: cells.length,
      limitations: rawAotAudit.limitations,
    },
  });
}

function buildMediumPixelEvidence(comparison, meteorology) {
  if (!comparison) {
    return null;
  }
  const activeCells = comparison.shapeFiltered.mask.display_grid.cells;
  const intersectionCells = comparison.refined.mask.display_grid.cells;
  const baselineCells = comparison.baseline.mask.display_grid.cells;
  const removedCandidateCells = comparison.removed.mask.display_grid.cells;
  const activeKeys = new Set(activeCells.map(cellKey));
  const retainedIntersection = Boolean(
    comparison.shapeFiltered.derivation?.retained_intersection_without_shape_removal
  );
  const components = connectedComponents(activeCells).map((cells, index) => ({ index: index + 1, cells }));
  const componentByCell = new Map(
    components.flatMap((component) => component.cells.map((cell) => [cellKey(cell), component.index]))
  );
  const areaPerActiveCell =
    activeCells.length > 0 ? comparison.shapeFiltered.mask.mask_area_km2 / activeCells.length : null;
  const sourceScoresFor = (cell) =>
    (cell.source_scores || []).map((score) => ({
      role: score.role,
      score: score.score,
      threshold: score.threshold,
      passed: score.passed,
    }));
  const active = activeCells
    .map((cell) => ({
      id: `m_${String(cell.x).padStart(2, "0")}_${String(cell.y).padStart(2, "0")}`,
      x: cell.x,
      y: cell.y,
      display_probability: cell.p,
      evidence_score: cell.evidence_score ?? cell.p,
      source_scores: sourceScoresFor(cell),
      component_id: componentByCell.get(cellKey(cell)) || null,
      estimated_area_km2: areaPerActiveCell === null ? null : Number(areaPerActiveCell.toFixed(2)),
      decision: "kept_as_active_red_pixel",
      reasons: [
        "通过 VIIRS 渲染 Deep Blue AOT 支持阈值",
        "通过 VIIRS 渲染 Aerosol Type 支持阈值",
        retainedIntersection
          ? "形态门控保留完整交集，因为渲染支持像元中没有更大的羽流连通域"
          : "被连通域羽流形态筛选保留",
      ],
    }))
    .sort((a, b) => b.evidence_score - a.evidence_score);
  const removedByShape = intersectionCells
    .filter((cell) => !activeKeys.has(cellKey(cell)))
    .map((cell) => ({
      id: `m_${String(cell.x).padStart(2, "0")}_${String(cell.y).padStart(2, "0")}`,
      x: cell.x,
      y: cell.y,
      display_probability: cell.p,
      evidence_score: cell.evidence_score ?? cell.p,
      source_scores: sourceScoresFor(cell),
      decision: "removed_by_shape_filter",
      reasons: [
        "通过渲染 AOT + Aerosol Type 支持",
        "作为孤立或弱羽流形态连通域被移除",
      ],
    }));
  const removedByAerosolType = removedCandidateCells
    .map((cell) => ({
      id: `m_${String(cell.x).padStart(2, "0")}_${String(cell.y).padStart(2, "0")}`,
      x: cell.x,
      y: cell.y,
      display_probability: cell.p,
      evidence_score: cell.evidence_score ?? cell.p,
      source_scores: sourceScoresFor(cell),
      decision: "removed_by_aerosol_type_gate",
      reasons: [
        "通过渲染 AOT 候选阈值",
        "未出现在更严格的 AOT + Aerosol Type 交集中",
      ],
    }))
    .slice(0, 24);
  return {
    round: "dust-round-028",
    tool_id: "hexi_medium_pixel_evidence_table_adapter",
    event_id: comparison.shapeFiltered.event_id,
    sensor: comparison.shapeFiltered.sensor,
    scale: "medium",
    datetime: comparison.shapeFiltered.datetime,
    actual_model_runs: [],
    status: "executed_display_pixel_evidence_table",
    current_aoi_inference: "not_model_inference",
    precision_summary: {
      aot_only_candidate_pixels: baselineCells.length,
      aot_aerosol_type_intersection_pixels: intersectionCells.length,
      shape_filtered_active_pixels: activeCells.length,
      removed_by_aerosol_type_gate: removedCandidateCells.length,
      removed_by_shape_filter: removedByShape.length,
      active_mask_area_km2: comparison.shapeFiltered.mask.mask_area_km2,
      active_components: components.length,
      meteorology_context:
        meteorology?.evidence_summary?.transport_direction || "气象上下文不可用",
    },
    active_pixels: active,
    removed_by_shape: removedByShape,
    removed_by_aerosol_type_gate: removedByAerosolType,
    evidence: {
      main: [
        "每个中尺度 active 红色像元都有逐像元证据记录。",
        "该表记录 AOT 支持、Aerosol Type 支持和羽流形态筛选决策。",
      ],
      supporting: [
        "这让截图 mask 可在像元格级别审计，而不是只作为视觉 overlay。",
        "被移除候选像元仍作为精度审计记录可见。",
      ],
      conflicting: [
        "评分来自渲染 GIBS 产品，不是原始科学数组。",
        "该表不是 VIIRS 语义分割模型输出。",
      ],
      precursor: [
        "风场 / 湿度上下文仍是独立的 NASA POWER 点采样证据记录。",
      ],
    },
    display_policy:
      "用该表解释每个红色显示像元为何被保留。不要提升为真实模型推理。",
  };
}

function buildScaleTransitionTrace({
  outputs,
  mediumPixelEvidence,
  multiscalePixelLockAudit,
  highResolutionSceneSelection,
  meteorology,
  confounderEvidence,
}) {
  const coarse = outputs.coarse;
  const medium = outputs.medium;
  const high = outputs.high;
  const highSelected = highResolutionSceneSelection?.selected;
  const learnedMedium =
    medium.current_aoi_inference === "learned_model_inference_from_current_aoi_weak_labels";
  return {
    round: "dust-round-043",
    tool_id: "hexi_scale_transition_trace_adapter",
    event_id: "hexi-corridor-2021-03-15",
    status: "executed_display_transition_trace",
    current_aoi_inference: medium.current_aoi_inference || "not_model_inference",
    actual_model_runs: learnedMedium ? [medium.tool_id] : [],
    transition_summary: {
      coarse_alert_pixels: coarse.mask.display_grid.cells.length,
      medium_candidate_pixels: mediumPixelEvidence?.precision_summary?.aot_only_candidate_pixels || null,
      medium_active_pixels: medium.mask.display_grid.cells.length,
      high_context_pixels: high.mask.display_grid.cells.length,
      high_temporal_offset_days: highSelected?.temporal_offset_days ?? null,
      model_promotion: learnedMedium ? "weak_label_model_executed" : "blocked",
    },
    steps: [
      {
        id: "coarse_discovery",
        label: "步骤 1 低分辨率发现",
        scale: "coarse",
        sensor: coarse.sensor,
        datetime: coarse.datetime,
        tool_id: coarse.tool_id,
        red_pixels: coarse.mask.display_grid.cells.length,
        mask_area_km2: coarse.mask.mask_area_km2,
        evidence_status: coarse.derivation.status,
        agent_use: "区域异常告警面",
        reasoning:
          "AIRS Dust Score 渲染支持像元在河西走廊 AOI 上识别出区域异常。它缩小搜索范围，但不是 Dust-Mamba 推理。",
        limitations: [
          "GIBS 渲染产品支持",
          "不是原始科学值",
          "不是模型推理",
        ],
      },
      {
        id: "medium_localization",
        label: "步骤 2 中分辨率锁定",
        scale: "medium",
        sensor: medium.sensor,
        datetime: medium.datetime,
        tool_id: medium.tool_id,
        candidate_pixels: mediumPixelEvidence?.precision_summary?.aot_only_candidate_pixels || 0,
        red_pixels: medium.mask.display_grid.cells.length,
        removed_pixels: mediumPixelEvidence?.precision_summary?.removed_by_aerosol_type_gate || 0,
        mask_area_km2: medium.mask.mask_area_km2,
        evidence_status: medium.derivation.status,
        agent_use: "羽流边界锁定",
        reasoning: learnedMedium
          ? "智能体切换到 VIIRS corrected reflectance，并运行用 VIIRS Deep Blue L2 footprint 弱标签训练的当前 AOI 学习像元分类器。"
          : "智能体切换到 VIIRS corrected reflectance，并叠加通过 Aerosol Type、QA 和 AOT550 阈值的 VIIRS Deep Blue L2 地理定位 footprint 像元。",
        limitations: medium.derivation.limitations,
      },
      {
        id: "high_interpretation",
        label: "步骤 3 高分辨率解释",
        scale: "high",
        sensor: high.sensor,
        datetime: high.datetime,
        tool_id: high.tool_id,
        red_pixels: high.mask.display_grid.cells.length,
        mask_area_km2: high.mask.mask_area_km2,
        evidence_status: high.derivation.status,
        agent_use: "源区和混淆项解释",
        reasoning:
          "选中的 Sentinel-2 场景是同日原始 COG 证据，可用于源区与混淆项上下文，但不是沙尘分割。",
        limitations: [
          "同日局部瓦片",
          "SCL 筛选后的原始 Sentinel-2 AOT + B04/B08 低 NDVI 源区支持",
          "不是沙尘分割",
          "仅支持证据",
        ],
      },
    ],
    transitions: [
      {
        id: "coarse_to_medium",
        from: "coarse_discovery",
        to: "medium_localization",
        status: "display_trace_executed",
        retained_signal:
          `${coarse.mask.display_grid.cells.length} 个粗尺度告警像元引导智能体进入 ${mediumPixelEvidence?.precision_summary?.aot_only_candidate_pixels || 0} 个 VIIRS AOT 候选像元。`,
        precision_gain: learnedMedium
          ? `${medium.mask.display_grid.cells.length} 个当前 AOI 学习模型像元替代原始支持像元，成为默认中尺度羽流 mask。`
          : `渲染 AOT 候选被 ${medium.mask.display_grid.cells.length} 个原始 VIIRS L2 地理定位 footprint 像元替代，用于中尺度羽流定位。`,
        evidence: [
          "同一河西走廊 AOI",
          "粗 / 中尺度 GIBS 产品使用同一事件日期",
          "VIIRS corrected reflectance 作为中尺度可视化底图",
        ],
      },
      {
        id: "medium_to_high",
        from: "medium_localization",
        to: "high_interpretation",
        status: "supporting_only",
        retained_signal:
          `${medium.mask.display_grid.cells.length} 个中尺度 active 红色像元为高分辨率上下文审查提供目标走廊。`,
        precision_gain:
          "高分辨率同日场景只改善源区 / 混淆项上下文；没有 Sentinel-2 沙尘模型时不会改善沙尘 mask。",
        evidence: [
          `Sentinel-2 选中场景 ${highSelected?.id || "S2A_46SEJ_20210315_2_L2A"}`,
          `时间偏移 +${highSelected?.temporal_offset_days ?? 0} 天`,
          `云量 ${highSelected?.cloud_cover ?? "未知"}`,
        ],
      },
    ],
    agent_assessment: learnedMedium
      ? "智能体可以展示从粗尺度支持告警，到中尺度当前 AOI VIIRS 学习像元定位，再到高分辨率上下文解释的尺度递进。当前 active 学习 mask 来自弱标签监督，不能表述为 Element84 公开权重或 Dust-Mamba 推理。"
      : "智能体可以展示从粗尺度支持告警，到中尺度 VIIRS 像元定位，再到高分辨率上下文解释的尺度递进。该过程可审计，但在传感器专属沙尘模型产出当前 AOI mask 前仍是支持证据。",
    evidence: {
      main: [
        "粗尺度告警像元、中尺度候选像元和中尺度 active 红色像元已在同一条路径中串联。",
        "高分辨率步骤是同日影像，但因未运行 Sentinel-2 沙尘模型，明确标注为仅支持解释。",
      ],
      supporting: [
        `气象上下文：${meteorology?.evidence_summary?.transport_direction || "未知"}。`,
        `多尺度导出要素数：${multiscalePixelLockAudit?.geojson?.feature_count || "未知"}。`,
      ],
      conflicting: [
        learnedMedium ? "中尺度模型使用弱标签训练，不是人工精标沙尘标签。" : "尺度递进本身不是模型运行。",
        "没有模型运行时，高分辨率 Sentinel-2 不能解释为沙尘分割。",
        `${confounderEvidence?.checks?.filter((check) => check.result === "unknown").length || 0} 个混淆项检查仍为未知。`,
      ],
      precursor: [
        learnedMedium
          ? "下一步精度提升应使用公开 / 人工沙尘标签或 Dust-Mamba FY-4A 推理替换弱标签。"
          : "下一步精度提升应使用原始 VIIRS 科学值或 Dust-Mamba 推理替代渲染产品支持像元。",
      ],
    },
    display_policy:
      learnedMedium
        ? "用这条路径展示用户从粗尺度发现，到中尺度学习定位，再到高分辨率解释。中尺度输出应标注为当前 AOI 弱标签推理。"
        : "用这条路径展示用户从粗尺度发现，到中尺度定位，再到高分辨率解释。不要把任何递进步骤提升为真实沙尘推理。",
  };
}

function byId(tools, id) {
  return tools.find((tool) => tool.id === id) || null;
}

function renderRegistrySummary(registry) {
  const runnable = registry.tools.filter((tool) => tool.status === "runnable").length;
  const modelReady = registry.tools.filter((tool) => tool.status === "model_ready").length;
  const dataReady = registry.tools.filter((tool) => tool.status === "data_ready").length;
  const blocked = registry.tools.filter((tool) => tool.status === "blocked").length;
  return `
    <div class="dust-status-strip">
      <span>已登记工具：${registry.tools.length}</span>
      <span>可运行：${runnable}</span>
      <span>模型就绪：${modelReady}</span>
      <span>数据就绪：${dataReady}</span>
      <span>阻断：${blocked}</span>
      <span>实际模型运行：1 个 VIIRS 弱标签模型</span>
    </div>
  `;
}

function caseAoiPanel() {
  return `
    <section class="dust-case-panel" data-shot="case-aoi">
      <div class="dust-panel-head">
        <h2>当前 AOI：河西走廊</h2>
        <p>当前演示把 GIBS 区域发现、VIIRS 中尺度锁定、同日 Sentinel-2 源区/混淆项解释串成一条路径；中尺度主 mask 使用已执行的当前 AOI 多通道 VIIRS 弱标签模型，并叠加多智能体协同仲裁颜色。</p>
      </div>
      <div class="dust-case-grid">
        <span><strong>案例</strong>${escapeHtml(hexiCorridorCase.caseId)}</span>
        <span><strong>事件日期</strong>${escapeHtml(hexiCorridorCase.eventDate)}</span>
        <span><strong>bbox</strong>${escapeHtml(hexiCorridorCase.bbox.join(", "))}</span>
        <span><strong>显示策略</strong>中尺度 VIIRS 弱标签推理 + 多智能体仲裁；Dust-Mamba/Element84 公开权重仍未执行</span>
      </div>
    </section>
  `;
}

function workflowCards(outputs) {
  return Object.values(scaleViews)
    .map((view, index) => {
      const output = outputs[view.scale];
      return `
        <button class="dust-scale-step ${view.scale === "medium" ? "is-active" : ""}" type="button" data-scale="${view.scale}">
          <span>${escapeHtml(view.label)}</span>
          <strong>${escapeHtml(view.title)}</strong>
          <p>${escapeHtml(view.sensor)}</p>
          <small>${escapeHtml(view.modelTool)} · ${escapeHtml(view.modelStatus)}</small>
          <em>${output.mask.display_grid.cells.length} ${escapeHtml(view.mask.cellLabel)} · ${escapeHtml(statusText(output.derivation.status))}</em>
        </button>
      `;
    })
    .join("");
}

function scalePreviewCards(outputs) {
  return Object.values(scaleViews)
    .map((view) => {
      const output = outputs[view.scale];
      return `
        <button class="dust-scale-preview ${view.scale === "medium" ? "is-active" : ""}" type="button" data-scale-preview="${view.scale}">
          <div class="dust-preview-frame">
            <img src="${escapeHtml(imageUrlForView(view))}" alt="${escapeHtml(view.sensor)}" />
            ${maskSvg(output, "dust-mask-svg-preview")}
          </div>
          <strong>${escapeHtml(view.title)}</strong>
          <span>${escapeHtml(view.resolution)}</span>
          <small>${output.mask.display_grid.cells.length} 个异常像元 · ${escapeHtml(statusText(output.derivation.status))}</small>
        </button>
      `;
    })
    .join("");
}

function toolCallCards(
  tools,
  activeScale,
  meteorology,
  rawAotAudit,
  modisAudit,
  dustMambaAudit,
  pixelPrecisionAudit,
  multiscalePixelLockAudit,
  maskAssetManifest,
  compositeOverlayManifest,
  highResolutionSceneSelection,
  confounderEvidence,
  mediumPixelEvidence,
  scaleTransitionTrace,
  adapterOutputContracts,
  realGibsDataRun,
  viirsRawGranuleAudit,
  viirsRawMaskOutput,
  viirsRawFootprintOutput,
  viirsMultichannelOutput,
  viirsLearnedOutput,
  rivasModelOutputImport
) {
  const confounderByTool = new Map((confounderEvidence?.checks || []).map((check) => [check.tool_id, check]));
  const confounderText = (toolId, fallback) => {
    const check = confounderByTool.get(toolId);
    if (!check) {
      return fallback;
    }
    const labels = {
      smoke_plume_confounder_adapter: "烟羽检查",
      active_fire_confounder_adapter: "活火检查",
      burned_area_temporal_adapter: "火烧区检查",
    };
    return `${labels[toolId] || check.label}：${resultText(check.result)} · ${statusText(check.status)}`;
  };
  const mainByScale = {
    coarse: ["gibs_rendered_dust_score_threshold_adapter", "executed", "渲染产品阈值 mask", "粗尺度主证据"],
    medium: [
      viirsMultichannelOutput
        ? "multi_agent_coalition_mask_adapter"
        : viirsLearnedOutput
          ? "viirs_element84_style_weak_label_model_adapter"
          : "viirs_sandstorm_segmentation_adapter",
      viirsMultichannelOutput || viirsLearnedOutput ? "executed" : "research-reference",
      viirsMultichannelOutput
        ? `${viirsMultichannelOutput.mask.active_cells.toLocaleString("en-US")} 个协同像元；颜色来自模型/证据投票主导方`
        : viirsLearnedOutput
          ? `${viirsLearnedOutput.mask.active_cells.toLocaleString("en-US")} 个学习 mask 像元；验证 F1 ${viirsLearnedOutput.metrics.validation.f1}`
        : "预期输出 dust probability / binary mask",
      viirsMultichannelOutput ? "主协同 mask / 模型仲裁" : viirsLearnedOutput ? "主学习证据" : "主证据",
    ],
    high: ["sentinel_high_resolution_context", "executed", "Sentinel-2 高分辨率上下文", "支持证据"],
  };
  const dataByScale = {
    coarse: ["lsdssimr_data_card", "blocked", "FY-4A + 再分析 HDF5 输入", "模型输入"],
    medium: ["nasa_gibs_viirs_corrected_reflectance", "executed", "corrected reflectance 底图", "模型输入"],
    high: ["sentinel_high_resolution_context", "executed", "真实 STAC 缩略图", "模型输入 / 上下文"],
  };
  const aerosolByScale = {
    coarse: ["deep_blue_aerosol_support", "ready", "气溶胶支持 / 冲突", "支持证据"],
    medium: [
      "gibs_rendered_aot_aerosol_type_intersection_adapter",
      "executed",
      "渲染 AOT + Aerosol Type 交集 mask",
      "更严格的支持证据",
    ],
    high: ["deep_blue_aerosol_support", "ready", "气溶胶支持 / 冲突", "支持证据"],
  };
  const cards = [
    mainByScale[activeScale] || mainByScale.medium,
    ...(dustMambaAudit
      ? [
          [
            "dust_mamba_repo_audit_adapter",
            "blocked",
            `仓库已克隆；本地 checkpoint=${booleanText(
              dustMambaAudit.checkpoint_audit?.checkpoint_available_locally
            )}；输入通道 ${dustMambaAudit.input_contract?.expected_input_channels || "未知"}`,
            "P0 主检测器就绪门控",
          ],
        ]
      : []),
    ...(realGibsDataRun
      ? [
          [
            "hexi_real_gibs_data_run",
            "executed",
            `已保存 ${realGibsDataRun.downloaded_products.length} 个 GIBS 产品；当前 AOI ${realGibsDataRun.active_mask.active_red_pixels} 个红色像元`,
            "真实数据工具输出",
          ],
        ]
      : []),
    ...(viirsRawGranuleAudit
      ? [
          [
            "viirs_deep_blue_raw_granule_access_audit",
            viirsRawGranuleAudit.local_raw_science_values_available ? "executed" : "blocked",
            `发现 ${viirsRawGranuleAudit.discovered_granules.l2_count} 个 L2 + ${viirsRawGranuleAudit.discovered_granules.d3_count} 个 D3 CMR granule；原始 NetCDF ${viirsRawGranuleAudit.local_raw_science_values_available ? "可用" : "需要 Earthdata 授权"}`,
            "原始科学值访问记录",
          ],
        ]
      : []),
    ...(viirsRawMaskOutput
      ? [
          [
            "viirs_deep_blue_raw_science_mask_adapter",
            "executed",
            `${viirsRawMaskOutput.mask.active_raw_pixels.toLocaleString("en-US")} 个 L2 原始沙尘支持像元；${viirsRawMaskOutput.mask.active_cells.toLocaleString("en-US")} 个显示像元`,
            "原始科学值 mask 证据",
          ],
        ]
      : []),
    ...(viirsRawFootprintOutput
      ? [
          [
            "viirs_deep_blue_native_footprint_mask_adapter",
            "executed",
            `${viirsRawFootprintOutput.mask.active_raw_pixels.toLocaleString("en-US")} 个原始 L2 footprint；面积约 ${viirsRawFootprintOutput.mask.native_area_km2_estimate.toLocaleString("en-US")} km2`,
            "原始像元 footprint mask",
          ],
        ]
      : []),
    ...(viirsLearnedOutput
      ? [
          [
            "viirs_element84_style_weak_label_model_adapter",
            "executed",
            `${viirsLearnedOutput.mask.active_cells.toLocaleString("en-US")} 个当前 AOI 学习像元；阈值 ${viirsLearnedOutput.mask.threshold}；验证 F1 ${viirsLearnedOutput.metrics.validation.f1}`,
            "主学习模型证据 / 弱标签",
          ],
        ]
      : []),
    ...(viirsMultichannelOutput
      ? [
          [
            "viirs_multichannel_weak_label_segmentation_adapter",
            "executed",
            `${viirsMultichannelOutput.mask.active_cells.toLocaleString("en-US")} 个当前 AOI 多通道模型像元；验证 F1 ${viirsMultichannelOutput.metrics.validation.f1}`,
            "协同 mask 的提议智能体",
          ],
        ]
      : []),
    ...(rivasModelOutputImport
      ? [
          [
            "rivas_3dcnn_model_output_import",
            "model-output",
            `已导入 ${rivasModelOutputImport.selected_case}；${rivasModelOutputImport.mask.active_pixels.toLocaleString("en-US")} 个参考预测像元`,
            "真实模型 artifact，但不是当前 AOI",
          ],
        ]
      : []),
    ...(activeScale === "medium"
      ? [
          [
            "modis_3dcnn_dust_adapter",
            "model-ready",
            modisAudit
              ? `本地 checkpoint 审计，${modisAudit.case_metrics.length} 个参考案例，整体精度 ${modisAudit.overall_metrics.accuracy}`
              : "checkpoint + 预生成预测参考",
            "模型就绪度",
          ],
        ]
      : []),
    dataByScale[activeScale] || dataByScale.medium,
    aerosolByScale[activeScale] || aerosolByScale.medium,
    ...(activeScale === "high" && rawAotAudit
      ? [
          [
            "hexi_high_resolution_scene_selector",
            "executed",
            highResolutionSceneSelection
              ? `已选 ${highResolutionSceneSelection.selected.id}；有效覆盖 ${Math.round(
                  highResolutionSceneSelection.selected.metrics.valid_ratio * 100
                )}%`
              : "已选择 Sentinel-2 高分辨率上下文场景",
            "高分辨率上下文选择",
          ],
          [
            "sentinel2_raw_aot_cog_audit_adapter",
            "executed",
            `${rawAotAudit.grid.support_cells} 个 SCL 筛选后的原始 AOT + NDVI 源区支持像元`,
            "高分辨率气溶胶 / 源区支持审计",
          ],
        ]
      : []),
    meteorology
      ? ["era5_merra2_meteorology_evidence", "executed", "NASA POWER 风场 / 湿度快照", "先兆 / 支持证据"]
      : ["era5_merra2_meteorology_evidence", "evidence-only", "风场 / 湿度 / 输送槽位", "先兆证据"],
    [
      "smoke_plume_confounder_adapter",
      "evidence-only",
      confounderText("smoke_plume_confounder_adapter", "烟羽冲突检查"),
      "互斥证据",
    ],
    [
      "active_fire_confounder_adapter",
      "evidence-only",
      confounderText("active_fire_confounder_adapter", "活火冲突检查"),
      "互斥证据",
    ],
    [
      "burned_area_temporal_adapter",
      "evidence-only",
      confounderText("burned_area_temporal_adapter", "火烧区冲突检查"),
      "互斥证据",
    ],
  ];
  return cards
    .map(([id, uiStatus, output, contribution]) => ({ id, uiStatus, output, contribution, tool: byId(tools, id) }))
    .map(
      (card) => `
        <article class="dust-tool-card ${escapeHtml(card.uiStatus)}">
          <div>
            <span>${escapeHtml(statusText(card.uiStatus))}</span>
            <strong>${escapeHtml(toolNameText(card.id, card.tool?.name))}</strong>
          </div>
          <p>${escapeHtml(card.output)} · ${escapeHtml(card.contribution)}</p>
          <p>${escapeHtml(toolPolicyText(card.id, card.tool?.display_policy))}</p>
        </article>
      `
    )
    .join("");
}

function evidenceColumns(output) {
  const groups = [
    ["A. 主证据", output.evidence.main],
    ["B. 互证证据", output.evidence.supporting],
    ["C. 互斥证据", output.evidence.conflicting],
    ["D. 先兆 / 认知深度", output.evidence.precursor],
  ];
  return groups
    .map(
      ([title, items]) => `
        <section class="dust-evidence-column">
          <h3>${escapeHtml(title)}</h3>
          <ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
        </section>
      `
    )
    .join("");
}

function maskComparisonPanel(comparison) {
  if (!comparison) {
    return "";
  }
  const cards = [
    ["AOT-only 支持 mask", comparison.baseline, "单一渲染产品阈值"],
    ["AOT + Aerosol Type 交集", comparison.refined, "更严格的双产品支持 mask"],
    ["形态筛选后 active mask", comparison.shapeFiltered, "连通域羽流形态后处理"],
    ["被移除候选像元", comparison.removed, "被 Aerosol Type 排除的 AOT-only 像元"],
  ];
  return `
    <section class="dust-mask-comparison-panel" data-shot="mask-comparison">
      <div class="dust-panel-head">
        <h2>掩膜精度对比</h2>
        <p>同一 VIIRS corrected-reflectance 底图、同一日期和 bbox。这里展示从 AOT-only 候选，到 AOT + Aerosol Type 互证，再到形态筛选和被移除像元的决策过程。</p>
      </div>
      <div class="dust-comparison-summary">
        <span>AOT-only：${comparison.baseline.mask.display_grid.cells.length} 像元</span>
        <span>交集：${comparison.refined.mask.display_grid.cells.length} 像元</span>
        <span>形态筛选：${comparison.shapeFiltered.mask.display_grid.cells.length} 像元</span>
        <span>移除：${comparison.removedCells} 像元（${comparison.reductionPercent}%）</span>
        <span>形态移除：${comparison.shapeRemovedCells} 像元（${comparison.shapeReductionPercent}%）</span>
      </div>
      <div class="dust-comparison-grid">
        ${cards
          .map(
            ([title, output, note]) => `
              <article class="dust-comparison-card">
                <div class="dust-preview-frame">
                  <img src="${escapeHtml(imageUrlForView(scaleViews.medium))}" alt="${escapeHtml(title)}" />
                  ${maskSvg(output, "dust-mask-svg-preview")}
                </div>
                <strong>${escapeHtml(title)}</strong>
                <span>${escapeHtml(note)}</span>
                <small>${output.mask.display_grid.cells.length} 个显示像元 · 估算 ${output.mask.mask_area_km2.toLocaleString("en-US")} km2</small>
              </article>
            `
          )
          .join("")}
      </div>
    </section>
  `;
}

function coalitionDecisionPanel(comparison) {
  const output = comparison?.coalition;
  if (!output?.coalition?.agents) {
    return "";
  }
  const agents = Object.entries(output.coalition.agents);
  const dominantTotal = agents.reduce((sum, [, agent]) => sum + agent.dominant_cells, 0);
  return `
    <section class="dust-coalition-panel" data-shot="coalition-panel">
      <div class="dust-panel-head">
        <h2>多智能体协同掩膜</h2>
        <p>最终中尺度 mask 不再是单色图层。VIIRS 多通道模型先提出 active dust cells，随后原始 footprint、气溶胶产品和 RGB 弱标签智能体逐像元竞争；颜色表示主导贡献方。</p>
      </div>
      <div class="dust-coalition-layout">
        <div class="dust-coalition-preview">
          <div class="dust-preview-frame">
            <img src="${escapeHtml(imageUrlForView(scaleViews.medium))}" alt="VIIRS coalition mask preview" />
            ${maskSvg(output, "dust-mask-svg-preview")}
          </div>
          <div class="dust-coalition-rules">
            <strong>${escapeHtml(output.coalition.decision_rule)}</strong>
            <span>最终 mask：${output.coalition.active_cells.toLocaleString("en-US")} 个像元</span>
            <span>${output.coalition.supported_by_any_non_model_agent.toLocaleString("en-US")} 个像元有非模型证据互证</span>
            <span>${output.coalition.supported_by_two_or_more_non_model_agents.toLocaleString("en-US")} 个像元有两个及以上智能体互证</span>
          </div>
        </div>
        <div class="dust-coalition-agent-grid">
          ${agents
            .map(
              ([id, agent]) => `
                <article class="dust-coalition-agent-card" style="--agent-color:${escapeHtml(agent.color)}">
                  <span>${escapeHtml(id)}</span>
                  <strong>${escapeHtml(agent.label)}</strong>
                  <p>${escapeHtml(agent.contribution)}</p>
                  <div>
                    <b>${agent.dominant_cells.toLocaleString("en-US")}</b>
                    <small>主导像元 / ${dominantTotal.toLocaleString("en-US")}</small>
                  </div>
                  <div>
                    <b>${agent.supported_cells.toLocaleString("en-US")}</b>
                    <small>支持票数</small>
                  </div>
                </article>
              `
            )
            .join("")}
        </div>
      </div>
    </section>
  `;
}

function buildMediumDecisionTrace(comparison) {
  if (!comparison) {
    return null;
  }
  return {
    scale: "medium",
    sensor: "VIIRS NOAA-20 Corrected Reflectance",
    basemap: "VIIRS_NOAA20_CorrectedReflectance_TrueColor",
    mask_layers: [
      {
        id: "medium_aot_only_candidate_support",
        role: "candidate_support",
        tool_id: "gibs_rendered_deep_blue_threshold_adapter",
        pixels: comparison.baseline.mask.display_grid.cells.length,
        area_km2: comparison.baseline.mask.mask_area_km2,
        display: "红色候选支持",
        status: "已执行渲染产品阈值",
      },
      {
        id: "medium_aot_aerosol_type_active_anomaly",
        role: "active_anomaly",
        tool_id: "gibs_rendered_aot_aerosol_type_intersection_adapter",
        pixels: comparison.refined.mask.display_grid.cells.length,
        area_km2: comparison.refined.mask.mask_area_km2,
        display: "红色 active 异常支持",
        status: "已执行渲染产品交集",
      },
      {
        id: "medium_shape_filtered_active_anomaly",
        role: "active_anomaly",
        tool_id: "gibs_rendered_plume_shape_filter_adapter",
        pixels: comparison.shapeFiltered.mask.display_grid.cells.length,
        area_km2: comparison.shapeFiltered.mask.mask_area_km2,
        display: "默认红色 active 异常支持",
        status: "已执行形态筛选后处理",
      },
      {
        id: "medium_removed_candidate_pixels",
        role: "removed_candidate",
        tool_id: "gibs_rendered_aot_removed_candidate_view",
        pixels: comparison.removed.mask.display_grid.cells.length,
        area_km2: comparison.removed.mask.mask_area_km2,
        display: "黄色拒绝候选审计",
        status: "已执行对比视图",
      },
    ],
    decision_trace: [
      {
        step_id: "candidate_from_aot",
        tool_id: "gibs_rendered_deep_blue_threshold_adapter",
        operation: "对渲染后的 VIIRS Deep Blue AOT 支持像元做阈值提取",
        output: `${comparison.baseline.mask.display_grid.cells.length} 个候选支持像元`,
      },
      {
        step_id: "intersect_aerosol_type",
        tool_id: "gibs_rendered_aot_aerosol_type_intersection_adapter",
        operation: "仅保留同时被渲染 Aerosol Type 支持的像元",
        output: `${comparison.refined.mask.display_grid.cells.length} 个 active 异常支持像元`,
      },
      {
        step_id: "shape_filter_active_mask",
        tool_id: "gibs_rendered_plume_shape_filter_adapter",
        operation:
          comparison.shapeRemovedCells > 0
            ? "移除孤立交集连通域，保留羽流状连通像元"
            : "执行形态门控；没有额外像元被移除，保留 active 交集",
        output: `${comparison.shapeFiltered.mask.display_grid.cells.length} 个默认 active 红色像元`,
      },
      {
        step_id: "removed_candidate_audit",
        tool_id: "gibs_rendered_aot_removed_candidate_view",
        operation: "从 AOT-only 候选集中扣除 active 交集像元",
        output: `${comparison.removed.mask.display_grid.cells.length} 个被移除候选像元`,
      },
    ],
    limitations: ["渲染产品颜色评分", "不是原始科学值", "不是模型推理"],
  };
}

function decisionTracePanel(comparison) {
  const trace = buildMediumDecisionTrace(comparison);
  if (!trace) {
    return "";
  }
  return `
    <section class="dust-decision-trace-panel" data-shot="decision-trace">
      <div class="dust-panel-head">
        <h2>掩膜决策路径</h2>
        <p>中尺度智能体路径清晰展示：候选提取、同传感器 Aerosol Type 互证、active mask、被移除候选审计。这里是产品证据决策路径，不把未运行模型说成已运行。</p>
      </div>
      <div class="dust-decision-steps">
        ${trace.decision_trace
          .map((step, index) => {
            const layer = trace.mask_layers[index];
            return `
              <article class="dust-decision-step">
                <span>步骤 ${index + 1}</span>
                <strong>${escapeHtml(step.operation)}</strong>
                <p>${escapeHtml(step.output)}</p>
                <small>${escapeHtml(layer.tool_id)} · ${escapeHtml(layer.status)}</small>
              </article>
            `;
          })
          .join("")}
      </div>
      <div class="dust-decision-summary">
        <span>候选：${trace.mask_layers[0].pixels} px</span>
        <span>互证后：${trace.mask_layers[1].pixels} px</span>
        <span>默认：${trace.mask_layers[2].pixels} px</span>
        <span>移除：${trace.mask_layers[3].pixels} px</span>
        <span>收缩：${comparison.reductionPercent}%</span>
        <span>形态移除：${comparison.shapeReductionPercent}%</span>
      </div>
    </section>
  `;
}

function modelReferencePanel(modisAudit, modisInputContract) {
  const selected = modisAudit?.selected_reference_case || {
    id: rivasModelReference.selectedCase,
    accuracy: Number(rivasModelReference.selectedCaseAccuracy),
    mse: null,
    r2: null,
  };
  const overall = modisAudit?.overall_metrics || {
    accuracy: Number(rivasModelReference.overallAccuracy),
    mse: null,
    r2: null,
    total_samples: null,
  };
  const caseMetrics = modisAudit?.case_metrics || [];
  const inputStatus = modisInputContract?.status || "input requirements not loaded";
  const checkpoint = modisInputContract?.local_artifacts?.find((item) => item.path.endsWith(".pth"));
  const processedRoots = modisInputContract?.processed_roots || [];
  const requiredBands = modisInputContract?.expected_input_contract?.required_band_arrays?.length || 38;
  return `
    <section class="dust-model-reference-panel" data-shot="model-reference">
      <div class="dust-panel-head">
        <h2>MODIS 3D-CNN 模型参考</h2>
        <p>Rivas-AI dust-3dcnn 已有本地 checkpoint 与评估 artifact。本面板只做传感器绑定的模型就绪审计，不代表当前 AOI 推理。</p>
      </div>
      <div class="dust-model-reference-grid">
        <figure class="dust-model-reference-image">
          <img src="${escapeHtml(rivasModelReference.imageUrl)}" alt="Rivas 3D-CNN prediction reference" />
          <figcaption>预生成 ${escapeHtml(selected.id)} 预测 / 真值对比；不是当前 AOI。</figcaption>
        </figure>
        <div class="dust-model-reference-facts">
          <span>${escapeHtml(modisAudit?.status || rivasModelReference.status)}</span>
          <strong>MODIS Terra/Aqua multispectral 3D-CNN</strong>
          <p>已下载用于审计的 checkpoint：${escapeHtml(rivasModelReference.checkpoint)}</p>
          <div class="dust-model-metrics-grid">
            <span>选中样例精度 ${selected.accuracy}</span>
            <span>整体精度 ${overall.accuracy}</span>
            <span>整体 MSE ${overall.mse ?? "未知"}</span>
            <span>案例数 ${caseMetrics.length || "未知"}</span>
          </div>
          <p>因 processed .npy 输入仍缺失，未运行本地推理。当前 AOI mask 仍以 VIIRS 中尺度协同 mask 为主。</p>
          <div class="dust-model-input-contract" data-shot="modis-input-contract">
            <span>${escapeHtml(inputStatus)}</span>
            <span>checkpoint ${availableText(checkpoint?.exists)} · ${checkpoint?.bytes?.toLocaleString("en-US") || 0} bytes</span>
            <span>完整 processed 案例 ${modisInputContract?.complete_cases?.length || 0}</span>
            <span>输入数组要求 ${requiredBands} 个波段 + x.npy</span>
          </div>
          <p>${escapeHtml(modisInputContract?.promotion_decision?.reason || "Input readiness audit is not loaded.")}</p>
          <div class="dust-model-input-roots">
            ${processedRoots
              .map(
                (item) => `
                  <span>
                    <strong>${escapeHtml(item.path)}</strong>
                     存在=${booleanText(item.exists)} / 完整案例 ${item.complete_case_count}
                  </span>
                `
              )
              .join("")}
          </div>
          <div class="dust-model-case-list" data-shot="modis-model-audit">
            ${caseMetrics
              .slice(0, 6)
              .map(
                (item) => `
                  <span>
                    <strong>${escapeHtml(item.id)}</strong>
                     精度 ${item.accuracy} / MSE ${item.mse}
                  </span>
                `
              )
              .join("")}
          </div>
        </div>
      </div>
    </section>
  `;
}

function realDataModelRunPanel(
  realGibsDataRun,
  viirsRawGranuleAudit,
  viirsRawMaskOutput,
  viirsRawFootprintOutput,
  viirsMultichannelOutput,
  viirsLearnedOutput,
  rivasModelOutputImport
) {
  if (
    !realGibsDataRun &&
    !viirsRawGranuleAudit &&
    !viirsRawMaskOutput &&
    !viirsRawFootprintOutput &&
    !viirsMultichannelOutput &&
    !viirsLearnedOutput &&
    !rivasModelOutputImport
  ) {
    return "";
  }
  const products = realGibsDataRun?.downloaded_products || [];
  const productCards = products
    .map(
      (item) => `
        <article class="dust-real-run-card">
          <span>${escapeHtml(item.sensor)}</span>
          <strong>${escapeHtml(item.layer)}</strong>
          <p>${escapeHtml(item.local_path)} 路 ${(item.bytes || 0).toLocaleString("en-US")} bytes</p>
        </article>
      `
    )
    .join("");
  const viirsBasemap = products.find((item) => item.id === "viirs_corrected_reflectance");
  const rawGranules = viirsRawGranuleAudit?.discovered_granules || {};
  const rawDownloadChecks = viirsRawGranuleAudit?.direct_download_checks || [];
  const rivas = rivasModelOutputImport;
  const rivasAttempt = rivas?.round_032_execution_attempt;
  return `
    <section class="dust-real-run-panel" data-shot="real-data-model-run">
      <div class="dust-panel-head">
        <h2>真实数据与模型输出</h2>
        <p>当前河西走廊 AOI 产品来自 NASA GIBS。本轮展示已接入当前 AOI 多通道 VIIRS 分割头，训练信号包括 corrected reflectance、Deep Blue AOT、Aerosol Type 和 Earthdata 授权的 VIIRS Deep Blue L2 footprint 弱标签。Rivas 3D-CNN 仍是仓库预计算输出，不是当前 AOI 推理。</p>
      </div>
      <div class="dust-real-run-summary">
        ${
          realGibsDataRun
             ? `<span>已保存 ${products.length} 个真实 GIBS 产品</span>
                <span>${realGibsDataRun.active_mask.active_red_pixels} 个当前 AOI 红色支持像元</span>
                <span>${escapeHtml(realGibsDataRun.status)}</span>`
            : ""
        }
        ${
          viirsRawGranuleAudit
             ? `<span>发现 ${rawGranules.l2_count} 个 VIIRS L2 原始 granule</span>
                <span>发现 ${rawGranules.d3_count} 个 VIIRS D3 原始 granule</span>
                <span>${escapeHtml(viirsRawGranuleAudit.status)}</span>`
            : ""
        }
        ${
          viirsRawMaskOutput
             ? `<span>${viirsRawMaskOutput.mask.active_raw_pixels.toLocaleString("en-US")} 个 L2 原始 active 像元</span>
                <span>${viirsRawMaskOutput.mask.active_cells.toLocaleString("en-US")} 个原始 mask 显示像元</span>
                <span>${escapeHtml(viirsRawMaskOutput.status)}</span>`
            : ""
        }
        ${
          viirsRawFootprintOutput
             ? `<span>${viirsRawFootprintOutput.mask.active_raw_pixels.toLocaleString("en-US")} 个原生 L2 footprint</span>
                <span>${viirsRawFootprintOutput.mask.native_area_km2_estimate.toLocaleString("en-US")} km2 原生 footprint 面积</span>
                <span>${escapeHtml(viirsRawFootprintOutput.status)}</span>`
            : ""
        }
        ${
          viirsMultichannelOutput
             ? `<span>${viirsMultichannelOutput.mask.active_cells.toLocaleString("en-US")} 个多通道模型像元</span>
                <span>验证 F1 ${viirsMultichannelOutput.metrics.validation.f1}</span>
                <span>${escapeHtml(viirsMultichannelOutput.status)}</span>`
            : ""
        }
        ${
          viirsLearnedOutput
             ? `<span>${viirsLearnedOutput.mask.active_cells.toLocaleString("en-US")} 个学习模型像元</span>
                <span>验证 F1 ${viirsLearnedOutput.metrics.validation.f1}</span>
                <span>${escapeHtml(viirsLearnedOutput.status)}</span>`
            : ""
        }
        ${
          rivas
             ? `<span>已导入 Rivas 3D-CNN artifact</span>
                <span>${rivas.mask.active_pixels.toLocaleString("en-US")} 个参考预测像元</span>
                <span>案例 ${escapeHtml(rivas.selected_case)} / 精度 ${rivas.metrics.selected_case_accuracy}</span>
                <span>${escapeHtml(rivasAttempt?.status || "未尝试本地执行")}</span>`
            : ""
        }
      </div>
      <div class="dust-real-run-grid">
        <figure class="dust-real-run-image">
          <img src="${escapeHtml(localAssetSrc(viirsBasemap?.local_path))}" alt="VIIRS corrected reflectance Hexi real data" />
          <figcaption>当前 AOI VIIRS corrected reflectance 底图，来源 NASA GIBS，${escapeHtml(realGibsDataRun?.date || "")}</figcaption>
        </figure>
        <figure class="dust-real-run-image">
          <img src="${escapeHtml(localAssetSrc(realGibsDataRun?.active_mask?.path))}" alt="Current AOI red pixel support mask" />
          <figcaption>当前 AOI 红色支持 mask 来自 VIIRS AOT + Aerosol Type 渲染产品；不是模型推理。</figcaption>
        </figure>
        ${
          viirsRawMaskOutput
            ? `<figure class="dust-real-run-image">
                <div class="dust-raw-viirs-mask-frame">${rawViirsMaskSvg(viirsRawMaskOutput)}</div>
                 <figcaption>VIIRS Deep Blue L2 原始沙尘支持 mask：Aerosol Type 0，QA >= ${viirsRawMaskOutput.threshold.qa_land_min}，AOT550 >= ${viirsRawMaskOutput.threshold.aot_550_min}。不是深度模型推理。</figcaption>
              </figure>`
            : ""
        }
        ${
          viirsRawFootprintOutput
            ? `<figure class="dust-real-run-image">
                <div class="dust-raw-viirs-mask-frame">${rawViirsFootprintSvg(viirsRawFootprintOutput)}</div>
                 <figcaption>VIIRS L2 原生像元 footprint mask：${viirsRawFootprintOutput.mask.active_raw_pixels.toLocaleString("en-US")} 个地理定位 footprint，估算面积 ${viirsRawFootprintOutput.mask.native_area_km2_estimate.toLocaleString("en-US")} km2。</figcaption>
              </figure>`
            : ""
        }
        ${
          viirsMultichannelOutput
            ? `<figure class="dust-real-run-image">
                <img src="${escapeHtml(localAssetSrc(viirsMultichannelOutput.mask.overlay_path))}" alt="VIIRS multichannel segmentation red overlay" />
                 <figcaption>当前 AOI 多通道 VIIRS 分割输出：${viirsMultichannelOutput.mask.active_cells.toLocaleString("en-US")} 个红色像元，阈值 ${viirsMultichannelOutput.mask.threshold}，验证 F1 ${viirsMultichannelOutput.metrics.validation.f1}；输入包括 corrected reflectance、AOT、Aerosol Type 和 L2 footprint 弱标签。</figcaption>
              </figure>`
            : ""
        }
        ${
          viirsLearnedOutput
            ? `<figure class="dust-real-run-image">
                <img src="${escapeHtml(localAssetSrc(viirsLearnedOutput.mask.overlay_path))}" alt="VIIRS learned pixel classifier red overlay" />
                 <figcaption>当前 AOI VIIRS 学习模型输出：${viirsLearnedOutput.mask.active_cells.toLocaleString("en-US")} 个红色像元，阈值 ${viirsLearnedOutput.mask.threshold}，验证 F1 ${viirsLearnedOutput.metrics.validation.f1}；弱标签来自 Deep Blue L2 footprint。</figcaption>
              </figure>`
            : ""
        }
        ${
          rivas
            ? `<figure class="dust-real-run-image">
                <img src="${escapeHtml(localAssetSrc(rivas.outputs.red_prediction_overlay))}" alt="Rivas MODIS 3D-CNN prediction overlay" />
                 <figcaption>来自克隆仓库的真实预计算 MODIS 3D-CNN 预测 artifact；不是河西当前 AOI 推理。</figcaption>
              </figure>`
            : ""
        }
      </div>
      <div class="dust-real-run-products">${productCards}</div>
      ${
        viirsRawGranuleAudit
          ? `<div class="dust-real-run-products">
              <article class="dust-real-run-card">
                <span>NASA CMR / VIIRS Deep Blue L2</span>
                <strong>${escapeHtml(rawGranules.selected_l2?.producer_granule_id || "未找到")}</strong>
                <p>${escapeHtml(rawGranules.selected_l2?.time_start || "")} 至 ${escapeHtml(rawGranules.selected_l2?.time_end || "")}; ${escapeHtml(rawGranules.selected_l2?.data_url || "")}</p>
              </article>
              <article class="dust-real-run-card">
                <span>NASA CMR / VIIRS Deep Blue D3</span>
                <strong>${escapeHtml(rawGranules.selected_d3?.producer_granule_id || "未找到")}</strong>
                <p>${escapeHtml(rawGranules.selected_d3?.time_start || "")} 至 ${escapeHtml(rawGranules.selected_d3?.time_end || "")}; ${escapeHtml(rawGranules.selected_d3?.data_url || "")}</p>
              </article>
              <article class="dust-real-run-card">
                <span>原始 NetCDF 访问检查</span>
                <strong>${viirsRawGranuleAudit.local_raw_science_values_available ? "科学变量可用" : "Earthdata 授权阻断"}</strong>
                <p>${rawDownloadChecks
                  .map((item) => `${item.producer_granule_id}: HTTP ${item.http_status}, ${item.file_signature}`)
                  .map(escapeHtml)
                  .join(" | ")}</p>
              </article>
            </div>`
          : ""
      }
      ${
        viirsRawMaskOutput
          ? `<div class="dust-real-run-products">
              <article class="dust-real-run-card">
                <span>原始 VIIRS L2 科学变量 mask</span>
                <strong>${viirsRawMaskOutput.mask.active_raw_pixels.toLocaleString("en-US")} 个原始 active 像元</strong>
                <p>${viirsRawMaskOutput.mask.active_cells.toLocaleString("en-US")} 个显示像元；估算面积 ${viirsRawMaskOutput.mask.mask_area_km2_estimate.toLocaleString("en-US")} km2</p>
              </article>
              <article class="dust-real-run-card">
                <span>原始 L2 反演摘要</span>
                <strong>${viirsRawMaskOutput.raw_l2_summary.valid_retrieval_pixels.toLocaleString("en-US")} 个有效反演像元</strong>
                <p>${viirsRawMaskOutput.raw_l2_summary.dust_type_pixels.toLocaleString("en-US")} 个 dust-type 像元；${viirsRawMaskOutput.raw_l2_summary.qa_pass_pixels.toLocaleString("en-US")} 个 QA 通过像元</p>
              </article>
              <article class="dust-real-run-card">
                <span>原始 D3 支持</span>
                <strong>${viirsRawMaskOutput.raw_d3_support_summary.dust_mode_cells} 个 dust-mode 像元</strong>
                <p>${viirsRawMaskOutput.raw_d3_support_summary.valid_cells} 个有效日尺度像元；反演计数 ${viirsRawMaskOutput.raw_d3_support_summary.retrieval_count_sum}</p>
              </article>
            </div>`
          : ""
      }
      ${
        viirsRawFootprintOutput
          ? `<div class="dust-real-run-products">
              <article class="dust-real-run-card">
                <span>原生 VIIRS L2 footprint mask</span>
                <strong>${viirsRawFootprintOutput.mask.active_raw_pixels.toLocaleString("en-US")} 个地理定位像元 footprint</strong>
                <p>${viirsRawFootprintOutput.mask.native_area_km2_estimate.toLocaleString("en-US")} km2 原生 footprint 估算；GeoJSON：${escapeHtml(viirsRawFootprintOutput.mask.geojson_path)}</p>
              </article>
              <article class="dust-real-run-card">
                <span>Footprint 阈值</span>
                <strong>${escapeHtml(viirsRawFootprintOutput.threshold.aerosol_type)} / QA >= ${viirsRawFootprintOutput.threshold.qa_land_min}</strong>
                <p>AOT550 >= ${viirsRawFootprintOutput.threshold.aot_550_min}；由 Latitude/Longitude 地理定位中心绘制。</p>
              </article>
            </div>`
          : ""
      }
      ${
        viirsMultichannelOutput
          ? `<div class="dust-real-run-products">
              <article class="dust-real-run-card">
                <span>多通道 VIIRS 学习分割头</span>
                <strong>${viirsMultichannelOutput.mask.active_cells.toLocaleString("en-US")} 个当前 AOI 模型像元</strong>
                <p>阈值 ${viirsMultichannelOutput.mask.threshold}；面积估算 ${viirsMultichannelOutput.mask.mask_area_km2_estimate.toLocaleString("en-US")} km2；概率图 ${escapeHtml(viirsMultichannelOutput.mask.probability_map_path)}</p>
              </article>
              <article class="dust-real-run-card">
                <span>训练与验证</span>
                <strong>${viirsMultichannelOutput.training_data.samples.toLocaleString("en-US")} 个像元 / ${viirsMultichannelOutput.training_data.positive_label_cells.toLocaleString("en-US")} 个弱正样本</strong>
                <p>验证 precision ${viirsMultichannelOutput.metrics.validation.precision}，recall ${viirsMultichannelOutput.metrics.validation.recall}，F1 ${viirsMultichannelOutput.metrics.validation.f1}，IoU ${viirsMultichannelOutput.metrics.validation.iou}</p>
              </article>
            </div>`
          : ""
      }
      ${
        viirsLearnedOutput
          ? `<div class="dust-real-run-products">
              <article class="dust-real-run-card">
                <span>Element84 风格 VIIRS 学习基线</span>
                <strong>${viirsLearnedOutput.mask.active_cells.toLocaleString("en-US")} 个当前 AOI 模型像元</strong>
                <p>阈值 ${viirsLearnedOutput.mask.threshold}；面积估算 ${viirsLearnedOutput.mask.mask_area_km2_estimate.toLocaleString("en-US")} km2；概率图 ${escapeHtml(viirsLearnedOutput.mask.probability_map_path)}</p>
              </article>
              <article class="dust-real-run-card">
                <span>训练与验证</span>
                <strong>${viirsLearnedOutput.training_data.samples.toLocaleString("en-US")} 个像元 / ${viirsLearnedOutput.training_data.positive_label_cells.toLocaleString("en-US")} 个弱正样本</strong>
                <p>验证 precision ${viirsLearnedOutput.metrics.validation.precision}，recall ${viirsLearnedOutput.metrics.validation.recall}，F1 ${viirsLearnedOutput.metrics.validation.f1}，IoU ${viirsLearnedOutput.metrics.validation.iou}</p>
              </article>
            </div>`
          : ""
      }
      ${
        rivasAttempt
          ? `<div class="dust-real-run-products">
              <article class="dust-real-run-card">
                <span>Rivas 本地运行尝试</span>
                <strong>${escapeHtml(rivasAttempt.status)}</strong>
                <p>${escapeHtml(rivasAttempt.stderr)}</p>
                <p>processed .npy 输入：${availableText(rivasAttempt.processed_input_present)}；Box 凭据：${
                availableText(rivasAttempt.box_credentials_present)
              }</p>
              </article>
            </div>`
          : ""
      }
      <p class="dust-real-run-policy">${escapeHtml(realGibsDataRun?.display_policy || "")} ${escapeHtml(viirsRawGranuleAudit?.ui_policy || "")} ${escapeHtml(viirsRawMaskOutput?.display_policy || "")} ${escapeHtml(viirsRawFootprintOutput?.display_policy || "")} ${escapeHtml(viirsMultichannelOutput?.display_policy || "")} ${escapeHtml(viirsLearnedOutput?.display_policy || "")} ${escapeHtml(rivas?.display_policy || "")}</p>
    </section>
  `;
}

function dustMambaAuditPanel(audit) {
  if (!audit) {
    return "";
  }
  const dustRepo = audit.repositories?.dust_mamba || {};
  const lsdssimrRepo = audit.repositories?.lsdssimr || {};
  const checkpointReady = audit.checkpoint_audit?.checkpoint_available_locally;
  const localCheckpoints = audit.checkpoint_audit?.local_checkpoint_files || [];
  const contract = audit.input_contract || {};
  const promotion = audit.promotion_decision || {};
  const accessAttempt = audit.round_032_access_attempt || {};
  return `
    <section class="dust-mamba-audit-panel" data-shot="dust-mamba-audit">
      <div class="dust-panel-head">
        <h2>Dust-Mamba P0 就绪审计</h2>
        <p>Dust-Mamba 与 LSDSSIMR 被作为 P0 沙尘主检测路径审计。此前已访问外部 checkpoint / 数据页面，但尚未获得本地模型 checkpoint 或 HDF5 事件样本。</p>
      </div>
      <div class="dust-mamba-audit-grid">
        <article class="dust-mamba-audit-card">
          <span>${escapeHtml(audit.status)}</span>
          <strong>Dust-Mamba 仓库</strong>
          <p>${escapeHtml(dustRepo.url || "未知")}</p>
          <p>commit ${escapeHtml(dustRepo.commit || "未知")} / 代码文件 ${dustRepo.code_file_count || 0}</p>
        </article>
        <article class="dust-mamba-audit-card">
          <span>${checkpointReady ? "checkpoint 就绪" : "checkpoint 缺失"}</span>
          <strong>Checkpoint 门控</strong>
          <p>本地 checkpoint 文件：${localCheckpoints.length}</p>
          <p>${escapeHtml(audit.checkpoint_audit?.note || "无 checkpoint 审计说明。")}</p>
        </article>
        <article class="dust-mamba-audit-card">
          <span>${audit.lsdssimr_data_audit?.data_downloaded_locally ? "数据就绪" : "数据缺失"}</span>
          <strong>LSDSSIMR 数据基础</strong>
          <p>LSDSSIMR commit ${escapeHtml(lsdssimrRepo.commit || "未知")}</p>
          <p>FY-4A ${escapeHtml(contract.fy4a_spatial_resolution || "未知")} / ${escapeHtml(
            contract.fy4a_temporal_resolution || "未知"
          )} / HDF5</p>
        </article>
        <article class="dust-mamba-audit-card">
          <span>输入要求</span>
          <strong>${contract.expected_input_channels || "未知"} 个输入通道</strong>
          <p>satellite ${contract.satellite_channel_indices?.length || 0} + meteorology ${
            contract.meteorology_channel_indices?.length || 0
          }; image ${contract.image_shape?.height || "?"}x${contract.image_shape?.width || "?"}</p>
          <p>${escapeHtml(promotion.reason || "未加载提升门控。")}</p>
        </article>
        <article class="dust-mamba-audit-card">
          <span>${accessAttempt.can_run_now ? "可运行" : "阻断"}</span>
          <strong>外部数据访问</strong>
          <p>checkpoint 页面：${escapeHtml(accessAttempt.checkpoint_baiduyun_get?.result || "未尝试")}</p>
          <p>LSDSSIMR 页面：${escapeHtml(accessAttempt.lsdssimr_ieee_dataport_get?.result || "未尝试")}</p>
        </article>
      </div>
      <p class="dust-mamba-policy">${escapeHtml(audit.display_policy || "")}</p>
    </section>
  `;
}

function pixelPrecisionAuditPanel(audit) {
  if (!audit) {
    return "";
  }
  const summary = audit.precision_summary || {};
  const cells = audit.mask?.display_grid?.cells || [];
  const learnedAudit =
    audit.current_aoi_inference === "learned_model_inference_from_current_aoi_weak_labels";
  return `
    <section class="dust-pixel-precision-panel" data-shot="pixel-precision-audit">
      <div class="dust-panel-head">
        <h2>逐像元 mask 精度审计</h2>
        <p>${escapeHtml(
          learnedAudit
            ? "每个中尺度学习模型红色像元都会导出为 EPSG:4326 GeoJSON polygon。这样可以追溯 VIIRS 弱标签模型输出，同时不冒充 Element84 公开权重。"
            : "每个中尺度红色显示像元都会导出为 EPSG:4326 GeoJSON polygon。它提升截图可追溯性，但仍是渲染产品支持证据，不是模型推理。"
        )}</p>
      </div>
      <div class="dust-pixel-precision-summary">
        <span>${summary.active_red_pixels || 0} 个 active 红色像元</span>
        <span>${summary.aot_only_candidate_pixels || 0} 个 AOT-only 候选</span>
        <span>${summary.removed_candidate_pixels || 0} 个被移除候选</span>
        <span>${summary.estimated_area_per_active_cell_km2 || "未知"} km2 / active 像元</span>
        <span>${summary.display_cell_size_degrees?.lon || "?"} x ${summary.display_cell_size_degrees?.lat || "?"} 度</span>
      </div>
      <div class="dust-pixel-precision-grid">
        <article class="dust-pixel-precision-card">
          <span>${escapeHtml(audit.status)}</span>
          <strong>GeoJSON mask 导出</strong>
          <p>${escapeHtml(audit.mask?.path || "未导出")}</p>
          <p>要素数 ${summary.geojson_feature_count || 0}；mask 面积 ${audit.mask?.mask_area_km2 || "未知"} km2</p>
        </article>
        <article class="dust-pixel-precision-card">
          <span>精度门控</span>
          <strong>AOT -> Aerosol Type -> Shape</strong>
          <p>${summary.aot_only_candidate_pixels || 0} 个候选像元收紧为 ${
            summary.active_red_pixels || 0
          } 个 active 像元。</p>
          <p>相对 AOT-only 收缩：${summary.reduction_percent_from_aot_only || 0}%。</p>
        </article>
        <article class="dust-pixel-precision-card">
          <span>提升策略</span>
          <strong>${learnedAudit ? "弱标签推理" : "非模型推理"}</strong>
          <p>${escapeHtml(audit.display_policy || "")}</p>
        </article>
      </div>
      <div class="dust-pixel-cell-list">
        ${cells
          .map(
            (cell) => `
              <span>
                <strong>x${cell.x} y${cell.y}</strong>
                score=${cell.p}
              </span>
            `
          )
          .join("")}
      </div>
    </section>
  `;
}

function sourceScoreBadges(scores = []) {
  if (!scores.length) {
    return "<small>来源评分不可用</small>";
  }
  return scores
    .map(
      (score) =>
        `<small>${escapeHtml(score.role)} ${score.score} / ${score.threshold} ${
          score.passed ? "通过" : "未通过"
        }</small>`
    )
    .join("");
}

function mediumPixelEvidencePanel(pixelEvidence) {
  if (!pixelEvidence) {
    return "";
  }
  const summary = pixelEvidence.precision_summary || {};
  const activeRows = pixelEvidence.active_pixels.slice(0, 12);
  const removedRows = [
    ...pixelEvidence.removed_by_shape.slice(0, 6),
    ...pixelEvidence.removed_by_aerosol_type_gate.slice(0, 6),
  ];
  return `
    <section class="dust-medium-pixel-evidence-panel" data-shot="medium-pixel-evidence">
      <div class="dust-panel-head">
        <h2>中尺度像元证据表</h2>
        <p>每个 active VIIRS 显示像元都记录了它为何保留为红色：AOT 评分、Aerosol Type 评分、阈值通过 / 未通过和形态筛选决策。这里是渲染产品支持证据，不冒充未运行模型。</p>
      </div>
      <div class="dust-medium-pixel-summary">
        <span>${summary.shape_filtered_active_pixels || 0} 个 active 像元</span>
        <span>${summary.aot_only_candidate_pixels || 0} 个 AOT 候选</span>
        <span>${summary.aot_aerosol_type_intersection_pixels || 0} 个交集像元</span>
        <span>${summary.removed_by_aerosol_type_gate || 0} 个被气溶胶门控移除</span>
        <span>${summary.removed_by_shape_filter || 0} 个被形态筛选移除</span>
        <span>${summary.active_mask_area_km2 || 0} km2 显示面积</span>
      </div>
      <div class="dust-medium-pixel-grid">
        <div>
          <h3>保留红色像元</h3>
          <div class="dust-medium-pixel-list">
            ${activeRows
              .map(
                (pixel) => `
                  <article class="dust-medium-pixel-card is-kept">
                    <div>
                      <span>${escapeHtml(pixel.id)}</span>
                      <strong>x${pixel.x} y${pixel.y} · p=${pixel.display_probability}</strong>
                    </div>
                    <p>连通域 ${pixel.component_id || "?"}；${escapeHtml(pixel.decision)}；面积 ${pixel.estimated_area_km2 || "?"} km2</p>
                    <div class="dust-medium-source-scores">${sourceScoreBadges(pixel.source_scores)}</div>
                  </article>
                `
              )
              .join("")}
          </div>
        </div>
        <div>
          <h3>被拒绝候选</h3>
          <div class="dust-medium-pixel-list">
            ${removedRows
              .map(
                (pixel) => `
                  <article class="dust-medium-pixel-card is-removed">
                    <div>
                      <span>${escapeHtml(pixel.id)}</span>
                      <strong>x${pixel.x} y${pixel.y} · p=${pixel.display_probability}</strong>
                    </div>
                    <p>${escapeHtml(pixel.decision)} · ${escapeHtml(pixel.reasons.join("; "))}</p>
                    <div class="dust-medium-source-scores">${sourceScoreBadges(pixel.source_scores)}</div>
                  </article>
                `
              )
              .join("")}
          </div>
        </div>
      </div>
      <p class="dust-medium-pixel-policy">${escapeHtml(pixelEvidence.display_policy)}</p>
    </section>
  `;
}

function scaleTransitionTracePanel(trace) {
  if (!trace?.steps?.length) {
    return "";
  }
  const summary = trace.transition_summary || {};
  return `
    <section class="dust-scale-transition-panel" data-shot="scale-transition-trace">
      <div class="dust-panel-head">
        <h2>尺度递进追踪</h2>
        <p>智能体路径被显式展开：粗尺度告警像元缩小走廊范围，VIIRS 支持产品锁定 active 红色像元，同日 Sentinel-2 COG 提供源区 / 混淆项上下文，但不提升为沙尘分割结果。</p>
      </div>
      <div class="dust-scale-transition-summary">
        <span>${summary.coarse_alert_pixels || 0} 个粗尺度告警像元</span>
        <span>${summary.medium_candidate_pixels || 0} 个 VIIRS 候选</span>
        <span>${summary.medium_active_pixels || 0} 个中尺度 active 像元</span>
        <span>${summary.high_context_pixels || 0} 个高分辨率上下文像元</span>
        <span>模型提升 ${escapeHtml(summary.model_promotion || "阻断")}</span>
      </div>
      <div class="dust-scale-transition-grid">
        ${trace.steps
          .map(
            (step) => `
              <article class="dust-scale-transition-card ${escapeHtml(step.scale)}">
                <div>
                  <span>${escapeHtml(scaleText(step.scale))}</span>
                  <strong>${escapeHtml(step.label)}</strong>
                </div>
                <p>${escapeHtml(step.sensor)}</p>
                <p><b>工具：</b>${escapeHtml(step.tool_id)} · ${escapeHtml(step.evidence_status)}</p>
                <p><b>像元：</b>${(step.candidate_pixels !== undefined ? `${step.candidate_pixels} 个候选 -> ` : "")}${
                  step.red_pixels
                } 个红色 / 上下文像元 · ${step.mask_area_km2.toLocaleString("en-US")} km2</p>
                <p>${escapeHtml(step.reasoning)}</p>
                <small>${escapeHtml(step.limitations.join(" / "))}</small>
              </article>
            `
          )
          .join("")}
      </div>
      <div class="dust-scale-transition-links">
        ${trace.transitions
          .map(
            (transition) => `
              <article>
                <span>${escapeHtml(transition.status)}</span>
                <strong>${escapeHtml(transition.from)} -> ${escapeHtml(transition.to)}</strong>
                <p>${escapeHtml(transition.retained_signal)}</p>
                <p>${escapeHtml(transition.precision_gain)}</p>
              </article>
            `
          )
          .join("")}
      </div>
      <p class="dust-scale-transition-assessment">${escapeHtml(trace.agent_assessment)}</p>
    </section>
  `;
}

function multiscalePixelLockPanel(audit) {
  if (!audit) {
    return "";
  }
  const summaries = audit.scale_summaries || [];
  return `
    <section class="dust-multiscale-lock-panel" data-shot="multiscale-pixel-lock-audit">
      <div class="dust-panel-head">
          <h2>多尺度像元锁定审计</h2>
          <p>粗、中、高三个尺度的红色显示像元被导出为一条 EPSG:4326 GeoJSON 链。中尺度层可承载当前 AOI VIIRS 弱标签推理，粗尺度和高尺度仍保持为支持证据。</p>
      </div>
      <div class="dust-multiscale-lock-summary">
        <span>${audit.geojson?.feature_count || 0} 个已导出显示像元</span>
        <span>实际模型运行：${(audit.actual_model_runs || []).length}</span>
        <span>${escapeHtml(inferenceText(audit.current_aoi_inference))}</span>
      </div>
      <div class="dust-multiscale-lock-grid">
        ${summaries
          .map(
            (item) => `
              <article class="dust-multiscale-lock-card ${escapeHtml(item.scale)}">
                <span>${escapeHtml(scaleText(item.scale))}</span>
                <strong>${escapeHtml(item.sensor)}</strong>
                <p>${escapeHtml(item.mask_tool_id)} / ${escapeHtml(item.mask_status)}</p>
                <p>${item.active_red_pixels} 个红色像元；网格 ${item.grid.columns}x${item.grid.rows}；面积 ${item.mask_area_km2} km2</p>
                <small>${escapeHtml(item.promotion_status)}</small>
              </article>
            `
          )
          .join("")}
      </div>
      <div class="dust-lock-chain">
        ${(audit.lock_chain || []).map((item) => `<span>${escapeHtml(item)}</span>`).join("")}
      </div>
      <p class="dust-multiscale-lock-policy">${escapeHtml(audit.display_policy || "")}</p>
    </section>
  `;
}

function maskAssetPanel(manifest) {
  if (!manifest?.assets?.length) {
    return "";
  }
  return `
    <section class="dust-mask-asset-panel" data-shot="mask-assets">
      <div class="dust-panel-head">
          <h2>像元掩膜资产</h2>
          <p>每个尺度都导出透明红色 PNG mask，用于截图 overlay 和 mask 输出预览。它们保留像元颗粒感，并保留各尺度来源标签。</p>
      </div>
      <div class="dust-mask-asset-summary">
        <span>${manifest.assets.length} 个 mask PNG</span>
        <span>实际模型运行：${(manifest.actual_model_runs || []).length}</span>
        <span>${escapeHtml(inferenceText(manifest.current_aoi_inference))}</span>
      </div>
      <div class="dust-mask-asset-grid">
        ${manifest.assets
          .map(
            (asset) => `
              <article class="dust-mask-asset-card ${escapeHtml(asset.scale)}">
                <div class="dust-mask-asset-preview">
                  <img src="./${escapeHtml(asset.path)}" alt="${escapeHtml(asset.scale)} red pixel mask PNG" />
                </div>
                <span>${escapeHtml(scaleText(asset.scale))} PNG mask</span>
                <strong>${escapeHtml(asset.sensor)}</strong>
                <p>${asset.active_red_pixels} 个红色像元；${asset.width}x${asset.height}px PNG；面积 ${asset.mask_area_km2} km2</p>
                <small>${escapeHtml(asset.status)} / ${escapeHtml(asset.opacity_policy)}</small>
              </article>
            `
          )
          .join("")}
      </div>
      <p class="dust-mask-asset-policy">${escapeHtml(manifest.display_policy || "")}</p>
    </section>
  `;
}

function compositeOverlayPanel(manifest) {
  if (!manifest?.assets?.length) {
    return "";
  }
  return `
    <section class="dust-composite-overlay-panel" data-shot="composite-overlays">
      <div class="dust-panel-head">
          <h2>底图 + 掩膜合成资产</h2>
          <p>每张 PNG 都是某一尺度的当前底图加红色逐像元异常 / 支持像元。中尺度合成图可展示 VIIRS 弱标签学习 mask，其他尺度保持 support-only 标注。</p>
      </div>
      <div class="dust-composite-overlay-summary">
        <span>${manifest.assets.length} 个合成 PNG</span>
        <span>实际模型运行：${(manifest.actual_model_runs || []).length}</span>
        <span>${escapeHtml(inferenceText(manifest.current_aoi_inference))}</span>
      </div>
      <div class="dust-composite-overlay-grid">
        ${manifest.assets
          .map(
            (asset) => `
              <article class="dust-composite-overlay-card ${escapeHtml(asset.scale)}">
                <div class="dust-composite-preview">
                  <img src="./${escapeHtml(asset.path)}" alt="${escapeHtml(asset.scale)} basemap with red pixel mask composite" />
                </div>
                <span>${escapeHtml(scaleText(asset.scale))} 合成图</span>
                <strong>${escapeHtml(asset.sensor)}</strong>
                <p>${asset.active_red_pixels} 个红色像元；${asset.width}x${asset.height}px；面积 ${asset.mask_area_km2} km2</p>
                <small>${escapeHtml(asset.basemap_source)} / ${escapeHtml(asset.mask_status)}</small>
              </article>
            `
          )
          .join("")}
      </div>
      <p class="dust-composite-overlay-policy">${escapeHtml(manifest.display_policy || "")}</p>
    </section>
  `;
}

function meteorologyPanel(meteorology) {
  if (!meteorology) {
    return "";
  }
  const summary = meteorology.evidence_summary;
  return `
    <section class="dust-meteorology-panel" data-shot="meteorology">
      <div class="dust-panel-head">
        <h2>气象证据</h2>
        <p>${escapeHtml(meteorology.source)} 在 ${escapeHtml(meteorology.time_window_utc)} 的快照。这是点采样输送证据，不是沙尘像元分类。</p>
      </div>
      <div class="dust-meteorology-summary">
        <span>风场支持：${summary.wind_support ? "是" : "否 / 混合"}</span>
        <span>湿度支持：${summary.humidity_support ? "是" : "否"}</span>
        <span>输送方向：${escapeHtml(summary.transport_direction)}</span>
      </div>
      <div class="dust-meteorology-grid">
        ${meteorology.points
          .map(
            (point) => `
              <article>
                <strong>${escapeHtml(point.label)}</strong>
                <span>${point.lon}, ${point.lat}</span>
                <p>平均风速 ${point.mean_wind_speed_m_s} m/s，来向 ${escapeHtml(point.mean_wind_from_cardinal)}；推断输送 ${escapeHtml(point.inferred_transport_to_cardinal)}。</p>
                <p>平均相对湿度 ${point.mean_relative_humidity_percent}% · 2m 温度 ${point.mean_temperature_c} C</p>
              </article>
            `
          )
          .join("")}
      </div>
      <p class="dust-meteorology-note">${escapeHtml(summary.precursor_signal_summary)}</p>
    </section>
  `;
}

function highResolutionCandidateList(candidates = []) {
  if (!candidates.length) {
    return "";
  }
  return `
    <div class="dust-high-candidate-list" data-shot="high-resolution-candidates">
      <h3>STAC 候选影像发现</h3>
      ${candidates
        .map(
          (candidate) => `
            <article class="dust-high-candidate-card">
              <span>${escapeHtml(candidate.provider)}</span>
              <strong>${escapeHtml(candidate.item)}</strong>
              <small>${escapeHtml(candidate.datetime)} - 云量 ${escapeHtml(candidate.cloudCover)} - 时间偏移 ${candidate.temporalOffsetDays} 天</small>
              <p>${escapeHtml(candidate.assetRole)}</p>
            </article>
          `
        )
        .join("")}
    </div>
  `;
}

function highResolutionAuditPanel(audit) {
  return `
    <section class="dust-high-audit-panel" data-shot="high-resolution-audit">
      <div class="dust-panel-head">
        <h2>高分辨率审计</h2>
        <p>用户路径中保留同日 COG 的高分辨率步骤，但当前证据只用于支持解释。本面板避免把 Sentinel-2 视图误认为模型推理。</p>
      </div>
      <div class="dust-high-audit-grid">
        <figure class="dust-high-audit-image">
          <img src="${escapeHtml(sentinelThumbnail)}" alt="Sentinel-2 high-resolution context" />
          <figcaption>${escapeHtml(audit.source)} · 影像 ${escapeHtml(audit.imageryDate)} · 事件 ${escapeHtml(audit.eventDate)}</figcaption>
        </figure>
        <div class="dust-high-audit-facts">
          <span>时间偏移：${audit.temporalOffsetDays} 天</span>
          <strong>${escapeHtml(audit.currentMaskStatus)}</strong>
          <p>${escapeHtml(audit.modelStatus)}</p>
          <p>${escapeHtml(audit.stacSearchStatus)}</p>
          <p>${escapeHtml(audit.stacSearchSummary)}</p>
          <p>${escapeHtml(audit.displayPolicy)}</p>
        </div>
      </div>
      ${highResolutionCandidateList(audit.searchCandidates)}
    </section>
  `;
}

function rawAotAuditPanel(audit) {
  if (!audit) {
    return "";
  }
  const supportPercent = ((audit.grid.support_cells / Math.max(1, audit.grid.valid_cells)) * 100).toFixed(1);
  const stats = audit.stats;
  return `
    <section class="dust-raw-aot-panel" data-shot="raw-aot-audit">
      <div class="dust-panel-head">
        <h2>Sentinel-2 SCL 筛选原始 AOT + NDVI COG 审计</h2>
        <p>本轮保留同日 Sentinel-2 AOT、B04、B08、SCL 和 TCI COG 支持。红色像元只是经过 SCL 筛选的气溶胶 / 源区支持像元，不是训练后的 Sentinel-2 沙尘异常 mask，也不是模型推理。</p>
      </div>
      <div class="dust-raw-aot-grid">
        <figure class="dust-raw-aot-frame">
          <img src="${escapeHtml(sentinelThumbnail)}" alt="Sentinel-2 thumbnail with raw AOT and NDVI support audit grid" />
          ${supportMaskSvg(audit)}
          <figcaption>${escapeHtml(audit.source_item)} -> 原始 AOT/B04/B08/SCL COG 采样到 ${audit.grid.columns}x${audit.grid.rows}</figcaption>
        </figure>
        <div class="dust-raw-aot-facts">
          <span>${escapeHtml(audit.status)}</span>
          <strong>${audit.grid.support_cells} / ${audit.grid.valid_cells} 个支持像元 (${supportPercent}%)</strong>
          <p>阈值：仅 SCL clear/source 类；AOT q${Math.round(audit.grid.threshold_quantile * 100)} = ${audit.grid.threshold_value}；NDVI <= ${audit.spectral_support?.ndvi_threshold ?? "n/a"}；亮度 >= ${audit.spectral_support?.brightness_threshold ?? "n/a"}；事件 ${escapeHtml(
            audit.event_date
          )}；影像 ${escapeHtml(audit.datetime)}；时间偏移 ${audit.temporal_offset_days} 天；云量 ${audit.cloud_cover_percent ?? "未知"}%。</p>
          <p>${escapeHtml(audit.display_policy)}</p>
          <p>来源：<a href="${escapeHtml(audit.source_url)}" target="_blank" rel="noreferrer">Sentinel-2 AOT COG</a> + B04/B08/SCL COG</p>
          <div class="dust-raw-aot-stats">
            <span>q50 ${stats.q50}</span>
            <span>q75 ${stats.q75}</span>
            <span>q90 ${stats.q90}</span>
            <span>q95 ${stats.q95}</span>
            <span>max ${stats.max}</span>
          </div>
        </div>
      </div>
    </section>
  `;
}

function confounderEvidencePanel(confounderEvidence) {
  if (!confounderEvidence?.checks?.length) {
    return "";
  }
  const resultClass = (result) =>
    String(result).includes("fail")
      ? "is-fail"
      : result === "unknown" || result === "unresolved"
        ? "is-unknown"
        : "is-pass";
  return `
    <section class="dust-confounder-panel" data-shot="confounder-evidence">
      <div class="dust-panel-head">
        <h2>混淆项互斥矩阵</h2>
        <p>烟羽、活火、火烧区、云和时间错配检查以通过 / 未通过 / 未知显示。未知检查不会增强沙尘解释。</p>
      </div>
      <div class="dust-confounder-summary">
        <span>${escapeHtml(confounderEvidence.summary.gate_decision)}</span>
        <span>实际模型运行：${confounderEvidence.actual_model_runs.length}</span>
        <span>置信度上限：${escapeHtml(confounderEvidence.summary.confidence_cap)}</span>
      </div>
      <div class="dust-confounder-grid">
        ${confounderEvidence.checks
          .map(
            (check) => `
              <article class="dust-confounder-card ${resultClass(check.result)}">
                <div>
                  <span>${escapeHtml(check.status)}</span>
                  <strong>${escapeHtml(check.label)}</strong>
                </div>
                <p><b>结果：</b>${escapeHtml(check.result)} · 冲突=${escapeHtml(check.conflict_flag)}</p>
                <p><b>工具：</b>${escapeHtml(check.tool_id)} · ${escapeHtml(check.sensor)}</p>
                <p>${escapeHtml(check.reasoning)}</p>
                <small>${escapeHtml(check.display_policy)}</small>
              </article>
            `
          )
          .join("")}
      </div>
      <p class="dust-confounder-policy">${escapeHtml(confounderEvidence.display_policy)}</p>
    </section>
  `;
}

function sensorModelGatePanel(gate) {
  if (!gate?.bindings?.length) {
    return "";
  }
  const decisionClass = (decision) =>
    decision === "blocked_by_input"
      ? "is-blocked"
      : decision === "demo_or_support_only"
        ? "is-demo"
        : "is-support";
  return `
    <section class="dust-sensor-gate-panel" data-shot="sensor-model-gate">
      <div class="dust-panel-head">
        <h2>传感器-模型绑定门控</h2>
        <p>每个红色 mask 必须绑定自己的卫星 / 传感器和模型。支持层或演示层只有满足全部提升条件后，才能成为真实沙尘 mask。</p>
      </div>
      <div class="dust-gate-criteria">
        ${gate.promotion_criteria.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}
      </div>
      <div class="dust-gate-grid">
        ${gate.bindings
          .map(
            (binding) => `
              <article class="dust-gate-card ${decisionClass(binding.gate_decision)}">
                <div>
                  <span>${escapeHtml(binding.scale)}</span>
                  <strong>${escapeHtml(binding.display_sensor)}</strong>
                </div>
                <p><b>目标模型：</b>${escapeHtml(binding.target_model)}</p>
                <p><b>当前 mask：</b>${escapeHtml(binding.current_mask_tool)} - ${escapeHtml(
                  binding.current_mask_status
                )}</p>
                <p><b>门控：</b>${escapeHtml(binding.gate_decision)}；可提升=${booleanText(
                  binding.can_promote_to_real_dust_mask
                )}</p>
                <p>${escapeHtml(binding.reason)}</p>
                <small>${escapeHtml(binding.next_required_action)}</small>
              </article>
            `
          )
          .join("")}
      </div>
    </section>
  `;
}

function modelContractAuditPanel(audit) {
  if (!audit?.per_scale?.length) {
    return "";
  }
  const scaleCards = audit.per_scale
    .map(
      (item) => `
        <article class="dust-contract-card ${item.model_promotion_pass ? "is-promoted" : "is-blocked"}">
          <div>
            <span>${escapeHtml(scaleText(item.scale))}</span>
            <strong>${item.display_contract_pass ? "展示契约通过" : "展示契约未通过"}</strong>
          </div>
          <p><b>模型提升：</b>${item.model_promotion_pass ? "通过" : "阻断"}</p>
          <p><b>门控：</b>${escapeHtml(item.gate_decisions.join(", "))}</p>
          <p>${escapeHtml(item.display_policy)}</p>
          ${
            item.active_display_layer
              ? `<small>Active 图层：${escapeHtml(item.active_display_layer.id)} · ${item.active_display_layer.mask_cells} px · ${escapeHtml(
                  item.active_display_layer.precision_controls.join(" / ")
                )}</small>`
              : ""
          }
        </article>
      `
    )
    .join("");
  return `
    <section class="dust-contract-audit-panel" data-shot="model-contract-audit">
      <div class="dust-panel-head">
        <h2>模型输出契约审计</h2>
        <p>展示通过表示该图层足够可追溯，可用于支持可视化。模型提升仍需同传感器模型推理、AOI/时间、置信度和混淆项检查全部满足。</p>
      </div>
      <div class="dust-contract-summary">
        <span>${audit.display_contract_pass_count} / ${audit.per_scale.length} 个展示契约通过</span>
        <span>${audit.model_promotion_pass_count} 个模型提升</span>
        <span>实际模型运行：${audit.actual_model_runs.length}</span>
        <span>${escapeHtml(audit.status)}</span>
      </div>
      <div class="dust-contract-grid">${scaleCards}</div>
      <p class="dust-contract-policy">${escapeHtml(audit.fail_closed_policy)}</p>
    </section>
  `;
}

function adapterOutputContractPanel(matrix) {
  if (!matrix?.contracts?.length) {
    return "";
  }
  const primaryContracts = matrix.contracts.filter((item) => item.primary_role === "main_dust_detection");
  const conflictContracts = matrix.contracts.filter((item) => item.primary_role === "confounder_rejection");
  const referenceContracts = matrix.contracts.filter((item) => item.primary_role !== "main_dust_detection" && item.primary_role !== "confounder_rejection");
  const cards = matrix.contracts
    .map((item) => {
      const requiredOutputs = item.required_outputs.map((output) => output.name).join(" / ");
      const blockers = item.promotion_blockers.slice(0, 3).join(" / ");
      return `
        <article class="dust-adapter-contract-card ${item.can_replace_current_red_mask_now ? "is-ready" : "is-blocked"}">
          <div>
            <span>${escapeHtml(scaleText(item.target_scale))} - ${escapeHtml(item.current_status)}</span>
            <strong>${escapeHtml(item.adapter_id)}</strong>
          </div>
          <p><b>替换目标：</b>${escapeHtml(item.current_ui_replacement_target)}</p>
          <p><b>必须输出：</b>${escapeHtml(requiredOutputs)}</p>
          <p><b>阻断项：</b>${escapeHtml(blockers)}</p>
          <small>${escapeHtml(item.display_policy)}</small>
        </article>
      `;
    })
    .join("");
  const replacementRows = matrix.replacement_matrix
    .map(
      (item) => `
        <span>
          <strong>${escapeHtml(item.scale)}</strong>
          ${escapeHtml(item.current_mask_tool)} -> ${escapeHtml(item.target_adapter)} / ${escapeHtml(item.replacement_decision)}
        </span>
      `
    )
    .join("");
  return `
    <section class="dust-adapter-contract-panel" data-shot="adapter-output-contracts">
      <div class="dust-panel-head">
        <h2>模型适配器输出契约</h2>
        <p>每个模型必须写出明确的 mask / probability / metadata，才可以替换当前红色支持像元。混淆项模型只能添加冲突证据。</p>
      </div>
      <div class="dust-adapter-contract-summary">
        <span>${primaryContracts.length} 个主检测契约</span>
        <span>${conflictContracts.length} 个混淆项契约</span>
        <span>${referenceContracts.length} 个参考 / 模板契约</span>
        <span>实际模型运行：${matrix.actual_model_runs.length}</span>
        <span>${escapeHtml(matrix.status)}</span>
      </div>
      <div class="dust-adapter-replacement-grid">${replacementRows}</div>
      <div class="dust-adapter-contract-grid">${cards}</div>
      <p class="dust-contract-policy">${escapeHtml(matrix.fail_closed_policy)}</p>
    </section>
  `;
}

function maskLayerControls(comparison, activeLayer) {
  if (!comparison) {
    return "";
  }
  const options = [
    ...(comparison.coalition
      ? [
          [
            "coalition",
            "协同最终 mask",
            comparison.coalition.mask.display_grid.cells.length,
            "多智能体主导颜色",
          ],
        ]
      : []),
    ...(comparison.multichannel
      ? [
          [
            "multichannel",
            "多通道 VIIRS 模型",
            comparison.multichannel.mask.display_grid.cells.length,
            "AOT+类型+RGB 推理",
          ],
        ]
      : []),
    ...(comparison.learned
      ? [["learned", "VIIRS 学习模型", comparison.learned.mask.display_grid.cells.length, "弱标签推理"]]
      : []),
    ...(comparison.rawFootprint
      ? [["footprint", "原始 L2 footprint", comparison.rawFootprint.mask.display_grid.cells.length, "原始像元 footprint"]]
      : []),
    ...(comparison.rawScience
      ? [["raw", "原始 VIIRS L2", comparison.rawScience.mask.display_grid.cells.length, "科学值支持"]]
      : []),
    ["shape", "形态筛选", comparison.shapeFiltered.mask.display_grid.cells.length, "默认 active anomaly"],
    ["intersection", "AOT + Aerosol Type", comparison.refined.mask.display_grid.cells.length, "形态前 active mask"],
    ["aot", "AOT-only", comparison.baseline.mask.display_grid.cells.length, "候选支持"],
    ["removed", "被移除像元", comparison.removed.mask.display_grid.cells.length, "不是 active anomaly"],
  ];
  return `
    <div class="dust-mask-layer-switcher" data-shot="mask-layer-switcher">
      <span>中尺度 mask 图层</span>
      ${options
        .map(
          ([key, label, count, note]) => `
            <button class="${key === activeLayer ? "is-active" : ""}" type="button" data-mask-layer="${key}">
              <strong>${escapeHtml(label)}</strong>
              <small>${count} px - ${escapeHtml(note)}</small>
            </button>
          `
        )
        .join("")}
    </div>
  `;
}

function outputForMaskLayer(view, output, comparison, activeLayer) {
  if (view.scale !== "medium" || !comparison) {
    return output;
  }
  if (activeLayer === "coalition" && comparison.coalition) {
    return comparison.coalition;
  }
  if (activeLayer === "multichannel" && comparison.multichannel) {
    return comparison.multichannel;
  }
  if (activeLayer === "learned" && comparison.learned) {
    return comparison.learned;
  }
  if (activeLayer === "footprint" && comparison.rawFootprint) {
    return comparison.rawFootprint;
  }
  if (activeLayer === "raw" && comparison.rawScience) {
    return comparison.rawScience;
  }
  if (activeLayer === "shape") {
    return comparison.shapeFiltered;
  }
  if (activeLayer === "aot") {
    return comparison.baseline;
  }
  if (activeLayer === "removed") {
    return comparison.removed;
  }
  return comparison.refined;
}

function coalitionMapLegend(output) {
  if (!output?.coalition?.agents) {
    return "";
  }
  return `
    <div class="dust-coalition-map-legend">
      ${Object.values(output.coalition.agents)
        .map(
          (agent) => `
            <span>
              <i style="background:${escapeHtml(agent.color)}"></i>
              ${escapeHtml(agent.role)}：${agent.dominant_cells}
            </span>
          `
        )
        .join("")}
    </div>
  `;
}

function mainMap(view, output, comparison = null, activeLayer = "intersection") {
  const shownOutput = outputForMaskLayer(view, output, comparison, activeLayer);
  const inferenceLabel =
    shownOutput.current_aoi_inference === "learned_model_inference_from_current_aoi_weak_labels"
      ? "学习模型推理 / 弱标签"
      : "非模型推理";
  const maskLabel = shownOutput.coalition
    ? "多智能体协同 mask"
    : shownOutput.mask.pixel_class === "removed_candidate_pixel"
      ? "被移除候选像元"
      : "红色逐像元 mask";
  return `
    <div class="dust-map-head">
      <div>
        <span>${escapeHtml(view.sensor)}</span>
        <strong>${escapeHtml(view.title)} · ${escapeHtml(view.date)}</strong>
      </div>
      <div class="dust-source-badges">
        ${view.badges.map((badge) => `<span>${escapeHtml(badge)}</span>`).join("")}
      </div>
    </div>
    ${view.scale === "medium" ? maskLayerControls(comparison, activeLayer) : ""}
    <div class="dust-map-frame">
      <img src="${escapeHtml(imageUrlForView(view))}" alt="${escapeHtml(view.sensor)} basemap" />
      ${maskSvg(shownOutput)}
      ${coalitionMapLegend(shownOutput)}
      <div class="dust-map-overlay-note">
        <strong>${escapeHtml(maskLabel)}</strong>
        <span>阈值 ${escapeHtml(thresholdText(shownOutput))}</span>
        <span>${escapeHtml(statusText(shownOutput.derivation.status))} · ${escapeHtml(inferenceLabel)}</span>
      </div>
      <div class="dust-map-closeup">${maskSvg(shownOutput)}</div>
    </div>
    <div class="dust-map-meta">
      <span>图层 ${escapeHtml(view.request.layer)}</span>
      <span>bbox ${escapeHtml(view.request.bbox.join(", "))}</span>
      <span>${shownOutput.mask.display_grid.cells.length} ${escapeHtml(view.mask.cellLabel)}</span>
      <span>mask 面积约 ${shownOutput.mask.mask_area_km2.toLocaleString("en-US")} km2</span>
      <span>${escapeHtml(activeOutputStatus(shownOutput, view))}</span>
    </div>
  `;
}

function activeOutputStatus(output, view) {
  if (output.coalition) {
    return "当前 AOI 多智能体协同 mask，基于已执行 VIIRS 模型输出";
  }
  if (output.current_aoi_inference === "learned_model_inference_from_current_aoi_weak_labels") {
    return "当前 AOI 弱标签学习模型已执行";
  }
  if (output.derivation.status === "executed comparison view" || output.derivation.status === "已执行对比视图") {
    return "对比层已执行；被移除候选不是 active anomaly";
  }
  if (output.derivation.status !== "executed") {
    return view.outputStatus;
  }
  return output.derivation.thresholds?.length > 1
    ? "渲染产品交集已执行；不是模型推理"
    : "渲染产品阈值已执行；不是模型推理";
}

function thresholdText(output) {
  return output.derivation.thresholds?.length > 1
    ? output.derivation.thresholds.map((item) => `${item.role} ${item.threshold}`).join(" + ")
    : String(output.mask.threshold);
}

function renderPage({
  registry,
  outputs,
  meteorology,
  maskComparisons,
  rawAotAudit,
  modisAudit,
  sensorModelGate,
  modelContractAudit,
  modisInputContract,
  dustMambaAudit,
  pixelPrecisionAudit,
  multiscalePixelLockAudit,
  maskAssetManifest,
  compositeOverlayManifest,
  highResolutionSceneSelection,
  confounderEvidence,
  mediumPixelEvidence,
  scaleTransitionTrace,
  adapterOutputContracts,
  realGibsDataRun,
  viirsRawGranuleAudit,
  viirsRawMaskOutput,
  viirsRawFootprintOutput,
  viirsMultichannelOutput,
  viirsLearnedOutput,
  rivasModelOutputImport,
  activeScale = "medium",
}) {
  const activeView = scaleViews[activeScale] || scaleViews.medium;
  const activeOutput = outputs[activeView.scale];
  let currentScale = activeView.scale;
  let activeMaskLayer =
    activeView.scale === "medium" && maskComparisons.medium?.coalition
      ? "coalition"
      : activeView.scale === "medium" && maskComparisons.medium?.multichannel
      ? "multichannel"
      : activeView.scale === "medium" && maskComparisons.medium?.learned
      ? "learned"
      : activeView.scale === "medium" && maskComparisons.medium?.rawFootprint
        ? "footprint"
        : activeView.scale === "medium" && maskComparisons.medium?.rawScience
          ? "raw"
          : "shape";
  const initialShownOutput = outputForMaskLayer(activeView, activeOutput, maskComparisons[activeView.scale], activeMaskLayer);
  const schemaPreview = {
    selected_scale: activeView.scale,
    outputs: Object.fromEntries(Object.entries(outputs).map(([key, value]) => [key, value])),
    medium_mask_decision_trace: buildMediumDecisionTrace(maskComparisons.medium),
    high_raw_aot_audit: rawAotAudit
      ? {
          tool_id: rawAotAudit.tool_id,
          status: rawAotAudit.status,
          support_cells: rawAotAudit.grid.support_cells,
          valid_cells: rawAotAudit.grid.valid_cells,
          threshold_quantile: rawAotAudit.grid.threshold_quantile,
          threshold_value: rawAotAudit.grid.threshold_value,
          display_policy: rawAotAudit.display_policy,
        }
      : null,
    modis_3dcnn_local_audit: modisAudit
      ? {
          tool_id: modisAudit.tool_id,
          status: modisAudit.status,
          current_aoi_inference: modisAudit.current_aoi_inference,
          selected_reference_case: modisAudit.selected_reference_case,
          overall_metrics: modisAudit.overall_metrics,
          display_policy: modisAudit.display_policy,
        }
      : null,
    modis_3dcnn_input_contract: modisInputContract
      ? {
          round: modisInputContract.round,
          status: modisInputContract.status,
          current_aoi_inference: modisInputContract.current_aoi_inference,
          complete_cases: modisInputContract.complete_cases,
          can_run_local_inference_now: modisInputContract.promotion_decision.can_run_local_inference_now,
          can_promote_to_current_aoi_dust_mask:
            modisInputContract.promotion_decision.can_promote_to_current_aoi_dust_mask,
        }
      : null,
    dust_mamba_repo_audit: dustMambaAudit
      ? {
          round: dustMambaAudit.round,
          status: dustMambaAudit.status,
          current_aoi_inference: dustMambaAudit.current_aoi_inference,
          actual_model_runs: dustMambaAudit.actual_model_runs,
          checkpoint_available_locally: dustMambaAudit.checkpoint_audit?.checkpoint_available_locally,
          expected_input_channels: dustMambaAudit.input_contract?.expected_input_channels,
          can_run_local_inference_now: dustMambaAudit.promotion_decision?.can_run_local_inference_now,
          can_promote_to_current_aoi_dust_mask:
            dustMambaAudit.promotion_decision?.can_promote_to_current_aoi_dust_mask,
          display_policy: dustMambaAudit.display_policy,
        }
      : null,
    medium_pixel_precision_audit: pixelPrecisionAudit
      ? {
          round: pixelPrecisionAudit.round,
          status: pixelPrecisionAudit.status,
          current_aoi_inference: pixelPrecisionAudit.current_aoi_inference,
          actual_model_runs: pixelPrecisionAudit.actual_model_runs,
          mask_path: pixelPrecisionAudit.mask?.path,
          active_red_pixels: pixelPrecisionAudit.precision_summary?.active_red_pixels,
          geojson_feature_count: pixelPrecisionAudit.precision_summary?.geojson_feature_count,
          display_policy: pixelPrecisionAudit.display_policy,
        }
      : null,
    multiscale_pixel_lock_audit: multiscalePixelLockAudit
      ? {
          round: multiscalePixelLockAudit.round,
          status: multiscalePixelLockAudit.status,
          current_aoi_inference: multiscalePixelLockAudit.current_aoi_inference,
          actual_model_runs: multiscalePixelLockAudit.actual_model_runs,
          geojson_path: multiscalePixelLockAudit.geojson?.path,
          geojson_feature_count: multiscalePixelLockAudit.geojson?.feature_count,
          per_scale: multiscalePixelLockAudit.scale_summaries?.map((item) => ({
            scale: item.scale,
            sensor: item.sensor,
            active_red_pixels: item.active_red_pixels,
            mask_status: item.mask_status,
            promotion_status: item.promotion_status,
          })),
          display_policy: multiscalePixelLockAudit.display_policy,
        }
      : null,
    pixel_mask_asset_manifest: maskAssetManifest
      ? {
          round: maskAssetManifest.round,
          status: maskAssetManifest.status,
          current_aoi_inference: maskAssetManifest.current_aoi_inference,
          actual_model_runs: maskAssetManifest.actual_model_runs,
          assets: maskAssetManifest.assets?.map((asset) => ({
            scale: asset.scale,
            path: asset.path,
            type: asset.type,
            active_red_pixels: asset.active_red_pixels,
            status: asset.status,
            tool_id: asset.tool_id,
          })),
          display_policy: maskAssetManifest.display_policy,
        }
      : null,
    composite_overlay_manifest: compositeOverlayManifest
      ? {
          round: compositeOverlayManifest.round,
          status: compositeOverlayManifest.status,
          current_aoi_inference: compositeOverlayManifest.current_aoi_inference,
          actual_model_runs: compositeOverlayManifest.actual_model_runs,
          assets: compositeOverlayManifest.assets?.map((asset) => ({
            scale: asset.scale,
            path: asset.path,
            type: asset.type,
            active_red_pixels: asset.active_red_pixels,
            mask_status: asset.mask_status,
            mask_tool_id: asset.mask_tool_id,
          })),
          display_policy: compositeOverlayManifest.display_policy,
        }
      : null,
    high_resolution_scene_selection: highResolutionSceneSelection
      ? {
          round: highResolutionSceneSelection.round,
          status: highResolutionSceneSelection.status,
          selected: {
            id: highResolutionSceneSelection.selected.id,
            datetime: highResolutionSceneSelection.selected.datetime,
            cloud_cover: highResolutionSceneSelection.selected.cloud_cover,
            temporal_offset_days: highResolutionSceneSelection.selected.temporal_offset_days,
            valid_ratio: highResolutionSceneSelection.selected.metrics.valid_ratio,
            local_thumbnail_path: highResolutionSceneSelection.selected.local_thumbnail_path,
            display_policy: highResolutionSceneSelection.selected.display_policy,
          },
          actual_model_runs: highResolutionSceneSelection.actual_model_runs,
        }
      : null,
    confounder_evidence_matrix: confounderEvidence
      ? {
          round: confounderEvidence.round,
          status: confounderEvidence.status,
          actual_model_runs: confounderEvidence.actual_model_runs,
          gate_decision: confounderEvidence.summary?.gate_decision,
          checks: confounderEvidence.checks.map((check) => ({
            id: check.id,
            tool_id: check.tool_id,
            result: check.result,
            conflict_flag: check.conflict_flag,
            status: check.status,
          })),
          display_policy: confounderEvidence.display_policy,
        }
      : null,
    medium_pixel_evidence_table: mediumPixelEvidence
      ? {
          round: mediumPixelEvidence.round,
          status: mediumPixelEvidence.status,
          current_aoi_inference: mediumPixelEvidence.current_aoi_inference,
          actual_model_runs: mediumPixelEvidence.actual_model_runs,
          precision_summary: mediumPixelEvidence.precision_summary,
          active_pixel_count: mediumPixelEvidence.active_pixels.length,
          removed_by_shape_count: mediumPixelEvidence.removed_by_shape.length,
          removed_by_aerosol_type_gate_count: mediumPixelEvidence.removed_by_aerosol_type_gate.length,
          display_policy: mediumPixelEvidence.display_policy,
        }
      : null,
    scale_transition_trace: scaleTransitionTrace
      ? {
          round: scaleTransitionTrace.round,
          status: scaleTransitionTrace.status,
          current_aoi_inference: scaleTransitionTrace.current_aoi_inference,
          actual_model_runs: scaleTransitionTrace.actual_model_runs,
          transition_summary: scaleTransitionTrace.transition_summary,
          transitions: scaleTransitionTrace.transitions.map((transition) => ({
            id: transition.id,
            status: transition.status,
            retained_signal: transition.retained_signal,
            precision_gain: transition.precision_gain,
          })),
          display_policy: scaleTransitionTrace.display_policy,
        }
      : null,
    sensor_model_gate: sensorModelGate
      ? {
          round: sensorModelGate.round,
          promotion_criteria: sensorModelGate.promotion_criteria,
          bindings: sensorModelGate.bindings.map((binding) => ({
            id: binding.id,
            scale: binding.scale,
            target_model: binding.target_model,
            current_mask_tool: binding.current_mask_tool,
            gate_decision: binding.gate_decision,
            can_promote_to_real_dust_mask: binding.can_promote_to_real_dust_mask,
          })),
        }
      : null,
    model_contract_audit: modelContractAudit
      ? {
          round: modelContractAudit.round,
          status: modelContractAudit.status,
          display_contract_pass_count: modelContractAudit.display_contract_pass_count,
          model_promotion_pass_count: modelContractAudit.model_promotion_pass_count,
          actual_model_runs: modelContractAudit.actual_model_runs,
          per_scale: modelContractAudit.per_scale.map((item) => ({
            scale: item.scale,
            display_contract_pass: item.display_contract_pass,
            model_promotion_pass: item.model_promotion_pass,
            gate_decisions: item.gate_decisions,
          })),
        }
      : null,
    adapter_output_contracts: adapterOutputContracts
      ? {
          round: adapterOutputContracts.round,
          status: adapterOutputContracts.status,
          current_aoi_inference: adapterOutputContracts.current_aoi_inference,
          actual_model_runs: adapterOutputContracts.actual_model_runs,
          contract_count: adapterOutputContracts.contracts.length,
          contracts: adapterOutputContracts.contracts.map((item) => ({
            adapter_id: item.adapter_id,
            tool_id: item.tool_id,
            primary_role: item.primary_role,
            target_scale: item.target_scale,
            current_status: item.current_status,
            can_replace_current_red_mask_now: item.can_replace_current_red_mask_now,
            promotion_blockers: item.promotion_blockers,
          })),
          replacement_matrix: adapterOutputContracts.replacement_matrix,
          fail_closed_policy: adapterOutputContracts.fail_closed_policy,
        }
      : null,
    real_gibs_data_run: realGibsDataRun
      ? {
          round: realGibsDataRun.round,
          status: realGibsDataRun.status,
          current_aoi_inference: realGibsDataRun.current_aoi_inference,
          actual_model_runs: realGibsDataRun.actual_model_runs,
          product_count: realGibsDataRun.downloaded_products.length,
          active_red_pixels: realGibsDataRun.active_mask.active_red_pixels,
          active_mask_path: realGibsDataRun.active_mask.path,
          display_policy: realGibsDataRun.display_policy,
        }
      : null,
    viirs_deep_blue_raw_granule_audit: viirsRawGranuleAudit
      ? {
          round: viirsRawGranuleAudit.round,
          status: viirsRawGranuleAudit.status,
          local_raw_science_values_available: viirsRawGranuleAudit.local_raw_science_values_available,
          l2_count: viirsRawGranuleAudit.discovered_granules?.l2_count,
          d3_count: viirsRawGranuleAudit.discovered_granules?.d3_count,
          selected_l2: viirsRawGranuleAudit.discovered_granules?.selected_l2?.producer_granule_id,
          selected_d3: viirsRawGranuleAudit.discovered_granules?.selected_d3?.producer_granule_id,
          direct_download_checks: viirsRawGranuleAudit.direct_download_checks,
          ui_policy: viirsRawGranuleAudit.ui_policy,
        }
      : null,
    viirs_deep_blue_raw_science_mask: viirsRawMaskOutput
      ? {
          round: viirsRawMaskOutput.round,
          status: viirsRawMaskOutput.status,
          threshold: viirsRawMaskOutput.threshold,
          active_raw_pixels: viirsRawMaskOutput.mask.active_raw_pixels,
          active_cells: viirsRawMaskOutput.mask.active_cells,
          raw_l2_summary: viirsRawMaskOutput.raw_l2_summary,
          raw_d3_support_summary: viirsRawMaskOutput.raw_d3_support_summary,
          display_policy: viirsRawMaskOutput.display_policy,
        }
      : null,
    viirs_deep_blue_native_footprint_mask: viirsRawFootprintOutput
      ? {
          round: viirsRawFootprintOutput.round,
          source_round: viirsRawFootprintOutput.source_round,
          status: viirsRawFootprintOutput.status,
          threshold: viirsRawFootprintOutput.threshold,
          active_raw_pixels: viirsRawFootprintOutput.mask.active_raw_pixels,
          native_area_km2_estimate: viirsRawFootprintOutput.mask.native_area_km2_estimate,
          geojson_path: viirsRawFootprintOutput.mask.geojson_path,
          display_policy: viirsRawFootprintOutput.display_policy,
        }
      : null,
    viirs_multichannel_segmentation_model: viirsMultichannelOutput
      ? {
          round: viirsMultichannelOutput.round,
          status: viirsMultichannelOutput.status,
          current_aoi_inference: viirsMultichannelOutput.current_aoi_inference,
          active_cells: viirsMultichannelOutput.mask.active_cells,
          threshold: viirsMultichannelOutput.mask.threshold,
          validation: viirsMultichannelOutput.metrics.validation,
          probability_map_path: viirsMultichannelOutput.mask.probability_map_path,
          overlay_path: viirsMultichannelOutput.mask.overlay_path,
          checkpoint: viirsMultichannelOutput.provenance.checkpoint,
          display_policy: viirsMultichannelOutput.display_policy,
        }
      : null,
    viirs_element84_style_learned_model: viirsLearnedOutput
      ? {
          round: viirsLearnedOutput.round,
          status: viirsLearnedOutput.status,
          current_aoi_inference: viirsLearnedOutput.current_aoi_inference,
          active_cells: viirsLearnedOutput.mask.active_cells,
          threshold: viirsLearnedOutput.mask.threshold,
          validation: viirsLearnedOutput.metrics.validation,
          probability_map_path: viirsLearnedOutput.mask.probability_map_path,
          overlay_path: viirsLearnedOutput.mask.overlay_path,
          checkpoint: viirsLearnedOutput.provenance.checkpoint,
          display_policy: viirsLearnedOutput.display_policy,
        }
      : null,
    rivas_3dcnn_model_output_import: rivasModelOutputImport
      ? {
          round: rivasModelOutputImport.round,
          status: rivasModelOutputImport.status,
          current_aoi_inference: rivasModelOutputImport.current_aoi_inference,
          actual_model_runs: rivasModelOutputImport.actual_model_runs,
          selected_case: rivasModelOutputImport.selected_case,
          active_pixels: rivasModelOutputImport.mask.active_pixels,
          metrics: rivasModelOutputImport.metrics,
          outputs: rivasModelOutputImport.outputs,
          display_policy: rivasModelOutputImport.display_policy,
        }
      : null,
    active_case: {
      case_id: hexiCorridorCase.caseId,
      event_date: hexiCorridorCase.eventDate,
      bbox: hexiCorridorCase.bbox,
      label: hexiCorridorCase.label,
    },
  };

  app.innerHTML = `
    <header class="dust-agent-hero">
      <div>
        <p class="dust-eyebrow">沙尘智能体 · 1号目标</p>
        <h1>多尺度逐像元沙尘异常锁定</h1>
        <p>
          用户路径必须是低空间分辨率发现异常、中分辨率锁定异常、高分辨率分析异常。每个尺度都绑定自己的卫星/模型链，并在底图上显示逐像元 mask。当前中尺度 mask 使用已执行的 VIIRS 多通道弱标签分割模型作为提议层，再由原始 L2 footprint、AOT/Aerosol Type 和 RGB 弱标签智能体共同投票，最终用不同颜色表示主导贡献方。粗尺度仍是 GIBS 支持层，高尺度仍是 Sentinel-2 源区/混淆项解释。烟羽、活火、火烧区、云和荒漠背景以通过 / 未通过 / 未知证据矩阵显示，未知不会提升沙尘置信度。
        </p>
      </div>
      ${renderRegistrySummary(registry)}
    </header>

    ${caseAoiPanel()}

    <section class="dust-workflow-panel" data-shot="workflow">
      <div class="dust-panel-head">
        <h2>多尺度锁定流程</h2>
        <p id="dustScaleDetail">${escapeHtml(activeView.agentNote)}</p>
      </div>
      <div class="dust-scale-grid">${workflowCards(outputs)}</div>
    </section>

    <section class="dust-scale-gallery" data-shot="scale-gallery">
      <div class="dust-panel-head">
        <h2>不同尺度底图 + 红色像元掩膜</h2>
        <p>三套底图/模型绑定分开展示：粗尺度发现、中尺度锁定、高分辨率解释。不要跨卫星混用模型结果。</p>
      </div>
      <div class="dust-preview-grid">${scalePreviewCards(outputs)}</div>
    </section>

    ${dustMambaAuditPanel(dustMambaAudit)}

    ${maskComparisonPanel(maskComparisons.medium)}

    ${coalitionDecisionPanel(maskComparisons.medium)}

    ${decisionTracePanel(maskComparisons.medium)}

    ${pixelPrecisionAuditPanel(pixelPrecisionAudit)}

    ${mediumPixelEvidencePanel(mediumPixelEvidence)}

    ${scaleTransitionTracePanel(scaleTransitionTrace)}

    <section class="dust-main-grid">
      <div class="dust-map-panel" data-shot="mask-closeup" id="dustMainMap">${mainMap(
        activeView,
        activeOutput,
        maskComparisons[activeView.scale],
        activeMaskLayer
      )}</div>
      <aside class="dust-tool-panel" data-shot="tool-calls">
        <div class="dust-panel-head compact">
          <h2>智能体工具调用</h2>
          <p id="dustToolScaleLabel">${escapeHtml(activeView.label)} · ${escapeHtml(activeView.modelTool)}</p>
        </div>
        <div class="dust-tool-list" id="dustToolList">${toolCallCards(
          registry.tools,
          activeView.scale,
          meteorology,
          rawAotAudit,
          modisAudit,
          dustMambaAudit,
          pixelPrecisionAudit,
          multiscalePixelLockAudit,
          maskAssetManifest,
          compositeOverlayManifest,
          highResolutionSceneSelection,
          confounderEvidence,
          mediumPixelEvidence,
          scaleTransitionTrace,
          adapterOutputContracts,
          realGibsDataRun,
          viirsRawGranuleAudit,
          viirsRawMaskOutput,
          viirsRawFootprintOutput,
          viirsMultichannelOutput,
          viirsLearnedOutput,
          rivasModelOutputImport
        )}</div>
      </aside>
    </section>

    ${realDataModelRunPanel(
      realGibsDataRun,
      viirsRawGranuleAudit,
      viirsRawMaskOutput,
      viirsRawFootprintOutput,
      viirsMultichannelOutput,
      viirsLearnedOutput,
      rivasModelOutputImport
    )}

    ${modelReferencePanel(modisAudit, modisInputContract)}

    ${meteorologyPanel(meteorology)}

    ${highResolutionAuditPanel(highResolutionAudit)}

    ${rawAotAuditPanel(rawAotAudit)}

    ${confounderEvidencePanel(confounderEvidence)}

    <section class="dust-agent-assessment">
      <h2>智能体判断</h2>
      <p id="dustAgentText">
        当前尺度：${escapeHtml(activeView.title)}。${escapeHtml(activeView.agentNote)} 中尺度 overlay 是逐像元、传感器绑定的协同 mask，颜色表示主导模型/证据智能体。多通道 VIIRS 模型先提出沙尘像元，原始 L2 footprint、AOT/Aerosol Type 和 RGB 弱标签智能体再逐像元竞争贡献。高尺度使用同日 SCL 筛选后的 Sentinel-2 AOT + B04/B08 低 NDVI 源区支持，仍明确标注为非沙尘分割。互斥检查采用 fail-closed：烟羽 / 活火 / 火烧区未知不会增加沙尘置信度。
      </p>
    </section>

    <section class="dust-evidence-panel" data-shot="evidence">
      <div class="dust-panel-head">
        <h2>智能体证据链</h2>
        <p>主证据、互证证据、互斥证据和先兆解释按当前尺度切换。</p>
      </div>
      <div class="dust-evidence-grid" id="dustEvidenceGrid">${evidenceColumns(initialShownOutput)}</div>
    </section>

  `;

  const bindMaskLayerButtons = (view, output) => {
    app.querySelectorAll("[data-mask-layer]").forEach((button) => {
      button.addEventListener("click", () => {
        activeMaskLayer = button.dataset.maskLayer || "shape";
        const shownOutput = outputForMaskLayer(view, output, maskComparisons[view.scale], activeMaskLayer);
        app.querySelector("#dustMainMap").innerHTML = mainMap(view, output, maskComparisons[view.scale], activeMaskLayer);
        app.querySelector("#dustEvidenceGrid").innerHTML = evidenceColumns(shownOutput);
        app.querySelector(
          "#dustAgentText"
        ).textContent = `当前尺度：${view.title}。当前 mask 图层：${activeMaskLayer}。${shownOutput.confidence.reason} ${view.agentNote}`;
        bindMaskLayerButtons(view, output);
      });
    });
  };

  const setActive = (scale) => {
    currentScale = scale;
    const view = scaleViews[scale] || scaleViews.medium;
    const output = outputs[view.scale];
    activeMaskLayer =
      view.scale === "medium" && maskComparisons.medium?.coalition
        ? "coalition"
        : view.scale === "medium" && maskComparisons.medium?.multichannel
        ? "multichannel"
        : view.scale === "medium" && maskComparisons.medium?.learned
          ? "learned"
        : view.scale === "medium" && maskComparisons.medium?.rawFootprint
          ? "footprint"
          : view.scale === "medium" && maskComparisons.medium?.rawScience
            ? "raw"
            : "intersection";
    const shownOutput = outputForMaskLayer(view, output, maskComparisons[view.scale], activeMaskLayer);
    app.querySelectorAll("[data-scale]").forEach((item) => item.classList.toggle("is-active", item.dataset.scale === scale));
    app
      .querySelectorAll("[data-scale-preview]")
      .forEach((item) => item.classList.toggle("is-active", item.dataset.scalePreview === scale));
    app.querySelector("#dustScaleDetail").textContent = view.agentNote;
    app.querySelector("#dustMainMap").innerHTML = mainMap(view, output, maskComparisons[view.scale], activeMaskLayer);
    app.querySelector("#dustToolScaleLabel").textContent = `${view.label} · ${view.modelTool}`;
    app.querySelector("#dustToolList").innerHTML = toolCallCards(
      registry.tools,
      view.scale,
      meteorology,
      rawAotAudit,
      modisAudit,
      dustMambaAudit,
      pixelPrecisionAudit,
      multiscalePixelLockAudit,
      maskAssetManifest,
      compositeOverlayManifest,
      highResolutionSceneSelection,
      confounderEvidence,
      mediumPixelEvidence,
      scaleTransitionTrace,
      adapterOutputContracts,
      realGibsDataRun,
      viirsRawGranuleAudit,
      viirsRawMaskOutput,
      viirsRawFootprintOutput,
      viirsMultichannelOutput,
      viirsLearnedOutput,
      rivasModelOutputImport
    );
    app.querySelector("#dustEvidenceGrid").innerHTML = evidenceColumns(shownOutput);
    app.querySelector(
      "#dustAgentText"
    ).textContent = `当前尺度：${view.title}。${view.agentNote} 中尺度 overlay 是逐像元、传感器绑定并按主导智能体贡献着色的协同 mask。多通道 VIIRS 模型提出 active 像元，原始 L2 footprint、气溶胶支持和 RGB 弱标签智能体逐像元竞争；高尺度仍只是同日 Sentinel-2 支持解释。互斥检查采用 fail-closed，未知不会增加沙尘置信度。`;
    bindMaskLayerButtons(view, output);
  };

  app.querySelectorAll("[data-scale], [data-scale-preview]").forEach((button) => {
    button.addEventListener("click", () => setActive(button.dataset.scale || button.dataset.scalePreview));
  });
  bindMaskLayerButtons(activeView, activeOutput);

  window.__dustAgentDebug = {
    registry,
    outputs,
    meteorology,
    maskComparisons,
    rawAotAudit,
    modisAudit,
    sensorModelGate,
    modelContractAudit,
    modisInputContract,
    dustMambaAudit,
    pixelPrecisionAudit,
    multiscalePixelLockAudit,
    maskAssetManifest,
    compositeOverlayManifest,
    highResolutionSceneSelection,
    confounderEvidence,
    mediumPixelEvidence,
    scaleTransitionTrace,
    adapterOutputContracts,
    realGibsDataRun,
    viirsRawGranuleAudit,
    viirsRawMaskOutput,
    viirsRawFootprintOutput,
    viirsMultichannelOutput,
    viirsLearnedOutput,
    rivasModelOutputImport,
    hexiCorridorCase,
    scaleViews,
    setActive,
    setMaskLayer: (layer) => {
      const view = scaleViews[currentScale] || scaleViews.medium;
      const output = outputs[view.scale];
      activeMaskLayer = layer || (view.scale === "medium" && maskComparisons.medium?.coalition ? "coalition" : "shape");
      app.querySelector("#dustMainMap").innerHTML = mainMap(view, output, maskComparisons[view.scale], activeMaskLayer);
      app.querySelector("#dustEvidenceGrid").innerHTML = evidenceColumns(
        outputForMaskLayer(view, output, maskComparisons[view.scale], activeMaskLayer)
      );
      bindMaskLayerButtons(view, output);
    },
    getScreenshotTargets: () => [...document.querySelectorAll("[data-shot]")].map((node) => node.dataset.shot),
  };
}

async function bootstrap() {
  const [
    registryResponse,
    exampleResponse,
    meteorologyResponse,
    rawAotAuditResponse,
    modisAuditResponse,
    sensorModelGateResponse,
    modelContractAuditResponse,
    modisInputContractResponse,
    dustMambaAuditResponse,
    pixelPrecisionAuditResponse,
    multiscalePixelLockAuditResponse,
    maskAssetManifestResponse,
    compositeOverlayManifestResponse,
    highResolutionSceneSelectionResponse,
    confounderEvidenceResponse,
    adapterOutputContractsResponse,
    realGibsDataRunResponse,
    viirsRawGranuleAuditResponse,
    viirsRawMaskOutputResponse,
    viirsRawFootprintOutputResponse,
    viirsMultichannelOutputResponse,
    viirsLearnedOutputResponse,
    rivasModelOutputImportResponse,
  ] = await Promise.all([
    fetch("./src/dust/tools/dust_tool_registry.json"),
    fetch("./src/dust/examples/dust_mask_example.json"),
    fetch("./src/dust/examples/dust_meteorology_evidence.json"),
    fetch("./src/dust/examples/sentinel2_aot_raw_audit.json"),
    fetch("./src/dust/examples/modis_3dcnn_local_audit.json"),
    fetch("./src/dust/examples/dust_sensor_model_gate.json"),
    fetch("./src/dust/examples/dust_model_contract_audit.json"),
    fetch("./src/dust/examples/modis_3dcnn_input_contract.json"),
    fetch("./src/dust/examples/dust_mamba_repo_audit.json"),
    fetch("./src/dust/examples/hexi_pixel_precision_audit.json"),
    fetch("./src/dust/examples/hexi_multiscale_pixel_lock_audit.json"),
    fetch("./src/dust/examples/hexi_mask_asset_manifest.json"),
    fetch("./src/dust/examples/hexi_composite_overlay_manifest.json"),
    fetch("./src/dust/examples/hexi_high_resolution_scene_selection.json"),
    fetch("./src/dust/examples/hexi_confounder_evidence.json"),
    fetch("./src/dust/examples/dust_model_adapter_output_contracts.json"),
    fetch("./src/dust/examples/hexi_real_gibs_data_run.json"),
    fetch("./src/dust/examples/viirs_deep_blue_raw_granule_audit.json"),
    fetch("./src/dust/examples/viirs_deep_blue_raw_mask_output.json"),
    fetch("./src/dust/examples/viirs_deep_blue_raw_footprint_mask_output.json"),
    fetch("./src/dust/examples/viirs_multichannel_segmentation_output.json"),
    fetch("./src/dust/examples/viirs_element84_style_learned_output.json"),
    fetch("./src/dust/examples/rivas_3dcnn_model_output_import.json"),
  ]);
  const registry = await registryResponse.json();
  const example = await exampleResponse.json();
  const meteorology = await meteorologyResponse.json();
  const rawAotAudit = await rawAotAuditResponse.json();
  const modisAudit = await modisAuditResponse.json();
  const sensorModelGate = await sensorModelGateResponse.json();
  const modelContractAudit = await modelContractAuditResponse.json();
  const modisInputContract = await modisInputContractResponse.json();
  const dustMambaAudit = await dustMambaAuditResponse.json();
  const pixelPrecisionAudit = await pixelPrecisionAuditResponse.json();
  const multiscalePixelLockAudit = await multiscalePixelLockAuditResponse.json();
  const maskAssetManifest = await maskAssetManifestResponse.json();
  const compositeOverlayManifest = await compositeOverlayManifestResponse.json();
  const highResolutionSceneSelection = await highResolutionSceneSelectionResponse.json();
  const confounderEvidence = await confounderEvidenceResponse.json();
  const adapterOutputContracts = await adapterOutputContractsResponse.json();
  const realGibsDataRun = await realGibsDataRunResponse.json();
  const viirsRawGranuleAudit = await viirsRawGranuleAuditResponse.json();
  const viirsRawMaskOutput = await viirsRawMaskOutputResponse.json();
  const viirsRawFootprintOutput = await viirsRawFootprintOutputResponse.json();
  const viirsMultichannelOutput = await viirsMultichannelOutputResponse.json();
  const viirsLearnedOutput = await viirsLearnedOutputResponse.json();
  const rivasModelOutputImport = await rivasModelOutputImportResponse.json();
  const derivedMasks = {};
  for (const [key, view] of Object.entries(scaleViews)) {
    if (view.mask.derivation === "gibs-rendered-threshold" || view.mask.derivation === "gibs-rendered-intersection") {
      try {
        derivedMasks[key] = await deriveRenderedProductMask(view);
      } catch (error) {
        derivedMasks[key] = null;
        console.warn(`Dust mask derivation failed for ${key}: ${error.message || error}`);
      }
    }
  }
  const outputs = Object.fromEntries(
    Object.entries(scaleViews).map(([key, view]) => [
      key,
      buildScaleOutput(example, view, derivedMasks[key], meteorology),
    ])
  );
  const maskComparisons = {};
  const mediumView = scaleViews.medium;
  if (mediumView.mask.derivationRequests?.length > 1) {
    const aotOnlyView = {
      ...mediumView,
      mask: {
        ...mediumView.mask,
        derivation: "gibs-rendered-threshold",
        derivationToolId: "gibs_rendered_deep_blue_threshold_adapter",
        derivationLabel: "GIBS rendered Deep Blue AOT threshold adapter",
        derivationRequests: [mediumView.mask.derivationRequests[0]],
      },
      outputStatus: "real GIBS corrected-reflectance basemap, rendered Deep Blue AOT threshold mask",
    };
    try {
      const aotOnlyMask = await deriveRenderedProductMask(aotOnlyView);
      const baseline = buildScaleOutput(example, aotOnlyView, aotOnlyMask, meteorology);
      const refined = outputs.medium;
      const shapeFiltered = buildShapeFilteredOutput(refined);
      outputs.medium = shapeFiltered;
      const removedCells = baseline.mask.display_grid.cells.length - refined.mask.display_grid.cells.length;
      const removed = buildRemovedCandidateOutput(baseline, refined);
      const shapeRemovedCells = refined.mask.display_grid.cells.length - shapeFiltered.mask.display_grid.cells.length;
      maskComparisons.medium = {
        baseline,
        refined,
        shapeFiltered,
        removed,
        removedCells,
        reductionPercent: Number(((removedCells / Math.max(1, baseline.mask.display_grid.cells.length)) * 100).toFixed(1)),
        shapeRemovedCells,
        shapeReductionPercent: Number(
          ((shapeRemovedCells / Math.max(1, refined.mask.display_grid.cells.length)) * 100).toFixed(1)
        ),
      };
    } catch (error) {
      console.warn(`Dust mask comparison failed: ${error.message || error}`);
    }
  }
  if (viirsRawMaskOutput) {
    maskComparisons.medium = {
      ...(maskComparisons.medium || {}),
      rawScience: buildRawViirsScienceOutput(outputs.medium, viirsRawMaskOutput),
    };
  }
  if (viirsRawFootprintOutput) {
    const rawFootprint = buildRawViirsFootprintOutput(outputs.medium, viirsRawFootprintOutput);
    maskComparisons.medium = {
      ...(maskComparisons.medium || {}),
      rawFootprint,
    };
    outputs.medium = rawFootprint;
  }
  if (viirsLearnedOutput) {
    const learned = buildViirsLearnedModelOutput(outputs.medium, viirsLearnedOutput);
    maskComparisons.medium = {
      ...(maskComparisons.medium || {}),
      learned,
    };
    outputs.medium = learned;
  }
  if (viirsMultichannelOutput) {
    const multichannel = buildViirsMultichannelModelOutput(outputs.medium, viirsMultichannelOutput);
    maskComparisons.medium = {
      ...(maskComparisons.medium || {}),
      multichannel,
    };
    outputs.medium = multichannel;
  }
  if (maskComparisons.medium?.multichannel) {
    const coalition = buildMultiAgentCoalitionOutput(maskComparisons.medium);
    if (coalition) {
      maskComparisons.medium = {
        ...(maskComparisons.medium || {}),
        coalition,
      };
      outputs.medium = coalition;
    }
  }
  outputs.high = buildHighResolutionAotOutput(outputs.high, rawAotAudit);
  const mediumPixelEvidence = buildMediumPixelEvidence(maskComparisons.medium, meteorology);
  const scaleTransitionTrace = buildScaleTransitionTrace({
    outputs,
    mediumPixelEvidence,
    multiscalePixelLockAudit,
    highResolutionSceneSelection,
    meteorology,
    confounderEvidence,
  });
  renderPage({
    registry,
    outputs,
    meteorology,
    maskComparisons,
    rawAotAudit,
    modisAudit,
    sensorModelGate,
    modelContractAudit,
    modisInputContract,
    dustMambaAudit,
    pixelPrecisionAudit,
    multiscalePixelLockAudit,
    maskAssetManifest,
    compositeOverlayManifest,
    highResolutionSceneSelection,
    confounderEvidence,
    mediumPixelEvidence,
    scaleTransitionTrace,
    adapterOutputContracts,
    realGibsDataRun,
    viirsRawGranuleAudit,
    viirsRawMaskOutput,
    viirsRawFootprintOutput,
    viirsMultichannelOutput,
    viirsLearnedOutput,
    rivasModelOutputImport,
  });
}

bootstrap().catch((error) => {
  app.innerHTML = `<div class="dust-error">Dust page failed to load: ${escapeHtml(error.message || error)}</div>`;
});
