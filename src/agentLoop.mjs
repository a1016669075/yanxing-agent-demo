import { buildSpatialStrategy } from "./agentDecision.mjs";

function safeJoin(items = [], fallback = "等待智能体生成") {
  return Array.isArray(items) && items.length ? items.join(" -> ") : fallback;
}

function executionSummary(report, options) {
  if (!report) {
    return {
      strong: "等待开始执行",
      detail: `智能体将在 ${options?.budgetMin ?? "-"} 分钟预算内组织执行链路。`,
      state: "waiting",
    };
  }

  if (report.mode === "planning") {
    return {
      strong: "已生成求解方案",
      detail: "当前任务以规划模式输出策略，不伪造尚未接入的端到端结果。",
      state: "planned",
    };
  }

  const repairs = report.agentResult?.state?.repairs?.length ?? 0;
  return {
    strong: report.agentResult?.success ? "已完成执行" : "执行受阻",
    detail: `本次运行完成 ${repairs} 次策略调整，输出 ${report.agentResult?.state?.outputProduct ?? "结果摘要"}。`,
    state: report.agentResult?.success ? "success" : "blocked",
  };
}

function reflectionSummary(report, gate) {
  if (!report) {
    return {
      strong: "等待回流经验",
      detail: "执行完成后，智能体会记录本次区域、质量门禁和策略选择，作为下一次任务的经验。",
      state: "waiting",
    };
  }

  if (report.mode === "planning") {
    return {
      strong: "记录规划骨架",
      detail: `当前先沉淀“${gate.label} -> 数据选择 -> 模型工具组织”的求解骨架，后续接入真实模型时直接复用。`,
      state: "planned",
    };
  }

  return {
    strong: report.agentResult?.success ? "已写回经验记忆" : "已记录失败路径",
    detail: report.agentResult?.success
      ? `当前结果置信度为 ${report.agentResult?.metrics?.confidence ?? "-"}%，后续会优先复用本次有效策略。`
      : "本次失败路径和降级方式已记录，后续遇到相似场景会提前规避。",
    state: report.agentResult?.success ? "success" : "warn",
  };
}

export function buildAgentLoopSnapshot({ task, scenario, gate, model, plan, report, options }) {
  const spatialStrategy = buildSpatialStrategy({
    rois: [],
    anomalyDensity: 0,
    sensor: "",
    ...scenario,
  });
  const execution = executionSummary(report, options);
  const reflection = reflectionSummary(report, gate);
  const mode = report?.mode ?? (task?.status === "ready" ? "operational" : "planning");

  return {
    mode,
    stages: [
      {
        key: "perception",
        title: "感知",
        strong: scenario.focusSelection?.label ?? scenario.title,
        detail: `${scenario.imagery?.sourceLabel ?? "等待底图"}，并结合 ${scenario.analysis?.sourceLabel ?? "异常先验"} 理解当前区域。`,
        state: "active",
      },
      {
        key: "planning",
        title: "规划",
        strong: spatialStrategy.title,
        detail: `${task.label} · ${model?.label ?? "等待模型路由"} · ${gate.label}。${safeJoin(plan?.steps?.slice(0, 3), spatialStrategy.detail)}`,
        state: mode === "planning" ? "planned" : "active",
      },
      {
        key: "action",
        title: "执行",
        strong: execution.strong,
        detail: execution.detail,
        state: execution.state,
      },
      {
        key: "reflection",
        title: "反思",
        strong: reflection.strong,
        detail: reflection.detail,
        state: reflection.state,
      },
    ],
  };
}
