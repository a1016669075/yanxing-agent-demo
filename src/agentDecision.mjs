function defaultTypeLabel(type) {
  return (
    {
      dust: "沙尘任务",
      pollution: "污染任务",
      mixed: "复合任务",
    }[type] ?? type
  );
}

export function buildSpatialStrategy(scenario) {
  if (scenario.focusSelection?.strategyText) {
    return {
      title: scenario.focusSelection.scaleLabel,
      detail: scenario.focusSelection.strategyText,
    };
  }

  if ((scenario.rois?.length ?? 0) >= 4 || (scenario.anomalyDensity ?? 0) >= 0.1) {
    return {
      title: "先全域筛查，再局部精细处理",
      detail: `当前候选区 ${scenario.rois?.length ?? 0} 个，智能体会先压缩到更少的重点 ROI 后再进入反演。`,
    };
  }

  if ((scenario.sensor || "").includes("Sentinel")) {
    return {
      title: "优先高分辨率局部分析",
      detail: "当前区域尺度较小，可直接把高分辨率数据和精细模型投入到目标区域。",
    };
  }

  return {
    title: "优先中低分辨率稳定扫查",
    detail: "当前区域范围较大，系统会先用更稳定的中低分辨率链路做异常筛查。",
  };
}

function normalizePlanSteps(plan) {
  if (!Array.isArray(plan?.steps)) {
    return [];
  }

  return plan.steps
    .map((step) => {
      if (typeof step === "string") {
        return step;
      }

      if (step?.title) {
        return step.title;
      }

      if (step?.detail) {
        return step.detail;
      }

      return "";
    })
    .filter(Boolean)
    .slice(0, 4);
}

function buildExecutionNote({ report, options, productLabel, downlinkLabel }) {
  if (!report) {
    return {
      title: "执行出口",
      detail: `等待开始演示后生成最终输出 · ${options.budgetMin} 分钟预算 · ${downlinkLabel(options.downlinkPolicy)}`,
    };
  }

  if (report.mode === "planning") {
    const stepCount = Array.isArray(report.planning?.steps) ? report.planning.steps.length : 0;
    return {
      title: "执行出口",
      detail: `当前输出为智能体求解方案，已整理 ${stepCount} 个规划步骤 · ${options.budgetMin} 分钟预算 · ${downlinkLabel(options.downlinkPolicy)}`,
    };
  }

  const outputProduct = report.agentResult?.state?.outputProduct;
  const repairs = report.agentResult?.state?.repairs?.length ?? 0;
  return {
    title: "执行出口",
    detail: `${productLabel(outputProduct)} · ${repairs} 次修复 · ${options.budgetMin} 分钟预算 · ${downlinkLabel(options.downlinkPolicy)}`,
  };
}

export function buildDecisionMemoryCueSummary({ episodes = [], scenario, options, plan, labels = {} }) {
  if (!Array.isArray(episodes) || episodes.length === 0) {
    return null;
  }

  const latest = episodes[0];
  const productLabel = labels.productLabel || ((value) => value || "结果待生成");
  const downlinkLabel = labels.downlinkLabel || ((value) => value);
  const changes = [];

  const latestScale = latest.focusSelection?.scaleLabel || "预设区域";
  const currentScale = scenario?.focusSelection?.scaleLabel || "预设区域";
  if (latestScale !== currentScale) {
    changes.push(`空间尺度从 ${latestScale} 调整为 ${currentScale}`);
  }

  const latestBudget = Number(latest.options?.budgetMin);
  if (Number.isFinite(latestBudget) && Number.isFinite(options?.budgetMin) && latestBudget !== options.budgetMin) {
    const diff = options.budgetMin - latestBudget;
    changes.push(diff < 0 ? `时延预算减少 ${Math.abs(diff)} 分钟` : `时延预算增加 ${diff} 分钟`);
  }

  if (latest.options?.downlinkPolicy && latest.options.downlinkPolicy !== options?.downlinkPolicy) {
    changes.push(`下传策略改为 ${downlinkLabel(options.downlinkPolicy)}`);
  }

  if (latest.workflow?.label && plan?.workflowLabel && latest.workflow.label !== plan.workflowLabel) {
    changes.push(`工作流由 ${latest.workflow.label} 调整为 ${plan.workflowLabel}`);
  }

  const deltaText = changes.length
    ? `本次相较最近案例：${changes.join("；")}。`
    : "本次策略与最近成功案例基本一致，系统会优先复用这条路线。";

  return {
    strong: `最近 ${episodes.length} 个相似案例`,
    detail: `${latest.focusSelection?.label || latest.scenarioTitle} · ${productLabel(latest.outputProduct)} · 置信 ${latest.confidence}% · ${latest.insight} ${deltaText}`,
  };
}

function buildMemoryCard(memoryCue = null) {
  if (!memoryCue) {
    return {
      key: "memory",
      title: "经验回写",
      strong: "暂无相似经验",
      detail: "当前还没有同任务同尺度的历史案例，本次将主要依据实时观测、去云门禁和在线规划做决策。",
    };
  }

  return {
    key: "memory",
    title: "经验回写",
    strong: memoryCue.strong,
    detail: memoryCue.detail,
  };
}

export function buildAgentDecisionSnapshot({
  scenario,
  options,
  gate,
  plan,
  model,
  report,
  memoryCue = null,
  labels = {},
}) {
  const typeLabel = labels.typeLabel || defaultTypeLabel;
  const downlinkLabel = labels.downlinkLabel || ((value) => value);
  const productLabel = labels.productLabel || ((value) => value || "结果待生成");
  const mainSteps = normalizePlanSteps(plan);
  const spatialStrategy = buildSpatialStrategy(scenario);

  return {
    cards: [
      {
        key: "task",
        title: "任务解释",
        strong: `${typeLabel(scenario.type)} · ${scenario.title}`,
        detail: scenario.mission,
      },
      {
        key: "data",
        title: "数据选择",
        strong: scenario.imagery.sourceLabel,
        detail: `${scenario.analysis.sourceLabel} · ${scenario.sensor}`,
      },
      {
        key: "gate",
        title: "观测门禁",
        strong: gate.label,
        detail: `${gate.recommendedAction} 所有定量模型默认只在去云后的有效区域上执行。`,
        state: gate.state,
      },
      {
        key: "workflow",
        title: "主流程",
        strong: plan.workflowLabel,
        detail: mainSteps.length ? mainSteps.join(" -> ") : "等待智能体生成主流程",
      },
      {
        key: "model",
        title: "模型路由",
        strong: model?.label || "等待模型路由",
        detail:
          model?.runtimeStatus?.label && model?.description
            ? `${model.runtimeStatus.label} · ${model.description}`
            : "当前将根据任务类型、尺度和质量条件自动选择模型。",
      },
      {
        key: "spatial",
        title: "空间策略",
        strong: spatialStrategy.title,
        detail: spatialStrategy.detail,
      },
      buildMemoryCard(memoryCue),
    ],
    note: buildExecutionNote({
      report,
      options,
      productLabel,
      downlinkLabel,
    }),
  };
}
