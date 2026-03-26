export function buildPlanningMissionSnapshot({ task, scenario, gate, options, focusScaleLabel = "当前区域" }) {
  const dataLine = task.dataSources.slice(0, 3).join(" / ");
  const toolLine = task.modelTools.slice(0, 3).join(" / ");

  return {
    workflowLabel: `规划态：${task.label} 智能体求解链路`,
    steps: [
      {
        title: "数据发现",
        detail: `围绕${focusScaleLabel}优先检索 ${dataLine}，并根据区域尺度决定是先做广域筛查还是直接进入局部高分链路。`,
      },
      {
        title: "去云与质量门禁",
        detail: `${task.cloudRule} 当前门禁结论：${gate.label}。`,
      },
      {
        title: "模型与工具组织",
        detail: `调用 ${toolLine} 形成任务专用工作流，并根据质量结果决定是否需要降级输出。`,
      },
      {
        title: "结果组织与交付",
        detail: `只对去云后的有效区域输出结果产品、矢量摘要和下传建议，避免把无效像元纳入最终结论。`,
      },
    ],
    narrative: [
      `当前选择的任务“${task.label}”尚未完全接成可在线执行的端到端模型链路，因此智能体先进入规划模式，输出一套可解释的求解方案。`,
      `规划仍然围绕真实区域与真实观测条件展开：系统已经拿到了${scenario.imagery.sourceLabel}和当前场景质量信息，并把它们作为后续任务求解的上下文。`,
      `对这类任务来说，关键不是一开始就全域跑重模型，而是先完成去云和质量门禁，再在有效区域上调用更合适的遥感模型或工具。`,
    ],
    metrics: [
      {
        title: "当前状态",
        strong: "规划模式",
        detail: `${task.statusLabel} · 当前输出的是智能体求解方案而不是最终反演结果。`,
      },
      {
        title: "建议数据链路",
        strong: dataLine,
        detail: `结合当前区域和 ${options.budgetMin} 分钟预算，系统会优先组织这些数据源。`,
      },
      {
        title: "建议模型工具",
        strong: toolLine,
        detail: "这些模型或工具将作为后续真实执行链路的核心组件。",
      },
      {
        title: "去云后有效区域",
        strong: `${Math.round((gate.validPixelRatio || 0) * 100)}%`,
        detail: "后续正式模型只在这部分有效区域上执行。",
      },
    ],
  };
}
