export const workflowLibrary = {
  dust_priority: {
    id: "dust_priority",
    label: "沙尘重点反演流程",
    description: "适合沙尘任务，先做候选区排序，再进入标准反演。",
    steps: [
      "ingest_scene",
      "quality_screen",
      "detect_hotspots",
      "prioritize_rois",
      "dust_inversion_standard",
      "uncertainty_check",
      "package_alert",
    ],
  },
  pollution_standard: {
    id: "pollution_standard",
    label: "污染标准流程",
    description: "默认污染处理流程，适合质量中等且预算可控的场景。",
    steps: [
      "ingest_scene",
      "quality_screen",
      "detect_hotspots",
      "prioritize_rois",
      "pollution_inversion_standard",
      "uncertainty_check",
      "package_alert",
    ],
  },
  budget_guarded_fast: {
    id: "budget_guarded_fast",
    label: "预算受限快速流程",
    description: "优先控制时延和功耗，采用更少 ROI 和更快的反演步骤。",
    steps: [
      "ingest_scene",
      "detect_hotspots",
      "prioritize_rois",
      "fast_roi_inversion",
      "package_alert",
    ],
  },
  degraded_heatmap_only: {
    id: "degraded_heatmap_only",
    label: "降级热区输出流程",
    description: "当质量不足时，不再强行定量反演，只输出热区结果和告警摘要。",
    steps: [
      "ingest_scene",
      "detect_hotspots",
      "generate_heatmap_only",
      "package_alert",
    ],
  },
};

export const toolCatalog = {
  ingest_scene: {
    label: "读取场景",
    summary: "读取场景元数据和任务指令，初始化星上预算。",
  },
  quality_screen: {
    label: "质量筛查",
    summary: "检查云污染和辐射质量，判断能否直接进入反演。",
  },
  cloud_mask: {
    label: "云掩膜修复",
    summary: "在质量问题出现后插入云掩膜步骤，修复污染区域。",
  },
  detect_hotspots: {
    label: "异常区域检测",
    summary: "识别高风险大气异常候选区。",
  },
  prioritize_rois: {
    label: "重点区域排序",
    summary: "根据时延、功耗和下传策略确定 Top-K 反演区域。",
  },
  dust_inversion_standard: {
    label: "沙尘标准反演",
    summary: "对沙尘任务执行标准定量反演。",
  },
  pollution_inversion_standard: {
    label: "污染标准反演",
    summary: "对污染任务执行标准定量反演。",
  },
  fast_roi_inversion: {
    label: "快速重点反演",
    summary: "只对有限 ROI 运行快速反演，优先保证时延。",
  },
  uncertainty_check: {
    label: "结果可信度检查",
    summary: "评估当前结果是否值得下传为定量产品。",
  },
  generate_heatmap_only: {
    label: "生成热区结果",
    summary: "降级为异常热区产品，保留预警价值。",
  },
  package_alert: {
    label: "封装星上输出",
    summary: "封装本次处理结果并估算下传负载。",
  },
};
