function formatPercent(value) {
  return `${Math.round((Number(value) || 0) * 100)}%`;
}

function confidenceBand(confidence = 0) {
  const safeConfidence = Number(confidence) || 0;

  if (safeConfidence >= 85) {
    return {
      label: "高可信",
      explanation: "当前观测条件与处理链路都比较稳定，适合支持较强结论。",
    };
  }

  if (safeConfidence >= 70) {
    return {
      label: "可用可信",
      explanation: "适合支撑异常筛查、空间分布判断和后续任务编排。",
    };
  }

  if (safeConfidence >= 55) {
    return {
      label: "谨慎解读",
      explanation: "可以用于发现重点异常，但更适合作为后续复核线索。",
    };
  }

  return {
    label: "低可信",
    explanation: "当前更适合作为候选提示，不宜直接做定量性结论。",
  };
}

function buildResourceNote(agentRun, baselineRun) {
  if (agentRun.result.success && !baselineRun.success) {
    return "固定流程在关键步骤前就失败了，因此它的预算占比可能更低，但那是因为它没有真正完成核心处理；智能体虽然额外花费了一些资源，却换来了任务成功和可交付结果。";
  }

  if (
    agentRun.result.metrics.budgetUsage > baselineRun.metrics.budgetUsage ||
    agentRun.result.metrics.powerUsage > baselineRun.metrics.powerUsage
  ) {
    return "当智能体的时延或功耗占比更高时，通常意味着它主动执行了去云、重点区精细处理或质量复核等必要步骤。这些额外成本主要是在换取结果可用性。";
  }

  return "当智能体的资源占比更低时，说明它通过重点区域优先和流程重排压缩了不必要开销，而不是简单减少处理步骤。";
}

function buildBoundaryCopy(task, outputProduct) {
  if (outputProduct === "anomaly-heatmap") {
    return {
      strong: "异常热区结果",
      detail: "适合快速筛查异常位置，不代表连续物理量反演。",
      note: "当前输出已经主动降级为异常热区结果，它强调的是“哪里值得优先关注”，不应按高精度定量产品去解读。",
    };
  }

  if (outputProduct === "thermal-hotspot-map") {
    return {
      strong: "热异常热点图",
      detail: "适合确认热点位置与空间分布，不代表火强、过火面积等深度反演结果。",
      note: "当前输出属于热异常热点确认产品，它强调的是“哪里存在稳定热点、哪里值得继续复核”，不应直接当作火行为或灾损深度反演结果。",
    };
  }

  if (task?.category === "大气异常") {
    return {
      strong: "连续反演原型",
      detail: "适合看异常强弱和空间分布，不宣称最终高精度物理量。",
      note: "当前输出属于大气异常连续反演/强度估计原型，更适合判断异常强弱和空间分布，不应直接当作最终高精度物理量产品。",
    };
  }

  return {
    strong: "任务专用结果",
    detail: "可用于当前任务研判，但仍需结合场景上下文解释。",
    note: "当前输出已经进入任务专用结果阶段，可用于当前任务研判，但仍需要结合观测条件、场景背景和后续复核结果综合解释。",
  };
}

function buildActionNote(agentRun) {
  const outputProduct = agentRun.result.state.outputProduct;
  const repairs = agentRun.result.state.repairs?.length ?? 0;
  const fastMode = Boolean(agentRun.result.state.flags?.fastMode);
  const processedRois = agentRun.result.metrics?.processedRois ?? 0;

  if (outputProduct === "anomaly-heatmap") {
    if (processedRois === 0) {
      return "智能体这次没有强行输出异常标记，而是保留空热区结果，避免把云区或低可信纹理误判成异常。";
    }
    return "智能体主动从定量反演退回到异常热区输出，核心目的是避免在观测条件不理想时给出过度确定的连续数值。";
  }

  if (outputProduct === "thermal-hotspot-map") {
    return repairs > 0
      ? `系统在执行中做了 ${repairs} 次修复，但最终仍保持为热异常热点确认链路，说明智能体没有把热异常任务误路由到连续反演。`
      : "智能体为当前任务选择了官方热异常热点确认链路，先生成热点图，再把热点簇留给后续局部复核或专题推演。";
  }

  if (repairs > 0) {
    return `本次执行了 ${repairs} 次策略修复，说明系统不是机械套用固定流程，而是在观测条件变化后自动插入清洗或重路由动作，优先保证结果可用性。`;
  }

  if (fastMode) {
    return "当前链路切换到了重点区域快速反演模式，系统用更少的预算保住了关键异常区的处理优先级。";
  }

  return "本次主链没有触发额外修复，说明当前区域、时间和观测质量足以支撑默认处理路径。";
}

function buildGateSummary(gate = {}) {
  const maskSummary =
    gate.maskFiles > 0
      ? `本次还参考了 ${gate.maskFiles} 个官方云掩膜文件，掩膜可用度约 ${formatPercent(gate.maskConfidence)}。`
      : "当前没有检索到官方云掩膜文件，可信度主要来自场景先验与门禁估计。";

  const decloudSummary = gate.decloudApplied
    ? "异常提取已经限制在去云后的有效区域内。"
    : "当前异常提取还没有形成稳定的去云有效区域，应谨慎解读。";

  const alignmentSummary =
    gate.alignmentScore === null || gate.alignmentScore === undefined
      ? ""
      : gate.alignmentScore >= 0.58
        ? `底图与分析层对齐分数 ${Math.round(gate.alignmentScore * 100)}%，当前处于可接受对齐状态。`
        : `底图与分析层对齐分数 ${Math.round(gate.alignmentScore * 100)}%，当前仍需谨慎做目视比对。`;

  return `${maskSummary}${decloudSummary}${alignmentSummary}`;
}

export function buildOperationalResultInterpretation({
  task,
  gate,
  agentRun,
  baselineRun,
}) {
  const confidence = agentRun?.result?.metrics?.confidence ?? 0;
  const processedRois = agentRun?.result?.metrics?.processedRois ?? 0;
  const outputProduct = agentRun?.result?.state?.outputProduct;
  const boundary = buildBoundaryCopy(task, outputProduct);
  const confidenceSummary = confidenceBand(confidence);
  const gateSummary = buildGateSummary(gate);
  const productLabel =
    outputProduct === "anomaly-heatmap"
      ? "异常热区结果"
      : outputProduct === "thermal-hotspot-map"
        ? "热异常热点图"
        : "连续反演结果";

  return {
    metric: {
      title: "结果边界",
      strong: boundary.strong,
      detail: boundary.detail,
    },
    notes: [
      {
        title: "资源解读",
        detail: buildResourceNote(agentRun, baselineRun),
      },
      {
        title: "可信度来源",
        detail: `本次结果置信度 ${confidence}%，属于“${confidenceSummary.label}”。去云后有效区域 ${formatPercent(
          gate?.validPixelRatio
        )}，有效质量 ${formatPercent(gate?.effectiveQuality)}，系统对 ${processedRois} 个重点区域生成了${productLabel}。${confidenceSummary.explanation}${gateSummary}`,
      },
      {
        title: "结果边界",
        detail: boundary.note,
      },
      {
        title: "智能体动作",
        detail: buildActionNote(agentRun),
      },
    ],
  };
}
